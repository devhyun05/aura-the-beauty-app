"""Stage 8 — 아우라딘 검색 컨텍스트 검증 확장.

personalColor 단일 허용 → skinType + 신호별 confidence까지 허용(C4 finish
경로·conf 게이트 복원). 그 외 키는 여전히 422로 거부하는 보안 allowlist.
"""

import pytest

from app.api.search_sessions import _validated_search_context
from app.core.errors import AppError
from app.services.auradin_agent.report_profile import (
    report_context_to_soft_preferences,
)


def test_accepts_personal_color_and_skin_type():
    result = _validated_search_context(
        {"personalColor": "여름 쿨", "skinType": "건성"},
    )
    assert result == {"personalColor": "여름 쿨", "skinType": "건성"}


def test_accepts_confidence_numbers():
    result = _validated_search_context(
        {"personalColor": "봄 웜", "personalColorConfidence": 0.8},
    )
    assert result["personalColorConfidence"] == 0.8


def test_rejects_unlisted_keys():
    with pytest.raises(AppError) as exc_info:
        _validated_search_context({"faceLandmarks": [1, 2, 3]})
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "INVALID_SEARCH_CONTEXT"


def test_rejects_out_of_range_confidence():
    with pytest.raises(AppError):
        _validated_search_context({"skinTypeConfidence": 1.5})
    with pytest.raises(AppError):
        _validated_search_context({"skinTypeConfidence": True})


def test_empty_and_none_return_empty():
    assert _validated_search_context(None) == {}
    assert _validated_search_context({}) == {}
    assert _validated_search_context({"personalColor": "   "}) == {}


def test_skin_type_now_produces_finish_soft_preference():
    # C4 경로 복원 확인: skinType가 전달되면 finish soft preference가 나온다.
    prefs = report_context_to_soft_preferences(
        _validated_search_context({"skinType": "건성"}),
    )
    assert any(
        pref["attribute"] == "finish" and "glossy" in pref["values"]
        for pref in prefs
    )


def test_confidence_below_floor_suppresses_injection():
    # conf<0.5 게이트 실동작: 명시 confidence가 낮으면 주입 0.
    prefs = report_context_to_soft_preferences(
        _validated_search_context(
            {"personalColor": "여름 쿨", "personalColorConfidence": 0.3},
        ),
    )
    assert all(pref["attribute"] != "undertone" for pref in prefs)
