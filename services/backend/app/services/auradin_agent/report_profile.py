"""§3 입력 계약 — 얼굴분석 리포트를 soft 선호로 번역 (undertone + C4 피부타입→마감).

리포트는 `softPreferences`로만 반영하고, 신뢰도가 낮아 **hard filter 금지**(§9).
그래서 여기서 방출하는 delta에는 `mode`/`locked` 키가 없다 — `apply_hard_filters`가 절대
집어들 수 없어 후보를 제거하지 않는다(점수/근거에만 반영). 근거에서도 undertone은
`_build_reason`이 항상 caveat("톤은 참고용")로만 노출한다.

퍼스널컬러 문자열(예: "여름 쿨 라이트", "봄 웜")에서 톤을 추론한다. shopping_products의
_target_terms와 같은 신호를 쓰되, Auradin 랭킹 어휘에 맞춰 **English cool|warm|neutral**을
방출한다(한국어 웜톤/쿨톤이 아니라 — ranking._preference_score가 attributes.undertone과
English 토큰으로 매칭하기 때문).

C4 (§13, §9.1 문제3): 레거시 `_target_terms`(shopping_products.py)가 하던
피부타입→마감 확장을 이 신규 경로로 이관 — 건성→촉촉, 지성/복합성→매트 소프트 선호.
카탈로그 어휘 확인 결과(finish: velvet/glossy/matte/shimmer/sheer, texture는 제형만)
"moist"류 값은 texture에 없고 촉촉/윤광은 finish=glossy가 정본이라 finish로 매핑한다.
weight 0.4 — R2a의 CAP_REPORT(0.02)가 지배하므로 넛지 이상이 될 수 없다.

confidence 게이트 (§9.2): 리포트 신호에 명시 confidence가 있고 <0.5면 주입 0.
"""

from __future__ import annotations

from typing import Any

# §9.2 — conf<문턱이면 주입 0. 부재(None)는 신호별 기본 confidence로 주입 유지.
REPORT_CONFIDENCE_FLOOR = 0.5

# 카탈로그 finish 어휘 기준 매핑 (레거시 _target_terms 이관):
# 건성 → 촉촉/글로우/윤광 == glossy, 지성·복합성 → 매트·세미매트(velvet) 보송 계열.
SKIN_TYPE_FINISH_VALUES: dict[str, tuple[str, ...]] = {
  "dry": ("glossy",),
  "oily": ("matte", "velvet"),
  "combination": ("matte", "velvet"),
}


def infer_undertone(personal_color: str) -> str | None:
  """퍼스널컬러 문자열 → 'cool' | 'warm' | 'neutral' | None (불명은 None → 넛지 안 함)."""
  text = str(personal_color or "").strip().lower()
  if not text:
    return None
  warm = any(token in text for token in ("봄", "가을", "warm", "웜"))
  cool = any(token in text for token in ("여름", "겨울", "cool", "쿨"))
  if warm and not cool:
    return "warm"
  if cool and not warm:
    return "cool"
  if "뉴트럴" in text or "neutral" in text:
    return "neutral"
  return None


def _report_confidence(confidence: Any, default: float) -> float:
  """부재(None)/파싱 불가 → 신호별 기본값. 명시 숫자는 그대로 보존한다(0.0 포함)."""
  if confidence is None:
    return default
  try:
    value = float(confidence)
  except (TypeError, ValueError):
    return default
  if value != value or value in {float("inf"), float("-inf")}:
    return default
  return value


def infer_skin_type(skin_type: str) -> str | None:
  """피부타입 문자열 → 'dry' | 'oily' | 'combination' | None (불명은 None → 확장 안 함)."""
  text = str(skin_type or "").strip().lower()
  if not text:
    return None
  if "건성" in text or "dry" in text:
    return "dry"
  if "복합" in text or "combination" in text:
    return "combination"
  if "지성" in text or "oily" in text:
    return "oily"
  return None


def personal_color_to_soft_preferences(
  personal_color: str,
  confidence: Any = None,
) -> list[dict[str, Any]]:
  """리포트 퍼스널컬러 → soft preference 리스트 (undertone만, §9 안전).

  방출 delta는 `mode`/`locked` 없음 → hard filter 경로에 절대 안 닿는다.
  뉴트럴/불명은 톤 편향을 주지 않기 위해 빈 리스트를 반환한다.
  C4: 명시 confidence<0.5면 주입 0 (부재는 기존 기본값 0.55 유지).
  """
  resolved_confidence = _report_confidence(confidence, 0.55)
  if resolved_confidence < REPORT_CONFIDENCE_FLOOR:
    return []
  tone = infer_undertone(personal_color)
  if tone not in {"cool", "warm"}:
    return []
  return [
    {
      "attribute": "undertone",
      "values": [tone],
      "source": "report",
      "confidence": resolved_confidence,
      "weight": 0.5,
    },
  ]


def skin_type_to_soft_preferences(
  skin_type: str,
  confidence: Any = None,
) -> list[dict[str, Any]]:
  """C4 — 리포트 피부타입 → finish soft preference (레거시 _target_terms 이관).

  건성→glossy(촉촉/윤광), 지성·복합성→matte+velvet(매트·세미매트). 방출 delta는
  `mode`/`locked` 없음(§9 hard 금지 동일 계약). weight 0.4 — CAP_REPORT 지배라 안전.
  명시 confidence<0.5면 주입 0, 부재는 기본 0.5로 주입 유지.
  """
  resolved_confidence = _report_confidence(confidence, 0.5)
  if resolved_confidence < REPORT_CONFIDENCE_FLOOR:
    return []
  values = SKIN_TYPE_FINISH_VALUES.get(infer_skin_type(skin_type) or "")
  if not values:
    return []
  return [
    {
      "attribute": "finish",
      "values": list(values),
      "source": "report",
      "confidence": resolved_confidence,
      "weight": 0.4,
    },
  ]


def report_context_to_soft_preferences(
  report_context: dict[str, Any] | None,
) -> list[dict[str, Any]]:
  """리포트 context 전체 → soft preference 병합 진입점 (session_manager가 호출).

  지원 키: personalColor(+personalColorConfidence), skinType(+skinTypeConfidence),
  confidence(신호별 값이 없을 때의 공통 confidence). 모든 신호는 source=report,
  R2a 위계에서 프롬프트/질문에 항상 진다.
  """
  context = report_context if isinstance(report_context, dict) else {}
  shared_confidence = context.get("confidence")
  preferences: list[dict[str, Any]] = []
  preferences.extend(
    personal_color_to_soft_preferences(
      str(context.get("personalColor") or ""),
      confidence=context.get("personalColorConfidence", shared_confidence),
    ),
  )
  preferences.extend(
    skin_type_to_soft_preferences(
      str(context.get("skinType") or ""),
      confidence=context.get("skinTypeConfidence", shared_confidence),
    ),
  )
  return preferences
