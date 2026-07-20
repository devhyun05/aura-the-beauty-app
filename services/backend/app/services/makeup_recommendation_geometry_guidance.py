"""Turn trusted 2D geometry envelopes into actionable makeup guidance.

Only semantic relationships cross the recommendation boundary. Raw ratios and
angles remain inside this compiler.
"""

from __future__ import annotations

import math
from typing import Any


MIN_CONFIDENCE = 0.5


def _finite(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  numeric = float(value)
  return numeric if math.isfinite(numeric) else None


def _measured_value(profile: dict[str, Any], key: str) -> tuple[float, float] | None:
  metric = profile.get(key)
  if getattr(getattr(metric, "status", None), "value", None) != "measured":
    return None
  value = _finite(getattr(metric, "value", None))
  confidence = _finite(getattr(metric, "confidence", None)) or 0.0
  if value is None or confidence < MIN_CONFIDENCE:
    return None
  return value, confidence


def _pair_guidance(
  profile: dict[str, Any],
  *,
  left_key: str,
  right_key: str,
  tolerance: float,
  balanced_label: str,
  difference_label: str,
  balanced_use: str,
  difference_use: str,
) -> dict[str, Any] | None:
  left = _measured_value(profile, left_key)
  right = _measured_value(profile, right_key)
  if left is None or right is None:
    return None
  delta = left[0] - right[0]
  if abs(delta) <= tolerance:
    relationship = "balanced"
    label = balanced_label
    makeup_use = balanced_use
  else:
    relationship = "left_greater" if delta > 0 else "right_greater"
    side = "왼쪽" if delta > 0 else "오른쪽"
    label = f"{difference_label}: {side} 쪽이 더 큼"
    makeup_use = difference_use.format(side=side)
  return {
    "label": label,
    "relationship": relationship,
    "makeupUse": makeup_use,
    "confidence": round(min(left[1], right[1]), 3),
    "derivedFrom": [left_key, right_key],
  }


def _brow_apex_guidance(profile: dict[str, Any]) -> dict[str, Any] | None:
  """눈썹 봉우리(산) 위치 0=앞머리..1=꼬리. 이상 ~0.66(한국 여성 실측/전통 안쪽 2/3).

  성별로 이상형이 갈리므로(여성=뚜렷한 아치, 남성=낮고 평평·직선) makeupUse에
  여성/남성 방향을 함께 담아, profileGender를 아는 메이크업 LLM이 골라 쓰게 한다.
  좌우 평균으로 판단하고 측정된 쪽만 derivedFrom에 남긴다.
  """
  left = _measured_value(profile, "geometry2d.browApexRatioLeft")
  right = _measured_value(profile, "geometry2d.browApexRatioRight")
  measured = [side for side in (left, right) if side is not None]
  if not measured:
    return None
  mean_apex = sum(side[0] for side in measured) / len(measured)
  if mean_apex < 0.55:
    relationship = "medial"
    label = "눈썹 산이 안쪽에 위치"
    makeup_use = (
      "산이 앞쪽에 치우쳐 놀란 인상을 줄 수 있어요. 여성은 바깥쪽 아래를 채워 "
      "아치 정점을 눈동자 바깥으로 옮기고, 남성은 결만 정돈해 자연스러운 직선형을 유지하세요."
    )
  elif mean_apex > 0.72:
    relationship = "lateral"
    label = "눈썹 산이 바깥쪽에 위치"
    makeup_use = (
      "산이 꼬리 쪽에 치우쳐 있어요. 여성은 꼬리를 짧게 다듬어 정점을 안쪽으로 당기고, "
      "남성은 아치를 낮춰 평평·직선적으로 정리하세요."
    )
  else:
    relationship = "balanced"
    label = "눈썹 산 위치 균형"
    makeup_use = (
      "산이 안쪽 2/3 지점의 균형 잡힌 위치예요. 여성은 본래 아치를 유지하고, "
      "남성은 과한 아치 없이 결만 정돈하세요."
    )
  return {
    "label": label,
    "relationship": relationship,
    "makeupUse": makeup_use,
    "confidence": round(min(side[1] for side in measured), 3),
    "derivedFrom": [
      key
      for key, side in (
        ("geometry2d.browApexRatioLeft", left),
        ("geometry2d.browApexRatioRight", right),
      )
      if side is not None
    ],
  }


def compile_actionable_geometry_guidance(
  profile: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
  """Compile brow/eye/contour/lip hints without returning biometric values.

  The 2-degree angular and 0.03 balance boundaries reuse the current
  face-analysis semantic rules. Jaw width reuses the current 0.84 boundary.
  """
  brow = [
    _pair_guidance(
      profile,
      left_key="geometry2d.browSlopeLeftDeg",
      right_key="geometry2d.browSlopeRightDeg",
      tolerance=2.0,
      balanced_label="좌우 눈썹 기울기 균형",
      difference_label="좌우 눈썹 기울기 차이",
      balanced_use="본래 눈썹 결을 유지하며 빈 곳만 채우세요.",
      difference_use="{side} 눈썹의 최고점과 꼬리 각도를 반대쪽과 연결되도록 소량씩 보정하세요.",
    ),
    _pair_guidance(
      profile,
      left_key="geometry2d.eyeBrowGapLeft",
      right_key="geometry2d.eyeBrowGapRight",
      tolerance=0.03,
      balanced_label="좌우 눈썹-눈 간격 균형",
      difference_label="좌우 눈썹-눈 간격 차이",
      balanced_use="양쪽 눈썹 하단선을 같은 강도로 정리하세요.",
      difference_use="{side} 쪽 간격이 더 넓으므로 눈썹 하단과 아이 음영 높이를 조금씩 맞추세요.",
    ),
    _brow_apex_guidance(profile),
  ]
  eye = [
    _pair_guidance(
      profile,
      left_key="geometry2d.canthalTiltLeftDeg",
      right_key="geometry2d.canthalTiltRightDeg",
      tolerance=2.0,
      balanced_label="좌우 눈꼬리 방향 균형",
      difference_label="좌우 눈꼬리 방향 차이",
      balanced_use="아이라인 꼬리의 각도와 길이를 같은 방향으로 유지하세요.",
      difference_use="{side} 쪽 아이라인 각도를 먼저 잡고 반대쪽은 짧은 선으로 맞추세요.",
    ),
    _pair_guidance(
      profile,
      left_key="geometry2d.eyeOpennessLeft",
      right_key="geometry2d.eyeOpennessRight",
      tolerance=0.03,
      balanced_label="좌우 눈 뜬 높이 균형",
      difference_label="좌우 눈 뜬 높이 차이",
      balanced_use="양쪽 세로 음영과 마스카라 양을 같은 강도로 유지하세요.",
      difference_use="{side} 쪽 세로 음영은 얇게 하고 반대쪽 중앙 음영을 조금 더 보강하세요.",
    ),
    _pair_guidance(
      profile,
      left_key="geometry2d.eyeWidthRatioLeft",
      right_key="geometry2d.eyeWidthRatioRight",
      tolerance=0.03,
      balanced_label="좌우 눈 가로 길이 균형",
      difference_label="좌우 눈 가로 길이 차이",
      balanced_use="양쪽 아이라인 꼬리 길이를 동일하게 마무리하세요.",
      difference_use="{side} 쪽 꼬리는 짧게, 반대쪽은 바깥 음영을 조금 더 연결하세요.",
    ),
  ]

  contour: list[dict[str, Any]] = []
  jaw = _measured_value(profile, "geometry2d.jawWidthRatio")
  lower_jaw = _measured_value(profile, "geometry2d.lowerJawWidthRatio")
  if jaw is not None:
    strong = jaw[0] >= 0.84
    contour.append({
      "label": "턱선 너비 강조" if strong else "턱선 너비 균형",
      "relationship": "strong" if strong else "balanced",
      "makeupUse": (
        "턱 바깥선을 더 넓게 강조하지 말고 쉐딩 경계를 부드럽게 안쪽으로 연결하세요."
        if strong else
        "얼굴형 보고서와 함께 턱 바깥선 안쪽에 얇은 쉐딩을 연결하세요."
      ),
      "confidence": round(jaw[1], 3),
      "derivedFrom": [
        "geometry2d.jawWidthRatio",
        *(["geometry2d.lowerJawWidthRatio"] if lower_jaw is not None else []),
      ],
    })

  lip: list[dict[str, Any]] = []
  mouth_balance = _measured_value(profile, "geometry2d.mouthCornerAsymmetry")
  if mouth_balance is not None:
    balanced = abs(mouth_balance[0]) < 0.03
    lip.append({
      "label": "입꼬리 좌우 균형" if balanced else "입꼬리 좌우 보정 우선",
      "relationship": "balanced" if balanced else "correction_needed",
      "makeupUse": (
        "입술 본래 경계를 유지하고 양쪽 끝의 번짐만 정리하세요."
        if balanced else
        "립 컬러 전에 양쪽 입꼬리 기준선을 맞추고 낮아 보이는 쪽 외곽을 소량 보정하세요."
      ),
      "confidence": round(mouth_balance[1], 3),
      "derivedFrom": ["geometry2d.mouthCornerAsymmetry"],
    })

  lip_proportions = [
    key
    for key in (
      "geometry2d.lipThicknessRatio",
      "geometry2d.mouthWidthRatio",
    )
    if _measured_value(profile, key) is not None
  ]
  if lip_proportions:
    confidence_values = [
      measured[1]
      for key in lip_proportions
      if (measured := _measured_value(profile, key)) is not None
    ]
    lip.append({
      "label": "입술 두께·너비 비율 보존",
      "relationship": "measured_proportion",
      "makeupUse": "본래 입술 비율을 기준으로 과도한 오버립을 피하고 그라데이션 범위를 안쪽부터 조절하세요.",
      "confidence": round(min(confidence_values), 3),
      "derivedFrom": lip_proportions,
    })

  return {
    area: [item for item in items if item is not None]
    for area, items in (
      ("brow", brow),
      ("eye", eye),
      ("contour", contour),
      ("lip", lip),
    )
    if any(item is not None for item in items)
  }
