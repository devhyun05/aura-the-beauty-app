from uuid import uuid4

import pytest

from app.core.settings import Settings
from app.services.makeup_recommendation import enforce_scenario_generation_limit
from app.services.product_rate_limit import PRODUCT_RATE_SCOPES, enforce_product_rate_limit
from app.services.report_rate_limit import (
  REPORT_RATE_FEATURES,
  enforce_report_generation_limit,
)


class ExplodingDatabase:
  async def execute(self, *_args, **_kwargs):
    raise AssertionError("disabled usage limits must not access the database")

  async def fetchrow(self, *_args, **_kwargs):
    raise AssertionError("disabled usage limits must not access the database")


def test_user_feature_usage_limits_are_disabled_by_default() -> None:
  assert Settings().user_feature_usage_limits_enabled is False


@pytest.mark.asyncio
async def test_report_usage_limits_can_be_fully_disabled() -> None:
  db = ExplodingDatabase()
  for feature in REPORT_RATE_FEATURES:
    await enforce_report_generation_limit(
      db,  # type: ignore[arg-type]
      user_id=uuid4(),
      feature=feature,
      per_minute=1,
      per_day=1,
      enabled=False,
    )


@pytest.mark.asyncio
async def test_product_usage_limits_can_be_fully_disabled() -> None:
  db = ExplodingDatabase()
  for scope in PRODUCT_RATE_SCOPES:
    await enforce_product_rate_limit(
      db,  # type: ignore[arg-type]
      user_id=uuid4(),
      scope=scope,
      limit=1,
      enabled=False,
    )


@pytest.mark.asyncio
async def test_scenario_usage_limit_can_be_fully_disabled() -> None:
  await enforce_scenario_generation_limit(
    ExplodingDatabase(),
    uuid4(),
    enabled=False,
  )
