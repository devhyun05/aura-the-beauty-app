from __future__ import annotations

from typing import Any


SERVING_CUT_FLAGS = frozenset(
  {
    "refill_copy",
    "mini_or_sample_copy",
    "bonus_tool_copy",
    "case_copy",
  },
)
BADGE_FLAGS = frozenset({"bundle_or_set_copy"})
BUNDLE_CAVEAT = "세트/기획 구성 상품이라 단품 구성과 다를 수 있음"


def _quality_flags(item: dict[str, Any]) -> frozenset[str]:
  raw_flags = item.get("qualityFlags")
  if not isinstance(raw_flags, (list, tuple, set, frozenset)):
    return frozenset()
  return frozenset(flag.strip() for flag in raw_flags if isinstance(flag, str) and flag.strip())


def is_quality_cut(item: dict[str, Any]) -> bool:
  """Return whether a catalog or live item must never enter serving."""

  return bool(_quality_flags(item) & SERVING_CUT_FLAGS)


def quality_caveats(item: dict[str, Any]) -> list[str]:
  """Return customer-facing caveats for retained quality flags."""

  return [BUNDLE_CAVEAT] if _quality_flags(item) & BADGE_FLAGS else []
