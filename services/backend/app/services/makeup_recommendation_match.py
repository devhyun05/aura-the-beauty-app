"""Deterministic user-facing makeup match assessment.

This score intentionally excludes face geometry, generated-image alignment,
crop metadata, products, and provider source.  It compares only explicit user
intent and objective colour/skin context with the persisted anchor look.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from difflib import SequenceMatcher
import math
import re
from typing import Any, Literal


GenerationSource = Literal["claude", "deterministic_fallback"]

MATCH_VERSION = "makeup-match-v1"
MATCH_COMPONENT_WEIGHTS = {
  "preference": 35,
  "situation": 25,
  "colorHarmony": 25,
  "skinFinish": 15,
}
MIN_EVALUATED_WEIGHT = 60

_AI_PICK_IDS = {"ai_pick", "ai-pick", "ai", "auto", "recommended"}
_AI_PICK_LABELS = ("ai가 골라", "ai 추천", "알아서 골라", "자동 선택")
_TEXT_TOKEN_RE = re.compile(r"[0-9a-zA-Z가-힣]+")
_PATH_TOKEN_RE = re.compile(r"([^.\[\]]+)|\[(\d+)\]")
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

_CONCEPT_ALIASES: dict[str, tuple[str, ...]] = {
  "natural": ("내추럴", "자연스럽", "은은", "가볍", "데일리", "natural", "softly"),
  "bold": ("과감", "강렬", "화려", "드라마틱", "글램", "bold", "dramatic"),
  "balanced": ("균형", "과하지 않", "적당", "중간 강도", "balanced"),
  "soft": ("소프트", "뮤트", "차분", "부드럽", "저채도", "soft", "muted"),
  "vivid": ("비비드", "고채도", "선명", "쨍", "vivid", "bright"),
  "matte": ("매트", "보송", "무광", "파우더", "matte"),
  "glow": ("글로우", "윤광", "물광", "수분광", "촉촉", "광을 유지", "dewy", "glow"),
  "warm": ("웜", "코랄", "피치", "오렌지", "골드", "warm"),
  "cool": ("쿨", "로즈", "핑크", "라벤더", "모브", "실버", "cool"),
  "light": ("라이트", "밝은", "연한", "light"),
  "deep": ("딥", "어두운", "깊은", "deep"),
  "formal": ("면접", "발표", "비즈니스", "회의", "공식", "격식", "출근", "professional"),
  "festive": ("축제", "페스티벌", "파티", "클럽", "공연", "festival", "party"),
  "casual": ("일상", "산책", "학교", "등교", "캐주얼", "casual"),
  "romantic": ("데이트", "웨딩", "결혼", "로맨틱", "romantic"),
  "photo": ("사진", "촬영", "카메라", "포토", "photo", "camera"),
  "longwear": ("지속", "오래", "고정", "픽싱", "무너지", "longwear"),
  "coverage": ("커버", "잡티", "붉은기", "coverage"),
  "sheer": ("얇게", "투명", "피부 결", "시어", "sheer"),
}

_OPPOSITE_CONCEPTS = {
  frozenset(("natural", "bold")),
  frozenset(("soft", "vivid")),
  frozenset(("matte", "glow")),
  frozenset(("warm", "cool")),
  frozenset(("light", "deep")),
  frozenset(("formal", "festive")),
}

# Representative cosmetic palettes used only for reproducible colour-distance
# scoring.  They are an empirical v1 baseline and can be calibrated later.
_TONE_PALETTES: dict[str, tuple[str, ...]] = {
  "spring_light": ("#F4B49F", "#F7C28B", "#EFA39B", "#E7B36C", "#D88D78"),
  "spring_bright": ("#F47F6B", "#F49A42", "#E85A7A", "#D99A27", "#FF6F61"),
  "spring_true": ("#E98B64", "#E9A23B", "#DD7865", "#C88745", "#F09A70"),
  "summer_light": ("#D8A6B5", "#CFA9C5", "#E4B3BD", "#B9A7C8", "#C98FA6"),
  "summer_true": ("#B66F8A", "#A9789B", "#C47D96", "#8E7898", "#B56E82"),
  "summer_muted": ("#A76F7F", "#987583", "#B07D87", "#8D7485", "#9E6E78"),
  "autumn_muted": ("#A66E56", "#9B6B55", "#A77A54", "#8F6B5A", "#A45F55"),
  "autumn_true": ("#A95532", "#A86A2D", "#8E5B3B", "#B3683E", "#8D4D36"),
  "autumn_deep": ("#713D32", "#78462C", "#643C3A", "#80502F", "#6E3540"),
  "winter_bright": ("#C72F63", "#D6254F", "#9E3F88", "#B42D6B", "#A72852"),
  "winter_true": ("#8F244D", "#9E1F3F", "#73326F", "#A3285A", "#792A52"),
  "winter_deep": ("#5B2438", "#64253F", "#4F294B", "#73233A", "#48283F"),
}

_TONE_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
  ("spring_light", ("spring light", "spring_light", "봄 라이트")),
  ("spring_bright", ("spring bright", "spring_bright", "봄 브라이트")),
  ("spring_true", ("spring true", "spring_true", "봄 트루", "봄 웜")),
  ("summer_light", ("summer light", "summer_light", "여름 라이트")),
  ("summer_muted", ("summer mute", "summer muted", "summer_muted", "여름 뮤트")),
  ("summer_true", ("summer true", "summer_true", "여름 트루", "여름 쿨")),
  ("autumn_muted", ("autumn mute", "autumn muted", "autumn_muted", "가을 뮤트")),
  ("autumn_deep", ("autumn deep", "autumn_deep", "가을 딥")),
  ("autumn_true", ("autumn true", "autumn_true", "가을 트루", "가을 웜")),
  ("winter_bright", ("winter bright", "winter_bright", "겨울 브라이트")),
  ("winter_deep", ("winter deep", "winter_deep", "겨울 딥")),
  ("winter_true", ("winter true", "winter_true", "겨울 트루", "겨울 쿨")),
)


@dataclass(frozen=True)
class _InputSignal:
  source_type: str
  source_id: str
  label: str
  evidence_label: str
  priority: float = 1.0


@dataclass(frozen=True)
class _Decision:
  path: str
  value: str
  implementation: bool


def _record(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _clean(value: Any, limit: int = 300) -> str:
  return " ".join(str(value or "").split())[:limit]


def _normalized(value: Any) -> str:
  return _clean(value, 600).casefold()


def _bounded_score(value: float) -> int:
  return max(0, min(100, math.floor(value + 0.5)))


def _unique_signals(values: list[_InputSignal]) -> list[_InputSignal]:
  seen: set[tuple[str, str]] = set()
  result: list[_InputSignal] = []
  for value in values:
    key = (value.source_type, _normalized(value.label))
    if not value.label or key in seen:
      continue
    seen.add(key)
    result.append(value)
  return result


def _question_by_id(questions: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
  return {
    _clean(question.get("id"), 80): question
    for question in questions
    if isinstance(question, dict) and _clean(question.get("id"), 80)
  }


def _resolved_answer_label(
  answer: dict[str, Any],
  question: dict[str, Any],
) -> str:
  # `label` is the canonical current field; `optionLabel` is legacy fallback.
  direct = _clean(answer.get("label"), 240) or _clean(answer.get("optionLabel"), 240)
  if direct:
    return direct
  option_id = _clean(answer.get("optionId"), 80)
  for option in question.get("options", []):
    if isinstance(option, dict) and _clean(option.get("id"), 80) == option_id:
      return _clean(option.get("label"), 240)
  return ""


def _is_ai_pick(answer: dict[str, Any], label: str) -> bool:
  option_id = _normalized(answer.get("optionId"))
  normalized_label = _normalized(label)
  return option_id in _AI_PICK_IDS or any(token in normalized_label for token in _AI_PICK_LABELS)


def _answer_preference_signals(
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]],
) -> list[_InputSignal]:
  by_id = _question_by_id(questions)
  signals: list[_InputSignal] = []
  for index, raw_answer in enumerate(answers):
    if not isinstance(raw_answer, dict):
      continue
    question_id = _clean(raw_answer.get("questionId"), 80) or f"answer-{index}"
    question = _record(by_id.get(question_id))
    question_label = _clean(question.get("title"), 120) or "역질문"
    additional = _clean(raw_answer.get("additionalConstraints"), 240)
    free_text = _clean(raw_answer.get("freeText"), 240)
    if additional:
      signals.append(_InputSignal(
        "additional_constraint",
        question_id,
        additional,
        f"추가 요청: {additional}",
        1.7,
      ))
    if free_text:
      signals.append(_InputSignal(
        "free_text",
        question_id,
        free_text,
        f"직접 입력: {free_text}",
        1.6,
      ))
    label = _resolved_answer_label(raw_answer, question)
    if label and not _is_ai_pick(raw_answer, label):
      signals.append(_InputSignal(
        "question_answer",
        question_id,
        label,
        f"{question_label}: {label}",
        1.0,
      ))
  return signals


def _selection_preference_signals(context_snapshot: dict[str, Any]) -> list[_InputSignal]:
  selection = _record(context_snapshot.get("selection"))
  normalized_custom = _record(selection.get("normalizedCustom"))
  signals: list[_InputSignal] = []
  for source_id, raw_value, evidence_label, priority in (
    ("desiredImpression", normalized_custom.get("desiredImpression"), "원하는 인상", 1.2),
    ("desiredImpression", selection.get("desiredImpression"), "원하는 인상", 1.2),
    ("intensity", selection.get("intensity"), "원하는 강도", 1.2),
    ("finish", selection.get("finish"), "원하는 마무리", 1.2),
  ):
    value = _clean(raw_value, 240)
    if value:
      signals.append(_InputSignal("direct_preference", source_id, value, f"{evidence_label}: {value}", priority))
  constraints = normalized_custom.get("constraints")
  if isinstance(constraints, list):
    for index, raw_value in enumerate(constraints[:8]):
      value = _clean(raw_value, 240)
      if value:
        signals.append(_InputSignal(
          "custom_constraint",
          f"normalizedCustom.constraints[{index}]",
          value,
          f"직접 조건: {value}",
          1.4,
        ))
  return signals


def _situation_signals(
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]],
) -> list[_InputSignal]:
  selection = _record(context_snapshot.get("selection"))
  situation = _record(selection.get("situation"))
  keyword = _record(selection.get("keyword"))
  normalized_custom = _record(selection.get("normalizedCustom"))
  editorial = _record(selection.get("editorialPreset"))
  signals: list[_InputSignal] = []
  candidates = (
    ("situation", situation.get("label") or situation.get("key"), "상황"),
    ("keyword", keyword.get("label"), "키워드"),
    ("customSituationLabel", selection.get("customSituationLabel"), "직접 입력 상황"),
    ("customSituationText", selection.get("customSituationText"), "상황 설명"),
    ("situationIntent", normalized_custom.get("situationIntent"), "상황 의도"),
    ("desiredImpression", normalized_custom.get("desiredImpression"), "원하는 인상"),
    ("editorialPreset", editorial.get("displayText") or editorial.get("label"), "추천 상황"),
  )
  for source_id, raw_value, prefix in candidates:
    value = _clean(raw_value, 240)
    if value:
      signals.append(_InputSignal("situation", source_id, value, f"{prefix}: {value}", 1.0))
  for owner_id, owner in (("situation", situation), ("keyword", keyword)):
    tags = owner.get("tags")
    if not isinstance(tags, list):
      continue
    for index, raw_value in enumerate(tags[:8]):
      value = _clean(raw_value, 120)
      if value:
        signals.append(_InputSignal("situation_tag", f"{owner_id}.tags[{index}]", value, f"상황 태그: {value}", 0.7))

  by_id = _question_by_id(questions)
  for index, raw_answer in enumerate(answers):
    if not isinstance(raw_answer, dict):
      continue
    question_id = _clean(raw_answer.get("questionId"), 80) or f"answer-{index}"
    question = _record(by_id.get(question_id))
    question_title = _clean(question.get("title"), 120)
    label = _resolved_answer_label(raw_answer, question)
    if not label or _is_ai_pick(raw_answer, label):
      continue
    context_text = _normalized(f"{question_title} {label}")
    if any(token in context_text for token in ("시간", "격식", "사진", "촬영", "인상", "상황", "장소")):
      signals.append(_InputSignal(
        "situation_answer",
        question_id,
        label,
        f"{question_title or '상황 조건'}: {label}",
        0.9,
      ))
  return _unique_signals(signals)


def _append_decision(
  decisions: list[_Decision],
  path: str,
  value: Any,
  *,
  implementation: bool,
) -> None:
  text = _clean(value, 500)
  if text:
    decisions.append(_Decision(path, text, implementation))


def _anchor_look(recommendation: dict[str, Any]) -> tuple[int, dict[str, Any]] | None:
  looks = recommendation.get("looks")
  if not isinstance(looks, list):
    return None
  for index, look in enumerate(looks):
    if isinstance(look, dict) and look.get("role") == "anchor":
      return index, look
  for index, look in enumerate(looks):
    if isinstance(look, dict):
      return index, look
  return None


def _look_decisions(recommendation: dict[str, Any]) -> list[_Decision]:
  anchor = _anchor_look(recommendation)
  if anchor is None:
    return []
  look_index, look = anchor
  decisions: list[_Decision] = []
  context_summary = recommendation.get("contextSummary")
  if isinstance(context_summary, list):
    for index, value in enumerate(context_summary[:8]):
      _append_decision(decisions, f"contextSummary[{index}]", value, implementation=False)
  prefix = f"looks[{look_index}]"
  for key in ("title", "summary", "role", "imageBrief"):
    _append_decision(decisions, f"{prefix}.{key}", look.get(key), implementation=key != "role")
  for key, implementation in (("reasons", True), ("appliedConditions", False)):
    values = look.get(key)
    if isinstance(values, list):
      for index, value in enumerate(values):
        _append_decision(decisions, f"{prefix}.{key}[{index}]", value, implementation=implementation)
  guides = look.get("areaGuides")
  if not isinstance(guides, list):
    return decisions
  for guide_index, raw_guide in enumerate(guides):
    if not isinstance(raw_guide, dict):
      continue
    guide_prefix = f"{prefix}.areaGuides[{guide_index}]"
    for key in ("label", "goal", "texture", "placement", "technique", "reason"):
      _append_decision(decisions, f"{guide_prefix}.{key}", raw_guide.get(key), implementation=True)
    color = _record(raw_guide.get("color"))
    _append_decision(decisions, f"{guide_prefix}.color.name", color.get("name"), implementation=True)
    for key in ("avoid", "steps"):
      values = raw_guide.get(key)
      if isinstance(values, list):
        for index, item in enumerate(values):
          value = _record(item).get("instruction") if isinstance(item, dict) else item
          suffix = ".instruction" if isinstance(item, dict) else ""
          _append_decision(decisions, f"{guide_prefix}.{key}[{index}]{suffix}", value, implementation=True)
    plan = _record(raw_guide.get("applicationPlan"))
    steps = plan.get("steps")
    if isinstance(steps, list):
      for step_index, raw_step in enumerate(steps):
        if not isinstance(raw_step, dict):
          continue
        step_prefix = f"{guide_prefix}.applicationPlan.steps[{step_index}]"
        for key in ("title", "productType", "tool", "amount", "placement", "technique", "blending", "finishCheck"):
          _append_decision(decisions, f"{step_prefix}.{key}", raw_step.get(key), implementation=True)
        colors = raw_step.get("colors")
        if isinstance(colors, list):
          for color_index, raw_color in enumerate(colors):
            if not isinstance(raw_color, dict):
              continue
            _append_decision(
              decisions,
              f"{step_prefix}.colors[{color_index}].name",
              raw_color.get("name"),
              implementation=True,
            )
  return decisions


def _tokens(value: str) -> set[str]:
  return {token for token in _TEXT_TOKEN_RE.findall(_normalized(value)) if len(token) > 1}


def _concepts(value: str) -> set[str]:
  normalized = _normalized(value)
  result = {
    concept
    for concept, aliases in _CONCEPT_ALIASES.items()
    if any(alias in normalized for alias in aliases)
  }
  if "과하지 않" in normalized:
    result.discard("bold")
    result.update(("balanced", "natural"))
  return result


def _bigrams(value: str) -> set[str]:
  compact = re.sub(r"\s+", "", _normalized(value))
  return {compact[index:index + 2] for index in range(max(0, len(compact) - 1))}


def _jaccard(left: set[str], right: set[str]) -> float:
  if not left or not right:
    return 0.0
  return len(left & right) / len(left | right)


def _semantic_similarity(left: str, right: str) -> float:
  left_normalized = _normalized(left)
  right_normalized = _normalized(right)
  if not left_normalized or not right_normalized:
    return 0.0
  containment = 0.98 if (
    len(left_normalized) >= 2
    and (left_normalized in right_normalized or right_normalized in left_normalized)
  ) else 0.0
  token_score = _jaccard(_tokens(left), _tokens(right))
  concept_score = _jaccard(_concepts(left), _concepts(right))
  bigram_score = _jaccard(_bigrams(left), _bigrams(right))
  sequence_score = SequenceMatcher(None, left_normalized, right_normalized).ratio()
  return min(1.0, max(
    containment,
    token_score,
    concept_score * 0.9,
    bigram_score * 0.78,
    sequence_score * 0.55,
  ))


def _has_contradiction(input_text: str, output_texts: list[str]) -> bool:
  input_concepts = _concepts(input_text)
  output_concepts: set[str] = set()
  for value in output_texts:
    output_concepts.update(_concepts(value))
  for pair in _OPPOSITE_CONCEPTS:
    input_side = pair & input_concepts
    output_side = pair & output_concepts
    if len(input_side) == 1 and len(output_side) == 1 and input_side.isdisjoint(output_side):
      return True
  return False


def _resolve_path(root: Any, path: str) -> Any:
  current = root
  for match in _PATH_TOKEN_RE.finditer(path):
    key, index = match.groups()
    if key is not None:
      if not isinstance(current, dict) or key not in current:
        return None
      current = current[key]
    else:
      numeric_index = int(index)
      if not isinstance(current, list) or numeric_index >= len(current):
        return None
      current = current[numeric_index]
  return current


def _text_component(
  *,
  key: str,
  inputs: list[_InputSignal],
  decisions: list[_Decision],
  recommendation: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, str]]]:
  weight = MATCH_COMPONENT_WEIGHTS[key]
  if not inputs or not decisions:
    return ({
      "key": key,
      "weight": weight,
      "score": None,
      "evaluated": False,
      "reason": "평가할 명시 입력 또는 추천 결정 데이터가 없어요.",
      "evidence": [],
    }, [])

  implementation_decisions = [decision for decision in decisions if decision.implementation]
  weighted_scores = 0.0
  priority_sum = 0.0
  reflected: list[dict[str, str]] = []
  reflected_count = 0
  implementation_texts = [decision.value for decision in implementation_decisions]
  for signal in inputs:
    best_all = max(decisions, key=lambda item: _semantic_similarity(signal.label, item.value))
    all_similarity = _semantic_similarity(signal.label, best_all.value)
    best_implementation = max(
      implementation_decisions,
      key=lambda item: _semantic_similarity(signal.label, item.value),
      default=best_all,
    )
    implementation_similarity = _semantic_similarity(signal.label, best_implementation.value)
    signal_score = 30 + implementation_similarity * 50 + all_similarity * 20
    contradiction = _has_contradiction(signal.label, implementation_texts)
    if contradiction:
      signal_score = min(signal_score, 24)
    weighted_scores += signal_score * signal.priority
    priority_sum += signal.priority

    reflected_decision = best_implementation if implementation_similarity >= 0.34 else best_all
    reflected_similarity = max(implementation_similarity, all_similarity)
    reflected_value = _clean(_resolve_path(recommendation, reflected_decision.path), 300)
    if not contradiction and reflected_similarity >= 0.42 and reflected_value == reflected_decision.value:
      reflected.append({
        "sourceType": signal.source_type,
        "sourceId": signal.source_id,
        "inputLabel": signal.label,
        "decisionPath": reflected_decision.path,
        "reflectedValue": reflected_value,
      })
      reflected_count += 1

  component_score = _bounded_score(weighted_scores / priority_sum)
  noun = "취향·추가 요청" if key == "preference" else "상황·원하는 인상"
  reason = (
    f"{noun} {len(inputs)}개 중 {reflected_count}개가 실제 추천 결정 필드와 연결됐어요."
    if reflected_count
    else f"{noun}과 실제 추천 결정 필드의 연결이 약해 보수적으로 계산했어요."
  )
  return ({
    "key": key,
    "weight": weight,
    "score": component_score,
    "evaluated": True,
    "reason": reason,
    "evidence": [signal.evidence_label for signal in inputs[:10]],
  }, reflected)


def _tone_target(context_snapshot: dict[str, Any]) -> tuple[str, str, list[str]] | None:
  analysis = _record(context_snapshot.get("analysisReport"))
  measurement = _record(_record(analysis.get("measurementInsights")).get("personalColor"))
  measurement_usable = measurement.get("usable") is True
  tone = _record(measurement.get("tone")) if measurement_usable else {}
  source_values = [
    _clean(analysis.get("personalColor"), 120),
    _clean(analysis.get("toneSummary"), 240),
    _clean(tone.get("topCode"), 80),
    _clean(tone.get("topLabel"), 120),
  ]
  combined = " ".join(value for value in source_values if value).casefold()
  for tone_code, patterns in _TONE_PATTERNS:
    if any(pattern in combined for pattern in patterns):
      label = next((value for value in source_values if value), tone_code)
      evidence = [f"퍼스널컬러: {value}" for value in source_values if value][:4]
      return tone_code, label, evidence
  season_defaults = (("봄", "spring_true"), ("spring", "spring_true"), ("여름", "summer_true"), ("summer", "summer_true"), ("가을", "autumn_true"), ("autumn", "autumn_true"), ("겨울", "winter_true"), ("winter", "winter_true"))
  for pattern, tone_code in season_defaults:
    if pattern in combined:
      label = next((value for value in source_values if value), tone_code)
      return tone_code, label, [f"퍼스널컬러: {label}"]
  return None


def _srgb_channel(value: int) -> float:
  normalized = value / 255
  return normalized / 12.92 if normalized <= 0.04045 else ((normalized + 0.055) / 1.055) ** 2.4


def _hex_to_lab(value: str) -> tuple[float, float, float] | None:
  if not _HEX_RE.fullmatch(value):
    return None
  red, green, blue = (_srgb_channel(int(value[index:index + 2], 16)) for index in (1, 3, 5))
  x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047
  y = red * 0.2126 + green * 0.7152 + blue * 0.0722
  z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883

  def transform(channel: float) -> float:
    return channel ** (1 / 3) if channel > 0.008856 else 7.787 * channel + 16 / 116

  fx, fy, fz = transform(x), transform(y), transform(z)
  return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def _delta_e(left: tuple[float, float, float], right: tuple[float, float, float]) -> float:
  return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))


def _recommended_color_samples(recommendation: dict[str, Any]) -> list[tuple[str, str]]:
  anchor = _anchor_look(recommendation)
  if anchor is None:
    return []
  look_index, look = anchor
  guides = look.get("areaGuides")
  if not isinstance(guides, list):
    return []
  samples: list[tuple[str, str]] = []
  seen: set[tuple[str, str]] = set()
  for guide_index, raw_guide in enumerate(guides):
    if not isinstance(raw_guide, dict) or raw_guide.get("area") not in {"eye", "cheek", "lip"}:
      continue
    guide_prefix = f"looks[{look_index}].areaGuides[{guide_index}]"
    color = _record(raw_guide.get("color"))
    direct_hex = _clean(color.get("hex"), 7).upper()
    if _HEX_RE.fullmatch(direct_hex):
      item = (f"{guide_prefix}.color.hex", direct_hex)
      if item not in seen:
        seen.add(item)
        samples.append(item)
    steps = _record(raw_guide.get("applicationPlan")).get("steps")
    if not isinstance(steps, list):
      continue
    for step_index, raw_step in enumerate(steps):
      colors = _record(raw_step).get("colors")
      if not isinstance(colors, list):
        continue
      for color_index, raw_color in enumerate(colors):
        hex_value = _clean(_record(raw_color).get("hex"), 7).upper()
        if not _HEX_RE.fullmatch(hex_value):
          continue
        item = (f"{guide_prefix}.applicationPlan.steps[{step_index}].colors[{color_index}].hex", hex_value)
        if item not in seen:
          seen.add(item)
          samples.append(item)
  return samples


def _color_component(
  context_snapshot: dict[str, Any],
  recommendation: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, str]]]:
  weight = MATCH_COMPONENT_WEIGHTS["colorHarmony"]
  target = _tone_target(context_snapshot)
  samples = _recommended_color_samples(recommendation)
  if target is None or not samples:
    return ({
      "key": "colorHarmony",
      "weight": weight,
      "score": None,
      "evaluated": False,
      "reason": "신뢰할 수 있는 퍼스널컬러 또는 추천 색상 데이터가 없어요.",
      "evidence": [],
    }, [])
  tone_code, input_label, evidence = target
  palette_labs = [lab for value in _TONE_PALETTES[tone_code] if (lab := _hex_to_lab(value)) is not None]
  distances: list[tuple[float, str, str]] = []
  for path, value in samples:
    lab = _hex_to_lab(value)
    if lab is not None:
      distances.append((min(_delta_e(lab, target_lab) for target_lab in palette_labs), path, value))
  if not distances:
    return ({
      "key": "colorHarmony",
      "weight": weight,
      "score": None,
      "evaluated": False,
      "reason": "추천된 아이·치크·립 HEX를 평가할 수 없어요.",
      "evidence": evidence,
    }, [])
  average_distance = sum(item[0] for item in distances) / len(distances)
  score = _bounded_score(100 - average_distance * 1.65)
  best_distance, best_path, best_value = min(distances)
  reflected = []
  if _clean(_resolve_path(recommendation, best_path), 7).upper() == best_value:
    reflected.append({
      "sourceType": "analysis_personal_color",
      "sourceId": "personalColor",
      "inputLabel": input_label,
      "decisionPath": best_path,
      "reflectedValue": best_value,
    })
  return ({
    "key": "colorHarmony",
    "weight": weight,
    "score": score,
    "evaluated": True,
    "reason": f"아이·치크·립 {len(distances)}개 색상을 {input_label} 기준 팔레트와 비교했어요.",
    "evidence": evidence,
  }, reflected)


def _skin_inputs(
  context_snapshot: dict[str, Any],
  preference_inputs: list[_InputSignal],
) -> list[_InputSignal]:
  analysis = _record(context_snapshot.get("analysisReport"))
  signals: list[_InputSignal] = []
  for source_id, raw_value, prefix in (
    ("skinType", analysis.get("skinType"), "피부 타입"),
    ("skinAnalysisSummary", analysis.get("skinAnalysisSummary"), "피부 분석"),
  ):
    value = _clean(raw_value, 300)
    if value:
      signals.append(_InputSignal("analysis_skin", source_id, value, f"{prefix}: {value}", 1.0))
  skin_tokens = ("건성", "지성", "복합", "민감", "유분", "건조", "파우더", "매트", "글로우", "광", "커버")
  for signal in preference_inputs:
    if any(token in signal.label.casefold() for token in skin_tokens):
      signals.append(signal)
  return _unique_signals(signals)


def _base_decisions(recommendation: dict[str, Any]) -> list[_Decision]:
  anchor = _anchor_look(recommendation)
  if anchor is None:
    return []
  look_index, look = anchor
  guides = look.get("areaGuides")
  if not isinstance(guides, list):
    return []
  base_index = next(
    (index for index, guide in enumerate(guides) if _record(guide).get("area") == "base"),
    None,
  )
  if base_index is None:
    return []
  prefix = f"looks[{look_index}].areaGuides[{base_index}]"
  return [decision for decision in _look_decisions(recommendation) if decision.path.startswith(prefix)]


def _skin_features(value: str) -> set[str]:
  normalized = _normalized(value)
  features: set[str] = set()
  mapping = {
    "dry": ("건성", "건조"),
    "oily": ("지성", "유분", "피지"),
    "combination": ("복합", "t존", "티존"),
    "sensitive": ("민감", "자극"),
    "matte": ("매트", "보송", "파우더"),
    "glow": ("글로우", "윤광", "물광", "수분광", "촉촉", "광을 유지"),
    "hydrating": ("수분", "보습", "미스트", "촉촉"),
    "coverage": ("커버", "컨실러", "잡티"),
    "selective_powder": ("필요한 구역만", "t존만", "티존만", "선택적 파우더", "국소 파우더", "광을 살릴"),
    "full_powder": ("전체 파우더", "얼굴 전체에 파우더", "전면 파우더"),
    "thin_layers": ("얇게", "소량", "피부 결"),
  }
  for feature, tokens in mapping.items():
    if any(token in normalized for token in tokens):
      features.add(feature)
  return features


def _skin_component(
  context_snapshot: dict[str, Any],
  preference_inputs: list[_InputSignal],
  recommendation: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, str]]]:
  weight = MATCH_COMPONENT_WEIGHTS["skinFinish"]
  inputs = _skin_inputs(context_snapshot, preference_inputs)
  decisions = _base_decisions(recommendation)
  if not inputs or not decisions:
    return ({
      "key": "skinFinish",
      "weight": weight,
      "score": None,
      "evaluated": False,
      "reason": "피부 타입·마무리 입력 또는 베이스 레시피가 없어요.",
      "evidence": [],
    }, [])
  input_features: set[str] = set()
  output_features: set[str] = set()
  for signal in inputs:
    input_features.update(_skin_features(signal.label))
  for decision in decisions:
    output_features.update(_skin_features(decision.value))

  scores: list[int] = []
  if "dry" in input_features:
    scores.append(90 if ({"hydrating", "glow"} & output_features and "full_powder" not in output_features) else 35 if "full_powder" in output_features else 62)
  if "oily" in input_features:
    scores.append(88 if ({"matte", "selective_powder"} & output_features) else 38 if "glow" in output_features else 62)
  if "combination" in input_features:
    scores.append(94 if "selective_powder" in output_features and "glow" in output_features else 38 if "full_powder" in output_features else 65)
  if "sensitive" in input_features:
    scores.append(80 if "thin_layers" in output_features else 62)
  for finish in ("matte", "glow", "coverage"):
    if finish in input_features:
      scores.append(90 if finish in output_features else 38)
  if not scores:
    scores.append(72 if output_features else 55)
  score = _bounded_score(sum(scores) / len(scores))

  best_decision = max(
    decisions,
    key=lambda decision: len(_skin_features(decision.value) & (input_features | {"selective_powder", "hydrating", "thin_layers"})),
  )
  reflected_value = _clean(_resolve_path(recommendation, best_decision.path), 300)
  reflected = []
  if reflected_value == best_decision.value and (_skin_features(best_decision.value) & output_features):
    reflected.append({
      "sourceType": inputs[0].source_type,
      "sourceId": inputs[0].source_id,
      "inputLabel": inputs[0].label,
      "decisionPath": best_decision.path,
      "reflectedValue": reflected_value,
    })
  return ({
    "key": "skinFinish",
    "weight": weight,
    "score": score,
    "evaluated": True,
    "reason": "피부 타입과 베이스의 파우더 구역·광 유지·커버 방식을 비교했어요.",
    "evidence": [signal.evidence_label for signal in inputs[:8]],
  }, reflected)


def build_match_assessment(
  recommendation: dict[str, Any],
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]],
  *,
  generation_source: GenerationSource,
) -> dict[str, Any]:
  decisions = _look_decisions(recommendation)
  preference_inputs = _unique_signals([
    *_answer_preference_signals(answers, questions),
    *_selection_preference_signals(context_snapshot),
  ])
  preference, preference_reflected = _text_component(
    key="preference",
    inputs=preference_inputs,
    decisions=decisions,
    recommendation=recommendation,
  )
  situation, situation_reflected = _text_component(
    key="situation",
    inputs=_situation_signals(context_snapshot, answers, questions),
    decisions=decisions,
    recommendation=recommendation,
  )
  color, color_reflected = _color_component(context_snapshot, recommendation)
  skin, skin_reflected = _skin_component(context_snapshot, preference_inputs, recommendation)
  components = [preference, situation, color, skin]
  evaluated = [component for component in components if component["evaluated"] is True]
  evaluated_weight = sum(int(component["weight"]) for component in evaluated)
  score: int | None = None
  if (
    evaluated_weight >= MIN_EVALUATED_WEIGHT
    and len(evaluated) >= 2
    and any(component["key"] in {"preference", "situation"} for component in evaluated)
  ):
    score = _bounded_score(
      sum(int(component["score"]) * int(component["weight"]) for component in evaluated)
      / evaluated_weight,
    )

  reflected_inputs: list[dict[str, str]] = []
  seen_reflected: set[tuple[str, str, str]] = set()
  for item in (*preference_reflected, *situation_reflected, *color_reflected, *skin_reflected):
    key = (item["sourceType"], item["sourceId"], item["decisionPath"])
    if key in seen_reflected or _resolve_path(recommendation, item["decisionPath"]) is None:
      continue
    seen_reflected.add(key)
    reflected_inputs.append(item)

  return {
    "version": MATCH_VERSION,
    "score": score,
    "evaluatedWeight": evaluated_weight,
    "components": components,
    "reflectedInputs": reflected_inputs[:20],
    "generationSource": generation_source,
  }


def attach_match_assessment(
  recommendation: dict[str, Any],
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]],
  *,
  generation_source: GenerationSource,
) -> dict[str, Any]:
  result = deepcopy(recommendation)
  result["matchAssessment"] = build_match_assessment(
    result,
    context_snapshot,
    answers,
    questions,
    generation_source=generation_source,
  )
  return result
