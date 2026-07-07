"""§3 입력 계약 — 얼굴분석 리포트를 undertone 소프트 선호로 번역.

리포트는 `softPreferences(톤)`로만 반영하고, undertone 신뢰도가 낮아 **hard filter 금지**(§9).
그래서 여기서 방출하는 delta에는 `mode`/`locked` 키가 없다 — `apply_hard_filters`가 절대
집어들 수 없어 후보를 제거하지 않는다(점수/근거에만 반영). 근거에서도 undertone은
`_build_reason`이 항상 caveat("톤은 참고용")로만 노출한다.

퍼스널컬러 문자열(예: "여름 쿨 라이트", "봄 웜")에서 톤을 추론한다. shopping_products의
_target_terms와 같은 신호를 쓰되, Auradin 랭킹 어휘에 맞춰 **English cool|warm|neutral**을
방출한다(한국어 웜톤/쿨톤이 아니라 — ranking._preference_score가 attributes.undertone과
English 토큰으로 매칭하기 때문).
"""

from __future__ import annotations

from typing import Any


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


def personal_color_to_soft_preferences(personal_color: str) -> list[dict[str, Any]]:
  """리포트 퍼스널컬러 → soft preference 리스트 (undertone만, §9 안전).

  방출 delta는 `mode`/`locked` 없음 → hard filter 경로에 절대 안 닿는다.
  뉴트럴/불명은 톤 편향을 주지 않기 위해 빈 리스트를 반환한다.
  """
  tone = infer_undertone(personal_color)
  if tone not in {"cool", "warm"}:
    return []
  return [
    {
      "attribute": "undertone",
      "values": [tone],
      "source": "report",
      "confidence": 0.55,
      "weight": 0.5,
    },
  ]
