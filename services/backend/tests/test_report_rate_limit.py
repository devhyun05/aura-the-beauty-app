from uuid import uuid4

import pytest

from app.services.report_rate_limit import enforce_report_generation_limit


class FailOnDatabaseAccess:
  def __getattr__(self, name: str):
    raise AssertionError(f"rate limiter must not access the database: {name}")


@pytest.mark.asyncio
@pytest.mark.parametrize(
  "feature",
  [
    "face_analysis",
    "filter_extraction",
    "makeup_feedback",
    "makeup_recommendation",
  ],
)
async def test_report_generation_is_unlimited_without_database_access(feature: str) -> None:
  await enforce_report_generation_limit(
    FailOnDatabaseAccess(),
    user_id=uuid4(),
    feature=feature,
    per_minute=1,
    per_day=1,
  )
