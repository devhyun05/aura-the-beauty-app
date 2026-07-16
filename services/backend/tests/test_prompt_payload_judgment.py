from app.services.openai_analysis import _safe_face_vertical_thirds_prompt_payload


def _full_payload(judgment: dict | None, version: str | None = "face-length-judgment/v2-provisional-20260717"):
  payload = {
    "measurementMode": "full_vertical_thirds",
    "status": "full_success",
    "title": "t",
    "confidence": 0.9,
    "displayRatio": {"upper": 1.02, "middle": 1.0, "lower": 0.95},
    "dominantPart": "balanced",
    "faceLength": {"heightPx": 900, "widthPx": 600, "ratio": 1.5},
    "hairline": {"analysisEligible": True, "confidence": 0.87, "provider": "apple_semantic_matte"},
    "quality": {"pitch": 3.0, "yaw": 1.0},
    "ratioDetail": {"middlePx": 100},
  }
  if judgment is not None:
    payload["faceLengthJudgment"] = judgment
  if version is not None:
    payload["judgmentVersion"] = version
  return payload


def test_safe_prompt_payload_preserves_frozen_judgment() -> None:
  # 3차 리뷰 BLOCKER 회귀 가드: 화이트리스트가 동결 판정을 벗겨내면
  # 프롬프트의 verdict 추종 지시가 종단에서 무효가 된다.
  safe = _safe_face_vertical_thirds_prompt_payload(
    _full_payload({"band": {"hi": 1.53, "lo": 1.49}, "verdict": "borderline_long"}),
  )
  assert safe is not None
  assert safe["faceLengthJudgment"] == {"band": {"hi": 1.53, "lo": 1.49}, "verdict": "borderline_long"}
  assert safe["judgmentVersion"] == "face-length-judgment/v2-provisional-20260717"


def test_safe_prompt_payload_drops_malformed_judgment() -> None:
  safe = _safe_face_vertical_thirds_prompt_payload(
    _full_payload({"band": {"hi": "x", "lo": 1.49}, "verdict": "not-a-verdict"}, version=""),
  )
  assert safe is not None
  assert safe["faceLengthJudgment"] is None
  assert safe["judgmentVersion"] is None
