import pytest

from app.core.errors import AppError
from app.services.beard_analysis import (
  FIXED_CELL,
  FIXED_SAFETY_TIP,
  MODEL_CELL_KEYS,
  NO_ANSWER_LABEL,
  _survey_labels,
  normalize_beard_analysis_result,
)


def _valid_raw_result() -> dict:
  return {
    "summarySentences": ["턱 주변에 수염 자국이 가장 뚜렷해요.", "인중 쪽은 상대적으로 옅게 보여요."],
    "cells": [
      {"k": "수염 타입 요약", "v": "짧고 고른 편"},
      {"k": "밀도", "v": "보통"},
      {"k": "푸른 그림자", "v": "약하게 보임"},
      {"k": "주요 분포", "v": "턱 중심"},
      {"k": "촬영 품질", "v": "밝고 선명함"},
    ],
    "consults": ["턱 주변 상태를 먼저 확인하고 싶어요.", "무엇을 먼저 알아보면 좋을지 궁금해요."],
    "tips": [
      "같은 밝기와 각도에서 촬영하면 비교하기 좋아요.",
      "면도 직후와 하루 뒤 모습을 함께 남겨보세요.",
      "면도 도구는 깨끗하게 관리해 주세요.",
      "정면과 측면을 함께 찍어두면 도움이 돼요.",
    ],
  }


def test_normalize_returns_exact_array_lengths_and_fixed_values() -> None:
  analysis = normalize_beard_analysis_result(_valid_raw_result())

  assert len(analysis["summarySentences"]) == 2
  assert len(analysis["cells"]) == 6
  assert len(analysis["consults"]) == 2
  assert len(analysis["tips"]) == 5

  # First 5 cells are the model keys in the fixed order; 6th is the fixed cell.
  assert [cell["k"] for cell in analysis["cells"][:5]] == MODEL_CELL_KEYS
  assert analysis["cells"][-1] == FIXED_CELL

  # Fixed safety tip is appended as the final tip.
  assert analysis["tips"][-1] == FIXED_SAFETY_TIP


def test_normalize_truncates_overflow_but_keeps_genuine_content() -> None:
  raw = _valid_raw_result()
  raw["summarySentences"].append("여분의 세 번째 문장")
  raw["tips"].append("여분의 다섯 번째 팁")

  analysis = normalize_beard_analysis_result(raw)

  assert len(analysis["summarySentences"]) == 2
  # 4 model tips truncated + fixed safety tip.
  assert len(analysis["tips"]) == 5
  assert analysis["tips"][-1] == FIXED_SAFETY_TIP


def test_normalize_forbidden_term_raises_instead_of_silent_substitution() -> None:
  raw = _valid_raw_result()
  raw["consults"][0] = "영구제모 회차와 효과보장 여부를 진단받고 싶어요."

  with pytest.raises(AppError) as exc_info:
    normalize_beard_analysis_result(raw)

  assert exc_info.value.code == "BEARD_ANALYSIS_FORBIDDEN_TERM"
  assert exc_info.value.status_code == 502


def test_normalize_missing_cell_raises() -> None:
  raw = _valid_raw_result()
  raw["cells"] = raw["cells"][:4]  # drop the "촬영 품질" cell.

  with pytest.raises(AppError) as exc_info:
    normalize_beard_analysis_result(raw)

  assert exc_info.value.code == "BEARD_ANALYSIS_INVALID_OUTPUT"
  assert exc_info.value.details.get("missingKey") == "촬영 품질"


def test_normalize_too_few_summary_sentences_raises() -> None:
  raw = _valid_raw_result()
  raw["summarySentences"] = ["문장 하나뿐"]

  with pytest.raises(AppError) as exc_info:
    normalize_beard_analysis_result(raw)

  assert exc_info.value.code == "BEARD_ANALYSIS_INVALID_OUTPUT"
  assert exc_info.value.details.get("field") == "summarySentences"


def test_normalize_empty_result_raises() -> None:
  with pytest.raises(AppError):
    normalize_beard_analysis_result(None)


def test_survey_labels_resolve_indices_and_join_areas() -> None:
  labels = _survey_labels(
    {"a1": 0, "shave": 3, "areas": [0, 2], "freq": 1, "cover": 2, "plan": 0},
  )

  assert labels["a1"] == "푸른 수염 자국을 줄이고 싶어요"
  assert labels["shave"] == "비교적 짙은 수염"
  assert labels["areas"] == "인중 · 입 양쪽"
  assert labels["freq"] == "2~3일에 한 번"
  assert labels["cover"] == "아니요"
  assert labels["plan"] == "알아보고 있어요"


def test_survey_labels_handle_missing_and_out_of_range() -> None:
  labels = _survey_labels({"a1": None, "areas": [], "shave": 99})

  assert labels["a1"] == NO_ANSWER_LABEL
  assert labels["shave"] == NO_ANSWER_LABEL
  assert labels["areas"] == NO_ANSWER_LABEL
  assert labels["freq"] == NO_ANSWER_LABEL


def test_survey_labels_handle_non_dict() -> None:
  labels = _survey_labels(None)

  assert labels["a1"] == NO_ANSWER_LABEL
  assert labels["areas"] == NO_ANSWER_LABEL
