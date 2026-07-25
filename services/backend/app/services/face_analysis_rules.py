from collections.abc import Iterable
from statistics import fmean

from app.schemas.face_analysis_v2 import (
  DerivedResult,
  Insight,
  MeasurementInterpretation,
  MetricEnvelope,
)


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


def _available_numbers(
  profile: dict[str, MetricEnvelope],
  keys: Iterable[str],
) -> list[tuple[str, float]]:
  values: list[tuple[str, float]] = []
  for key in keys:
    value = _number(profile.get(key))
    if value is not None and profile[key].sensitivity < 3:
      values.append((key, value))
  return values


def _format_values(
  values: list[tuple[str, float]],
  *,
  kind: str = "ratio",
) -> str | None:
  if not values:
    return None
  labels = ("좌", "우") if len(values) == 2 else tuple("" for _ in values)
  parts: list[str] = []
  for index, (_, value) in enumerate(values):
    if kind == "deg":
      rendered = f"{value:.1f}°"
    elif kind == "percent":
      rendered = f"{value * 100:.1f}%"
    else:
      rendered = f"상대값 {value:.2f}"
    prefix = labels[index] if index < len(labels) else ""
    parts.append(f"{prefix} {rendered}".strip())
  return " · ".join(parts)


def _measurement_interpretation(
  profile: dict[str, MetricEnvelope],
  *,
  title: str,
  result_label: str,
  description: str,
  keys: list[str],
  display_kind: str = "ratio",
) -> MeasurementInterpretation | None:
  values = _available_numbers(profile, keys)
  evidence_keys = [key for key, _ in values]
  if not evidence_keys:
    return None
  return MeasurementInterpretation(
    title=title,
    result_label=result_label,
    description=description,
    display_value=_format_values(values, kind=display_kind),
    confidence=_confidence(profile, evidence_keys),
    rationale_metric_keys=evidence_keys,
  )


def _paired_flow_label(values: list[tuple[str, float]], noun: str) -> str:
  if len(values) < 2:
    return f"{noun} 측정 완료"
  gap = abs(values[0][1] - values[1][1])
  return f"좌우 {noun} 흐름이 비슷한 편" if gap <= 0.04 else f"좌우 {noun}을 각각 확인"


def _build_measurement_interpretations(
  profile: dict[str, MetricEnvelope],
) -> dict[str, MeasurementInterpretation]:
  result: dict[str, MeasurementInterpretation] = {}

  def add(key: str, value: MeasurementInterpretation | None) -> None:
    if value is not None:
      result[key] = value

  eye_width_keys = [
    "geometry2d.eyeWidthRatioLeft",
    "geometry2d.eyeWidthRatioRight",
  ]
  eye_width_values = _available_numbers(profile, eye_width_keys)
  add("interCanthalDistance", _measurement_interpretation(
    profile,
    title="눈 사이 거리",
    result_label="얼굴 폭 대비 눈 사이 간격",
    description="얼굴 전체 폭 안에서 두 눈 사이 여백이 차지하는 비율이에요.",
    keys=["geometry2d.interCanthalRatio"],
    display_kind="percent",
  ))
  add("eyeWidth", _measurement_interpretation(
    profile,
    title="좌우 눈 너비",
    result_label=_paired_flow_label(eye_width_values, "눈 너비"),
    description="양쪽 눈의 가로 길이를 같은 기준으로 비교한 결과예요.",
    keys=eye_width_keys,
    display_kind="percent",
  ))
  openness_keys = [
    "geometry2d.eyeOpennessLeft",
    "geometry2d.eyeOpennessRight",
  ]
  openness_values = _available_numbers(profile, openness_keys)
  add("eyeOpenness", _measurement_interpretation(
    profile,
    title="눈 개방도",
    result_label=_paired_flow_label(openness_values, "눈 뜨임"),
    description="눈 너비 대비 위아래로 열린 정도를 좌우 각각 확인했어요.",
    keys=openness_keys,
    display_kind="percent",
  ))
  tilt_keys = [
    "geometry2d.canthalTiltLeftDeg",
    "geometry2d.canthalTiltRightDeg",
  ]
  tilt_values = _available_numbers(profile, tilt_keys)
  mean_tilt = fmean(value for _, value in tilt_values) if tilt_values else 0
  tilt_label = (
    "눈꼬리가 위로 향하는 흐름"
    if mean_tilt > 2
    else "눈꼬리가 아래로 향하는 흐름"
    if mean_tilt < -2
    else "수평에 가까운 눈매"
  )
  add("canthalTilt", _measurement_interpretation(
    profile,
    title="눈꼬리 기울기",
    result_label=tilt_label,
    description="수평선을 기준으로 눈 앞머리에서 눈꼬리로 이어지는 방향이에요.",
    keys=tilt_keys,
    display_kind="deg",
  ))
  add("browFlow", _measurement_interpretation(
    profile,
    title="눈썹 흐름",
    result_label="눈썹 기울기와 산 위치를 함께 확인",
    description="좌우 눈썹의 방향과 눈썹 산이 놓인 위치를 함께 본 결과예요.",
    keys=[
      "geometry2d.browSlopeLeftDeg",
      "geometry2d.browSlopeRightDeg",
    ],
    display_kind="deg",
  ))

  nose_value = _number(profile.get("face3d.noseTipProjection"))
  add("noseTipProjection", _measurement_interpretation(
    profile,
    title="코끝 돌출",
    result_label=(
      "코끝 입체감이 또렷한 편"
      if nose_value is not None and nose_value >= 0.18
      else "코끝 입체감이 완만한 편"
    ),
    description="코끝이 양 볼 기준면보다 얼마나 앞으로 놓이는지를 본 결과예요.",
    keys=["face3d.noseTipProjection"],
  ))
  add("noseLength", _measurement_interpretation(
    profile,
    title="코 길이",
    result_label="얼굴 크기 대비 코의 세로 길이",
    description="미간 기준점부터 코끝까지의 길이를 얼굴 크기에 맞춰 비교했어요.",
    keys=["face3d.noseLength"],
  ))
  add("nasalBridge", _measurement_interpretation(
    profile,
    title="콧대와 코축",
    result_label="콧대 중심선의 흐름을 확인",
    description="콧대의 직선 흐름과 얼굴 중앙선에 대한 방향을 함께 봤어요.",
    keys=[
      "face3d.nasalBridgeStraightness",
      "face3d.nasalAxisDeviation",
    ],
  ))
  add("alarWidth", _measurement_interpretation(
    profile,
    title="콧볼 너비",
    result_label="얼굴 크기 대비 콧볼 폭",
    description="양쪽 콧볼 바깥점을 이은 폭을 얼굴 크기에 맞춰 비교했어요.",
    keys=["face3d.alarWidth"],
  ))
  center_value = _number(profile.get("face3d.centralProjectionScore"))
  add("centralProjectionScore", _measurement_interpretation(
    profile,
    title="중앙부와 볼의 관계",
    result_label=(
      "중앙부 입체감이 또렷한 편"
      if center_value is not None and center_value >= 0.55
      else "중앙부 입체감이 부드러운 편"
    ),
    description="얼굴 중앙 영역이 양 볼 기준면보다 앞으로 놓이는 정도예요.",
    keys=["face3d.centralProjectionScore"],
  ))
  malar_keys = [
    "face3d.malarProjectionLeft",
    "face3d.malarProjectionRight",
  ]
  add("malarProjection", _measurement_interpretation(
    profile,
    title="좌우 볼 돌출",
    result_label="양쪽 광대 부근의 전방 입체감",
    description="좌우 볼 표면이 기준면보다 앞으로 놓이는 정도를 각각 확인했어요.",
    keys=malar_keys,
  ))

  add("mouthWidth", _measurement_interpretation(
    profile,
    title="입 너비",
    result_label="얼굴 폭 대비 입의 가로 길이",
    description="양쪽 입꼬리 사이가 얼굴 폭에서 차지하는 비율이에요.",
    keys=["geometry2d.mouthWidthRatio"],
    display_kind="percent",
  ))
  add("lipThickness", _measurement_interpretation(
    profile,
    title="위아래 입술 두께",
    result_label="입 너비 대비 입술의 세로 볼륨",
    description="입의 가로 길이에 비해 위아래 입술이 차지하는 두께 관계예요.",
    keys=["geometry2d.lipThicknessRatio"],
    display_kind="percent",
  ))
  add("lipProjection", _measurement_interpretation(
    profile,
    title="입술 돌출",
    result_label="E-line 기준 입술의 전후 위치",
    description="코끝과 턱끝을 잇는 선을 기준으로 입술이 놓인 위치를 확인했어요.",
    keys=["face3d.upperLipToELine", "face3d.lowerLipToELine"],
  ))
  add("jawWidth", _measurement_interpretation(
    profile,
    title="턱 너비",
    result_label="얼굴 폭 대비 턱 모서리 폭",
    description="좌우 턱 모서리가 얼굴 전체 폭에서 차지하는 비율이에요.",
    keys=["geometry2d.jawWidthRatio"],
    display_kind="percent",
  ))
  add("lowerJawWidth", _measurement_interpretation(
    profile,
    title="아래턱 너비",
    result_label="얼굴 폭 대비 아래턱 폭",
    description="좌우 아래턱 윤곽점 사이 폭을 얼굴 전체 폭과 비교했어요.",
    keys=["geometry2d.lowerJawWidthRatio"],
    display_kind="percent",
  ))
  add("chinProjection", _measurement_interpretation(
    profile,
    title="턱끝 돌출",
    result_label="중안부 기준면 대비 턱끝의 전후 위치",
    description="턱끝이 얼굴 기준면보다 앞으로 놓이는 정도를 확인했어요.",
    keys=["face3d.chinProjection"],
  ))
  return result


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
  width = fmean(value for value in (jaw, lower) if value is not None) if jaw is not None or lower is not None else None
  # 판정 단일 정본(2026-07-17): 측정 시점 모바일 verdict가 있으면 세로
  # 분류는 그것을 따른다(모바일 1.351/1.506 + pose 유보 vs 서버 1.38/1.2
  # 독립 임계의 불일치 제거). 없으면(구 payload) 레거시 임계 폴백.
  verdict = _text(profile.get(keys[3]))
  if verdict == "indeterminate":
    # 측정 시점 판정 보류(pose 결측 등) — 레거시 임계로 단정을 복원하지
    # 않고 서버도 함께 보류한다(2차 리뷰 B-1).
    return _insight(profile, keys, None, "")
  if aspect is None and verdict is None and width is None:
    return _insight(profile, keys, None, "")
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
  if aspect is None and verdict is None:
    description = "헤어라인이 가려져 전체 세로 길이는 제외하고, 하관 폭과 윤곽을 중심으로 판단했어요."
  elif is_borderline:
    description = "세로 비율은 경계 구간이라 단정하지 않고, 하관 폭 중심으로 판단했어요."
  else:
    description = "얼굴 세로 비율과 하관 폭을 함께 반영한 결과예요."
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
    middle_lower_only = _number(profile.get(keys[0])) is None
    if middle_lower_only:
      middle_lower_labels = {
        "balanced": "중·하안부 비율 균형형",
        "middle": "중안부 강조",
        "lower": "하안부 강조",
      }
      if dominant in middle_lower_labels:
        return _insight(
          profile, keys, middle_lower_labels[dominant],
          "헤어라인을 제외하고 측정된 중안부와 하안부 길이를 직접 비교했어요.",
        )
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
    measurement_interpretations=_build_measurement_interpretations(profile),
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
