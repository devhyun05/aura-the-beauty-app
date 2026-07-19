"""Resolve and enforce the preparation-time answer used by makeup recommendations."""

from __future__ import annotations

import re
from typing import Any


DELEGATED_PREP_TIME_BUDGET_MINUTES = 30

_MINUTES_PATTERN = re.compile(r"(?<!\d)(\d{1,3})\s*분")
_TIME_QUESTION_IDS = {
  "prep_time",
  "time_skill",
  "question_time_skill",
}
_TIME_OPTION_BUDGETS = {
  "quick": 15,
  "quick_15": 15,
  "short": 15,
  "standard": 30,
  "standard_30": 30,
  "steady": 30,
  "medium": 30,
  "detail": 60,
  "detailed": 60,
  "detail_60_plus": 60,
  "long": 60,
}


def _normalized_key(value: Any) -> str:
  return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().casefold()).strip("_")


def _question_is_about_prep_time(question: dict[str, Any]) -> bool:
  question_id = _normalized_key(question.get("id"))
  if question_id in _TIME_QUESTION_IDS or "prep_time" in question_id or "time_skill" in question_id:
    return True

  options = question.get("options") if isinstance(question.get("options"), list) else []
  title = str(question.get("title") or "")
  option_labels = [
    str(option.get("label") or "")
    for option in options[:3]
    if isinstance(option, dict)
  ]
  searchable = " ".join((title, *option_labels)).casefold()
  return (
    "준비 시간" in searchable
    or "공들일" in searchable
    or "시간과 난이도" in searchable
    or sum(_MINUTES_PATTERN.search(label) is not None for label in option_labels) >= 2
  )


def _selected_option_label(question: dict[str, Any], option_id: Any) -> str:
  normalized_option_id = _normalized_key(option_id)
  options = question.get("options") if isinstance(question.get("options"), list) else []
  for option in options:
    if not isinstance(option, dict):
      continue
    if _normalized_key(option.get("id")) == normalized_option_id:
      return str(option.get("label") or "").strip()
  return ""


def _minutes_from_text(value: Any) -> int | None:
  match = _MINUTES_PATTERN.search(str(value or ""))
  if match is None:
    return None
  minutes = int(match.group(1))
  return minutes if 5 <= minutes <= 120 else None


def resolve_prep_time_budget_minutes(
  questions: list[dict[str, Any]] | None,
  answers: list[dict[str, Any]] | None,
) -> int | None:
  """Return the latest explicit preparation-time budget, if that axis was asked.

  Persisted sessions keep both the selected option id and its label. Provider
  generated question ids are not stable, so the owning question is identified
  from its title/options before any minute-looking answer text is trusted.
  """
  question_by_id = {
    str(question.get("id") or ""): question
    for question in questions or []
    if isinstance(question, dict) and str(question.get("id") or "")
  }
  for answer in reversed(answers or []):
    if not isinstance(answer, dict):
      continue
    question_id = str(answer.get("questionId") or "")
    question = question_by_id.get(question_id)
    if question is None:
      question = {"id": question_id}
    if not _question_is_about_prep_time(question):
      continue

    option_key = _normalized_key(answer.get("optionId"))
    option_label = _selected_option_label(question, answer.get("optionId"))
    if option_key in {"ai_pick", "aipick"} or "AI가 골라줘" in option_label:
      return DELEGATED_PREP_TIME_BUDGET_MINUTES

    for candidate in (
      option_label,
      answer.get("label"),
      answer.get("optionLabel"),
      answer.get("freeText"),
    ):
      minutes = _minutes_from_text(candidate)
      if minutes is not None:
        return minutes

    if option_key in _TIME_OPTION_BUDGETS:
      return _TIME_OPTION_BUDGETS[option_key]
  return None
