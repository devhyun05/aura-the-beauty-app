from app.core.settings import Settings
from app.services.openai_analysis import OpenAIAnalysisService


def _service():
    return OpenAIAnalysisService(Settings())


def test_axes_passthrough_and_clamp():
    service = _service()
    out = service._ensure_impression_notes(
        {
            "impressionNotes": {
                "overallMood": "청량한 젠틀",
                "keywords": ["청량", "단정"],
                "paragraph": "전체적으로 부드럽고 단정한 인상.",
                "axes": [
                    {"key": "softness", "leftLabel": "부드러움", "rightLabel": "또렷함", "value": 1.9},
                    {"key": "vividness", "leftLabel": "차분함", "rightLabel": "화사함", "value": -0.3},
                ],
            }
        }
    )
    assert len(out["axes"]) == 2
    assert out["axes"][0]["value"] == 1.0  # clamp
    assert out["axes"][0]["leftLabel"] == "부드러움"
    assert out["axes"][1]["value"] == -0.3


def test_axes_default_when_missing():
    service = _service()
    out = service._ensure_impression_notes({"recommendedMood": "은은한 무드"})
    assert len(out["axes"]) == 2
    for ax in out["axes"]:
        assert set(ax.keys()) == {"key", "leftLabel", "rightLabel", "value"}
        assert ax["value"] == 0.0
        assert ax["leftLabel"] and ax["rightLabel"]
    # 기존 필드 유지
    assert out["overallMood"] and out["keywords"] and out["paragraph"]
