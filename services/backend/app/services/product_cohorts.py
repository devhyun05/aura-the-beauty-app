"""Privacy-thresholded broad color cohort maintenance.

Buckets use only separately consented, broad product preferences and the scalar
personal-color label from the user's latest completed analysis report. They never
load face photos, report detail payloads, landmarks, skin tone, or embeddings.
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
WARM_PERSONAL_COLOR_TERMS = ("warm", "웜", "spring", "봄", "autumn", "fall", "가을")
COOL_PERSONAL_COLOR_TERMS = ("cool", "쿨", "summer", "여름", "winter", "겨울")
NEUTRAL_PERSONAL_COLOR_TERMS = ("neutral", "뉴트럴")


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
    if feature != "category" or not separator or value not in {"lip", "cheek", "shadow", "liner", "base", "brow"}:
      continue
    try:
      categories[value] += max(0.0, float(raw_score))
    except (TypeError, ValueError):
      continue
  if not categories:
    return None
  category, score = max(categories.items(), key=lambda item: (item[1], item[0]))
  return f"category-{category}" if score > 0 else None


def broad_personal_color_bucket(personal_color: Any) -> str | None:
  """Reduce a report label to one broad, non-identifying undertone bucket."""
  if not isinstance(personal_color, str):
    return None
  label = personal_color.strip().casefold()
  if not label:
    return None
  signals = {
    bucket
    for bucket, terms in (
      ("warm", WARM_PERSONAL_COLOR_TERMS),
      ("cool", COOL_PERSONAL_COLOR_TERMS),
      ("neutral", NEUTRAL_PERSONAL_COLOR_TERMS),
    )
    if any(term in label for term in terms)
  }
  if len(signals) != 1:
    return None
  return f"undertone-{signals.pop()}"


def broad_cohort_bucket(preference_payload: Any, personal_color: Any = None) -> str | None:
  """Prefer a broad report undertone, then fall back to product preferences."""
  report_bucket = broad_personal_color_bucket(personal_color)
  preference_bucket = broad_preference_bucket(preference_payload)
  return report_bucket or preference_bucket


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
    select c.user_id,p.preference_payload,
      least(coalesce(p.source_event_count,0),100)::int as contribution_count,
      report.personal_color
    from latest_consent c
    left join product_preference_profiles p on p.user_id=c.user_id
      and p.expires_at>now() and p.source_event_count>0
    left join lateral (
      select r.personal_color
      from analysis_reports r
      where r.user_id=c.user_id and r.status='completed'
      order by r.analyzed_at desc nulls last,r.created_at desc,r.id desc
      limit 1
    ) report on true
    where c.accepted=true
    """
  )
  candidates: list[tuple[UUID, str, int]] = []
  for row in rows:
    bucket = broad_cohort_bucket(
      row.get("preference_payload"),
      row.get("personal_color"),
    )
    if bucket:
      candidates.append((row["user_id"], bucket, int(row.get("contribution_count") or 0)))
  counts = Counter(bucket for _, bucket, _ in candidates)
  rare = {bucket for bucket, count in counts.items() if count < settings.product_cohort_min_size}
  candidate_user_ids = [user_id for user_id, _, _ in candidates]

  await db.execute(
    """
    delete from product_color_cohort_memberships m
    where m.expires_at<=now() or coalesce((
      select c.accepted from user_consents c where c.user_id=m.user_id
        and c.consent_type::text='color_cohort'
      order by c.recorded_at desc,c.id desc limit 1
    ),false)=false or not (m.user_id=any($1::uuid[]))
    """,
    candidate_user_ids,
  )
  for user_id, bucket, contribution_count in candidates:
    cohort_key = "preference-v3:other" if bucket in rare else f"preference-v3:{bucket}"
    await db.execute(
      """
      insert into product_color_cohort_memberships
        (user_id,cohort_key,bucket_version,contribution_count,refreshed_at,expires_at)
      values ($1,$2,'broad_report_preference_v3',$3,now(),now() + ($4::int * interval '1 day'))
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
