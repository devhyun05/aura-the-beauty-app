from app.services.openai_analysis import (
    _safe_face_geometry_prompt_payload,
    _safe_face_vertical_thirds_prompt_payload,
)


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


def test_safe_prompt_payload_excludes_raw_pixels() -> None:
  # 프롬프트 지시("원본 H 제외, 검증된 비율만")와 코드 일치: heightPx/widthPx/
  # *Px 픽셀 원본은 모델에 보내지 않고 무차원 비율/정규화만 전달한다.
  safe = _safe_face_vertical_thirds_prompt_payload(
    _full_payload(None),
  )
  assert safe is not None
  assert safe["faceLength"] == {"ratio": 1.5}
  assert "heightPx" not in safe["faceLength"]
  assert "widthPx" not in safe["faceLength"]
  # ratioDetail은 정규화만(입력 middlePx는 탈락).
  assert all(not key.endswith("Px") for key in (safe.get("ratioDetail") or {}))


def test_safe_geometry_payload_forwards_confidence() -> None:
  # geometry per-metric confidence 전달(이전엔 unit/value만) — LLM이 저신뢰
  # 지표를 확정 사실로 서술하지 않도록.
  safe = _safe_face_geometry_prompt_payload(
    {
      "status": "full_success",
      "metrics": {
        "canthalTiltLeftDeg": {"value": 5.2, "confidence": 0.4},
        "jawWidthRatio": {"value": 0.8},
      },
    },
  )
  assert safe is not None
  assert safe["metrics"]["canthalTiltLeftDeg"]["confidence"] == 0.4
  # confidence 없는 지표는 키를 붙이지 않는다.
  assert "confidence" not in safe["metrics"]["jawWidthRatio"]
