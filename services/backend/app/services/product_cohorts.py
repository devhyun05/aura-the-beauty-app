"""Privacy-thresholded broad color cohort maintenance.

The bucket is derived only from a consented, decayed product preference profile.
It never uses face photos, landmarks, skin tone, or an identity embedding.
"""

from __future__ import annotations

from collections import Counter
import json
from typing import Any
from uuid import UUID

from app.core.settings import Settings
from app.db.session import Database


COOL_COLOR_TERMS = {"rose", "pink", "berry", "plum", "mauve", "wine", "red"}
WARM_COLOR_TERMS = {"coral", "orange", "peach", "brick", "brown", "terracotta"}
NEUTRAL_COLOR_TERMS = {"nude", "beige", "neutral", "taupe", "clear"}


def _payload(value: Any) -> dict[str, Any]:
  if isinstance(value, dict):
    return value
  if isinstance(value, str):
    try:
      parsed = json.loads(value)
      return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
      return {}
  return {}


def broad_color_bucket(preference_payload: Any) -> str | None:
  scores = Counter({"cool": 0.0, "warm": 0.0, "neutral": 0.0})
  for key, raw_score in _payload(preference_payload).items():
    feature, separator, value = str(key).partition(":")
    if feature != "color_family" or not separator:
      continue
    try:
      score = max(0.0, float(raw_score))
    except (TypeError, ValueError):
      continue
    terms = {part for part in value.lower().replace("-", "_").split("_") if part}
    if terms & COOL_COLOR_TERMS:
      scores["cool"] += score
    elif terms & WARM_COLOR_TERMS:
      scores["warm"] += score
    elif terms & NEUTRAL_COLOR_TERMS:
      scores["neutral"] += score
  bucket, score = max(scores.items(), key=lambda item: (item[1], item[0]))
  return bucket if score > 0 else None


def broad_preference_bucket(preference_payload: Any) -> str | None:
  """Prefer broad color, then fall back to a non-sensitive product category."""
  color = broad_color_bucket(preference_payload)
  if color:
    return f"color-{color}"
  categories = Counter()
  for key, raw_score in _payload(preference_payload).items():
    feature, separator, value = str(key).partition(":")
    if feature != "category" or not separator or value not in {"lip", "cheek", "shadow", "liner", "base"}:
      continue
    try:
      categories[value] += max(0.0, float(raw_score))
    except (TypeError, ValueError):
      continue
  if not categories:
    return None
  category, score = max(categories.items(), key=lambda item: (item[1], item[0]))
  return f"category-{category}" if score > 0 else None


async def refresh_color_cohort_memberships(db: Database, settings: Settings) -> dict[str, int]:
  """Refresh memberships; rare buckets merge and still remain API-thresholded."""

  if not settings.cohort_recommendations_v1:
    return {"eligible": 0, "memberships": 0, "mergedRare": 0}
  rows = await db.fetch(
    """
    with latest_consent as (
      select distinct on (user_id) user_id, accepted
      from user_consents where consent_type::text='color_cohort'
      order by user_id, recorded_at desc, id desc
    )
    select p.user_id,p.preference_payload,least(p.source_event_count,100)::int as contribution_count
    from product_preference_profiles p
    join latest_consent c on c.user_id=p.user_id and c.accepted=true
    where p.expires_at>now() and p.source_event_count>0
    """
  )
  candidates: list[tuple[UUID, str, int]] = []
  for row in rows:
    bucket = broad_preference_bucket(row.get("preference_payload"))
    if bucket:
      candidates.append((row["user_id"], bucket, int(row.get("contribution_count") or 0)))
  counts = Counter(bucket for _, bucket, _ in candidates)
  rare = {bucket for bucket, count in counts.items() if count < settings.product_cohort_min_size}

  await db.execute(
    """
    delete from product_color_cohort_memberships m
    where m.expires_at<=now() or coalesce((
      select c.accepted from user_consents c where c.user_id=m.user_id
        and c.consent_type::text='color_cohort'
      order by c.recorded_at desc,c.id desc limit 1
    ),false)=false
    """
  )
  for user_id, bucket, contribution_count in candidates:
    cohort_key = "preference-v2:other" if bucket in rare else f"preference-v2:{bucket}"
    await db.execute(
      """
      insert into product_color_cohort_memberships
        (user_id,cohort_key,bucket_version,contribution_count,refreshed_at,expires_at)
      values ($1,$2,'broad_preference_v2',$3,now(),now() + ($4::int * interval '1 day'))
      on conflict (user_id) do update set cohort_key=excluded.cohort_key,
        bucket_version=excluded.bucket_version,contribution_count=excluded.contribution_count,
        refreshed_at=excluded.refreshed_at,expires_at=excluded.expires_at
      """,
      user_id,
      cohort_key,
      min(100, max(0, contribution_count)),
      settings.product_profile_retention_days,
    )
  return {"eligible": len(rows), "memberships": len(candidates), "mergedRare": sum(counts[key] for key in rare)}
