"""Privacy-safe region contract shared by trend collection, ranking and API code."""

from __future__ import annotations

from typing import Final


NATIONAL_REGION_CODE: Final = "KR-00"
TREND_REGION_LABELS: Final[dict[str, str]] = {
  NATIONAL_REGION_CODE: "전국",
  "KR-11": "서울",
  "KR-26": "부산",
  "KR-27": "대구",
  "KR-28": "인천",
  "KR-29": "광주",
  "KR-30": "대전",
  "KR-31": "울산",
  "KR-41": "경기",
  "KR-42": "강원",
  "KR-43": "충북",
  "KR-44": "충남",
  "KR-45": "전북",
  "KR-46": "전남",
  "KR-47": "경북",
  "KR-48": "경남",
  "KR-49": "제주",
  "KR-50": "세종",
}
TREND_REGION_CODES: Final[tuple[str, ...]] = tuple(TREND_REGION_LABELS)
LOCAL_TREND_REGION_CODES: Final[tuple[str, ...]] = tuple(
  code for code in TREND_REGION_CODES if code != NATIONAL_REGION_CODE
)

# Representative KMA village-forecast grids for each province/metropolitan city.
# Exact coordinates never leave the device; the batch requests only these fixed grids.
KMA_REGION_GRIDS: Final[dict[str, tuple[int, int]]] = {
  "KR-11": (60, 127),
  "KR-26": (98, 76),
  "KR-27": (89, 90),
  "KR-28": (55, 124),
  "KR-29": (58, 74),
  "KR-30": (67, 100),
  "KR-31": (102, 84),
  "KR-41": (60, 120),
  "KR-42": (73, 134),
  "KR-43": (69, 107),
  "KR-44": (68, 100),
  "KR-45": (63, 89),
  "KR-46": (51, 67),
  "KR-47": (89, 91),
  "KR-48": (91, 77),
  "KR-49": (52, 38),
  "KR-50": (66, 103),
}


def normalize_trend_region_code(value: str | None) -> str:
  normalized = str(value or NATIONAL_REGION_CODE).strip().upper()
  return normalized if normalized in TREND_REGION_LABELS else NATIONAL_REGION_CODE
