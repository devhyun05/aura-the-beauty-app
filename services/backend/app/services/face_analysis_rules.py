from collections.abc import Iterable
from statistics import fmean

from app.schemas.face_analysis_v2 import DerivedResult, Insight, MetricEnvelope


RULES_VERSION = "s1-l1-v1"


def _number(metric: MetricEnvelope | None) -> float | None:
  if metric is None or isinstance(metric.value, bool):
    return None
  return float(metric.value) if isinstance(metric.value, (int, float)) else None


def _text(metric: MetricEnvelope | None) -> str | None:
  return metric.value.strip() if metric and isinstance(metric.value, str) and metric.value.strip() else None


def _confidence(profile: dict[str, MetricEnvelope], keys: Iterable[str]) -> float:
  values = [profile[key].confidence for key in keys if key in profile]
  return round(min(values), 4) if values else 0.0


def _insight(
  profile: dict[str, MetricEnvelope],
  keys: list[str],
  label: str | None,
  description: str,
  *,
  sensitivity: int = 1,
) -> Insight:
  evidence = [key for key in keys if key in profile and profile[key].value is not None]
  if not evidence or not label:
    return Insight(
      label="측정 보류",
      description="현재 촬영 범위에서 근거가 충분하지 않아요.",
      confidence=0,
      rationale_metric_keys=keys,
      sensitivity=sensitivity,
    )
  return Insight(
    label=label,
    description=description,
    confidence=_confidence(profile, evidence),
    rationale_metric_keys=evidence,
    sensitivity=sensitivity,
  )


def _derive_face_shape(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = [
    "verticalThirds.faceRatio",
    "geometry2d.jawWidthRatio",
    "geometry2d.lowerJawWidthRatio",
    "verticalThirds.faceLengthVerdict",
  ]
  aspect = _number(profile.get(keys[0]))
  jaw = _number(profile.get(keys[1]))
  lower = _number(profile.get(keys[2]))
  # 판정 단일 정본(2026-07-17): 측정 시점 모바일 verdict가 있으면 세로
  # 분류는 그것을 따른다(모바일 1.351/1.506 + pose 유보 vs 서버 1.38/1.2
  # 독립 임계의 불일치 제거). 없으면(구 payload) 레거시 임계 폴백.
  verdict = _text(profile.get(keys[3]))
  if verdict == "indeterminate":
    # 측정 시점 판정 보류(pose 결측 등) — 레거시 임계로 단정을 복원하지
    # 않고 서버도 함께 보류한다(2차 리뷰 B-1).
    return _insight(profile, keys, None, "")
  if aspect is None and verdict is None:
    return _insight(profile, keys, None, "")
  width = fmean(value for value in (jaw, lower) if value is not None) if jaw is not None or lower is not None else None
  if verdict in {"borderline_wide", "borderline_long"} and width is None:
    # 세로 축은 경계 유보인데 폭 근거마저 없으면 "폭 중심 판단" 자체가
    # 불가 — 근거 없는 '타원형' 단정 대신 보류한다(GO 게이트 MEDIUM).
    return _insight(profile, keys, None, "")
  if verdict is not None:
    is_long = verdict == "long"
    is_wide = verdict == "wide"
  else:
    is_long = aspect is not None and aspect >= 1.38
    is_wide = aspect is not None and aspect < 1.2
  if is_long and (width is None or width < 0.8):
    label = "긴 타원형"
  elif is_wide and (width is None or width < 0.82):
    label = "둥근형"
  elif width is not None and width >= 0.84:
    label = "각진형"
  else:
    label = "타원형"
  # borderline verdict는 세로 축 유보 — 라벨은 폭 중심으로 내리되 설명에
  # 유보를 명시해 프롬프트 지시("경계라 단정 금지")와 표현 강도를 일치시킨다.
  is_borderline = verdict in {"borderline_wide", "borderline_long"}
  description = (
    "세로 비율은 경계 구간이라 단정하지 않고, 하관 폭 중심으로 판단했어요."
    if is_borderline
    else "얼굴 세로 비율과 하관 폭을 함께 반영한 결과예요."
  )
  return _insight(profile, keys, label, description)


def _derive_vertical_balance(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = [
    "verticalThirds.upperNormalized",
    "verticalThirds.middleNormalized",
    "verticalThirds.lowerNormalized",
    "verticalThirds.dominantPart",
  ]
  # 판정 단일 정본(2026-07-17): 측정 시점 모바일 dominantPart(자기내부
  # 비교, 임계 0.08)가 있으면 그대로 따른다 — 서버 독립 임계(0.025)와의
  # "같은 얼굴 다른 판정" 제거. 없으면(구 payload) 레거시 규칙 폴백.
  dominant = _text(profile.get(keys[3]))
  dominant_labels = {
    "balanced": "세로 비율 균형형",
    "upper": "상안부 우세",
    "middle": "중안부 우세",
    "lower": "하안부 우세",
  }
  if dominant in dominant_labels:
    return _insight(
      profile, keys, dominant_labels[dominant],
      "측정 시점 판정(부위 간 자기내부 비교)을 따랐어요.",
    )
  values = [_number(profile.get(key)) for key in keys[:3]]
  if any(value is None for value in values):
    return _insight(profile, keys, None, "")
  numeric = [value for value in values if value is not None]
  if max(numeric) - min(numeric) <= 0.025:
    label = "세로 비율 균형형"
  else:
    label = ("상안부", "중안부", "하안부")[numeric.index(max(numeric))] + " 우세"
  return _insight(profile, keys, label, "상·중·하안부 실측 비율을 비교했어요.")


def _derive_eye_brow(profile: dict[str, MetricEnvelope]) -> Insight:
  ai_keys = ["eyes.upperLidCurve", "brows.archHeight", "brows.archPosition"]
  labels = [_text(profile.get(key)) for key in ai_keys]
  labels = [label for label in labels if label]
  if labels:
    return _insight(profile, ai_keys, " · ".join(labels), "눈매와 눈썹 곡선의 보완 관찰이에요.")
  keys = ["geometry2d.canthalTiltLeftDeg", "geometry2d.canthalTiltRightDeg"]
  values = [_number(profile.get(key)) for key in keys]
  values = [value for value in values if value is not None]
  if not values:
    return _insight(profile, keys, None, "")
  mean = fmean(values)
  label = "올라간 눈매" if mean > 2 else "내려간 눈매" if mean < -2 else "수평에 가까운 눈매"
  return _insight(profile, keys, label, "카메라가 측정한 눈꼬리 기울기를 반영했어요.")


def _derive_iris_exposure(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = ["eyes.irisExposure", "eyes.irisToAperture"]
  labels = [_text(profile.get(key)) for key in keys]
  label = " · ".join(value for value in labels if value)
  return _insight(profile, keys, label or None, "홍채 노출과 눈 개구 비율의 시각적 유형이에요.")


def _derive_color_axes(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = [
    "personalColor.axes.temperature",
    "personalColor.axes.value",
    "personalColor.axes.chroma",
    "personalColor.axes.contrast",
  ]
  temperature = _number(profile.get(keys[0]))
  value = _number(profile.get(keys[1]))
  chroma = _number(profile.get(keys[2]))
  if temperature is None:
    return _insight(profile, keys, None, "")
  tone = "웜" if temperature > 0.15 else "쿨" if temperature < -0.15 else "뉴트럴"
  depth = "라이트" if value is not None and value < -0.15 else "딥" if value is not None and value > 0.15 else "미들"
  color = "비비드" if chroma is not None and chroma > 0.15 else "뮤트" if chroma is not None and chroma < -0.15 else "중채도"
  return _insight(profile, keys, f"{tone} · {depth} · {color}", "기기에서 측정한 컬러 축을 조합했어요.")


def _derive_skin_color(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = ["skin.rednessMap", "skin.darkCircleColor", "skin.toneUniformity"]
  labels = [_text(profile.get(key)) for key in keys]
  label = " · ".join(value for value in labels if value)
  return _insight(profile, keys, label or None, "피부의 상대 색 분포를 미용 관찰로 정리했어요.")


def _derive_nose_philtrum_lips(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = [
    "face3d.noseTipProjection",
    "geometry2d.lipThicknessRatio",
    "philtrum.visualLength",
  ]
  nose = _number(profile.get(keys[0]))
  philtrum = _text(profile.get(keys[2]))
  labels: list[str] = []
  if nose is not None:
    labels.append("코끝 입체감 높음" if nose >= 0.18 else "코끝 입체감 완만")
  if philtrum:
    labels.append(philtrum)
  return _insight(profile, keys, " · ".join(labels) or None, "코·인중·입술 근거를 함께 보았어요.")


def _derive_asymmetry(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = [
    "geometry2d.mouthCornerAsymmetry",
    "eyes.heightAsymmetry",
    "brows.heightAsymmetry",
    "nose.nostrilAsymmetry",
  ]
  values = [_number(profile.get(key)) for key in keys]
  numeric = [abs(value) for value in values if value is not None]
  labels = [_text(profile.get(key)) for key in keys]
  labels = [label for label in labels if label]
  label = None
  if numeric:
    label = "좌우차 작음" if max(numeric) < 0.03 else "일부 좌우차 관찰"
  elif labels:
    label = " · ".join(labels)
  return _insight(profile, keys, label, "좌우차는 내부 컨설팅 근거로만 사용해요.", sensitivity=3)


def _derive_cheekbone_and_eline(profile: dict[str, MetricEnvelope]) -> Insight:
  keys = [
    "face3d.malarProjectionLeft",
    "face3d.malarProjectionRight",
    "face3d.centralProjectionScore",
    "face3d.upperLipToELine",
    "face3d.lowerLipToELine",
  ]
  center = _number(profile.get("face3d.centralProjectionScore"))
  if center is None:
    return _insight(profile, keys, None, "")
  label = "중앙부 입체감이 또렷한 편" if center >= 0.55 else "중앙부 입체감이 부드러운 편"
  return _insight(profile, keys, label, "3D 중앙부와 E-line 측정을 우선 반영했어요.")


def derive_face_analysis(
  profile: dict[str, MetricEnvelope],
  rules_version: str = RULES_VERSION,
) -> DerivedResult:
  return DerivedResult(
    rules_version=rules_version,
    face_shape=_derive_face_shape(profile),
    vertical_balance=_derive_vertical_balance(profile),
    eye_brow=_derive_eye_brow(profile),
    iris_exposure=_derive_iris_exposure(profile),
    color_axes=_derive_color_axes(profile),
    skin_color=_derive_skin_color(profile),
    nose_philtrum_lips=_derive_nose_philtrum_lips(profile),
    asymmetry=_derive_asymmetry(profile),
    cheekbone_and_eline=_derive_cheekbone_and_eline(profile),
  )
