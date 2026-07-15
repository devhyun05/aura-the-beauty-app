from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.settings import Settings
from app.services.product_cohorts import (
  broad_cohort_bucket,
  broad_personal_color_bucket,
  refresh_color_cohort_memberships,
)


@pytest.mark.parametrize(
  ("label", "expected"),
  (
    ("봄 웜 라이트", "undertone-warm"),
    ("autumn_muted", "undertone-warm"),
    ("여름 쿨", "undertone-cool"),
    ("Winter Bright", "undertone-cool"),
    ("뉴트럴", "undertone-neutral"),
  ),
)
def test_personal_color_label_is_reduced_to_a_broad_undertone(label: str, expected: str) -> None:
  assert broad_personal_color_bucket(label) == expected


def test_personal_color_bucket_rejects_raw_or_ambiguous_payloads() -> None:
  assert broad_personal_color_bucket({"measurements": {"temperature": 0.8}}) is None
  assert broad_personal_color_bucket("warm and cool mixed") is None
  assert broad_personal_color_bucket("") is None


def test_report_undertone_takes_priority_then_falls_back_to_broad_preferences() -> None:
  assert broad_cohort_bucket({"color_family:coral": 4}, "여름 쿨") == "undertone-cool"
  assert broad_cohort_bucket(None, "봄 웜") == "undertone-warm"
  assert broad_cohort_bucket({"category:lip": 2}, None) == "category-lip"
  assert broad_cohort_bucket({"identity_embedding": 100}, None) is None


class _ReportCohortDb:
  def __init__(self) -> None:
    self.included_user_ids = [uuid4() for _ in range(4)]
    self.excluded_user_id = uuid4()
    self.rows = [
      {
        "user_id": self.included_user_ids[0],
        "preference_payload": {"color_family:mauve": 5},
        "personal_color": "여름 쿨",
        "contribution_count": 999,
      },
      {
        "user_id": self.included_user_ids[1],
        "preference_payload": {"color_family:mauve": 4},
        "personal_color": "winter bright",
        "contribution_count": -1,
      },
      {
        "user_id": self.included_user_ids[2],
        "preference_payload": None,
        "personal_color": "봄 웜",
        "contribution_count": 0,
      },
      {
        "user_id": self.included_user_ids[3],
        "preference_payload": None,
        "personal_color": "autumn muted",
        "contribution_count": 0,
      },
      {
        "user_id": self.excluded_user_id,
        "preference_payload": None,
        "personal_color": {"rawFaceMeasurements": True},
        "contribution_count": 0,
      },
    ]
    self.fetch_query = ""
    self.executed: list[tuple[str, tuple[object, ...]]] = []

  async def fetch(self, query: str):
    self.fetch_query = query
    return self.rows

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "OK"


@pytest.mark.asyncio
async def test_refresh_uses_only_latest_safe_report_label_and_keeps_privacy_guards() -> None:
  db = _ReportCohortDb()
  result = await refresh_color_cohort_memberships(
    db,  # type: ignore[arg-type]
    Settings(cohort_recommendations_v1=True, product_cohort_min_size=2),
  )

  assert result == {"eligible": 5, "memberships": 4, "mergedRare": 0}
  query = " ".join(db.fetch_query.lower().split())
  assert "distinct on (user_id)" in query
  assert "where c.accepted=true" in query
  assert "left join product_preference_profiles" in query
  assert "select r.personal_color" in query
  assert "r.status='completed'" in query
  assert "order by r.analyzed_at desc nulls last,r.created_at desc,r.id desc limit 1" in query
  assert "deleted_at" not in query
  assert "detail_payload" not in query
  assert "embedding" not in query
  assert "source_media" not in query

  deletes = [item for item in db.executed if "delete from product_color_cohort_memberships" in item[0]]
  assert len(deletes) == 1
  assert set(deletes[0][1][0]) == set(db.included_user_ids)

  inserts = [item for item in db.executed if "insert into product_color_cohort_memberships" in item[0]]
  assert len(inserts) == 4
  assert [args[1] for _, args in inserts] == [
    "preference-v3:undertone-cool",
    "preference-v3:undertone-cool",
    "preference-v3:undertone-warm",
    "preference-v3:undertone-warm",
  ]
  assert [args[2] for _, args in inserts] == [100, 0, 0, 0]
  assert all("'broad_report_preference_v3'" in query for query, _ in inserts)
