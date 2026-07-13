from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.schemas.product_recommendation import ProductEvent
from app.services.product_color import delta_e_ciede2000, srgb_hex_to_lab
from app.services.product_recommendations import validate_event_source
from app.services.saved_ar_looks import normalize_saved_ar_look


def _recipe_payload() -> dict:
  return {
    "schemaVersion": "saved_ar_look_v1",
    "recipeContract": "FullFaceMakeupRecipe",
    "sourceFrameMetadata": {"capturePairId": "must-not-persist"},
    "recipe": {
      "version": 2,
      "rendererMode": "smooth-region-mask",
      "sourceFrameMetadata": {"landmarks": [1, 2, 3]},
      "layers": [
        {
          "region": "lip",
          "enabled": True,
          "color": "#b96872",
          "finish": "gloss",
          "intensity": 0.72,
          "opacity": 0.78,
          "blendMode": "multiply",
        },
        {
          "region": "blush",
          "enabled": True,
          "color": "#D88E91",
          "finish": "sheer-glow",
          "intensity": 0.46,
          "opacity": 0.52,
          "blendMode": "multiply",
        },
      ],
    },
  }


def test_saved_ar_look_is_minimized_and_projected_by_server() -> None:
  payload = _recipe_payload()
  payload["portraitBlob"] = "client-authored data must not persist"
  payload["recipe"]["layers"][0]["arbitraryNestedPayload"] = {"photo": "not allowed"}
  normalized = normalize_saved_ar_look(payload)
  assert "sourceFrameMetadata" not in normalized
  assert "portraitBlob" not in normalized
  assert "sourceFrameMetadata" not in normalized["recipe"]
  assert "arbitraryNestedPayload" not in normalized["recipe"]["layers"][0]
  regions = normalized["recommendationProjection"]["regions"]
  assert [region["productRegion"] for region in regions] == ["lip", "cheek"]
  assert regions[0]["authoringColorHex"] == "#B96872"
  assert regions[1]["canonicalFinish"] == "sheer_glow"
  assert normalized["recommendationProjection"]["colorSemantics"] == "authoring_color"
  assert normalized["thumbnailRepresentation"] == {
    "version": "saved_ar_swatch_mosaic_v1",
    "kind": "swatch_mosaic",
    "colors": ["#B96872", "#D88E91"],
  }


def test_saved_ar_look_normalization_is_round_trip_stable() -> None:
  normalized = normalize_saved_ar_look(_recipe_payload())
  assert normalize_saved_ar_look(normalized) == normalized


def test_saved_ar_look_rejects_out_of_range_intensity() -> None:
  payload = _recipe_payload()
  payload["recipe"]["layers"][0]["intensity"] = 1.1
  with pytest.raises(AppError) as error:
    normalize_saved_ar_look(payload)
  assert error.value.code == "INVALID_AR_RECIPE"


def test_color_conversion_and_ciede2000_reference_vector() -> None:
  white = srgb_hex_to_lab("#FFFFFF")
  assert white[0] == pytest.approx(100, abs=0.01)
  # Sharma et al. CIEDE2000 supplementary test pair 1.
  assert delta_e_ciede2000((50, 2.6772, -79.7751), (50, 0, -82.7485)) == pytest.approx(2.0425, abs=0.0001)


def test_private_event_requires_a_run_and_exposure_token() -> None:
  event = ProductEvent(
    eventId=uuid4(),
    eventType="impression",
    occurredAt=datetime.now(timezone.utc),
    section="ar",
    productId=uuid4(),
  )
  with pytest.raises(AppError) as error:
    validate_event_source(event)
  assert error.value.code == "EVENT_SOURCE_REQUIRED"
