from app.core.settings import Settings
from app.services.openai_analysis import OpenAIAnalysisService


def _service():
    return OpenAIAnalysisService(Settings())


def test_structured_region_notes_pass_through():
    service = _service()
    out = service._ensure_region_notes(
        {
            "regionNotes": {
                "upper": {
                    "insight": "눈매가 큰 편이에요",
                    "evidence": "눈 가로폭이 넉넉하고 눈꼬리가 살짝 올라간 편",
                    "recommendation": "아이라인은 얇게, 언더는 생략",
                },
                "mid": {"insight": "코가 입체적이에요"},
                "lower": {"insight": "입술이 도톰해요", "recommendation": "누드 톤"},
                "jaw": {"insight": "턱이 부각되는 편"},
            }
        }
    )
    assert out["upper"] == {
        "insight": "눈매가 큰 편이에요",
        "evidence": "눈 가로폭이 넉넉하고 눈꼬리가 살짝 올라간 편",
        "recommendation": "아이라인은 얇게, 언더는 생략",
    }
    # evidence/recommendation는 없으면 빈 문자열
    assert out["mid"] == {"insight": "코가 입체적이에요", "evidence": "", "recommendation": ""}
    assert out["lower"]["recommendation"] == "누드 톤"
    assert out["lower"]["evidence"] == ""


def test_legacy_string_region_notes_promoted_to_insight():
    service = _service()
    out = service._ensure_region_notes(
        {"regionNotes": {"upper": "눈썹 결이 자연스럽고 눈매가 부드러운 편입니다"}}
    )
    assert out["upper"]["insight"] == "눈썹 결이 자연스럽고 눈매가 부드러운 편입니다"
    assert out["upper"]["evidence"] == ""
    assert out["upper"]["recommendation"] == ""
    # 나머지 키는 기본 insight로 채워지고 구조는 항상 3필드
    for key in ("upper", "mid", "lower", "jaw"):
        assert set(out[key].keys()) == {"insight", "evidence", "recommendation"}
        assert isinstance(out[key]["insight"], str) and out[key]["insight"]


def test_missing_region_notes_get_defaults():
    service = _service()
    out = service._ensure_region_notes({"faceShape": "계란형", "recommendedMood": "청량한 무드"})
    assert set(out.keys()) == {"upper", "mid", "lower", "jaw"}
    for key in out:
        assert out[key]["insight"]  # 기본 insight 존재
        assert out[key]["evidence"] == ""
        assert out[key]["recommendation"] == ""
