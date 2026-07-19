from io import BytesIO

from PIL import Image, ImageDraw

from app.services.makeup_recommendation_fit import build_post_image_fit_assessment
from app.services.makeup_recommendation_semantic import (
  build_semantic_makeup_color_metadata,
)


AREAS = ("base", "brow", "eye", "cheek", "lip")
COLORS = {
  "base": "#D8A078",
  "brow": "#604030",
  "eye": "#805090",
  "cheek": "#C86070",
  "lip": "#B03050",
}


def _look() -> dict:
  return {
    "lookMap": {
      "naturalityToPersonality": 50,
      "casualToGlam": 30,
    },
    "areaGuides": [
      {
        "area": area,
        "color": {"name": area, "hex": COLORS[area]},
      }
      for area in AREAS
    ],
  }


def _crop_metadata() -> dict:
  return {
    "areas": {
      area: [{
        "regionId": area,
        "box": {
          "left": index / 5,
          "top": 0,
          "right": (index + 1) / 5,
          "bottom": 1,
        },
      }]
      for index, area in enumerate(AREAS)
    },
  }


def _image_bytes() -> bytes:
  image = Image.new("RGB", (500, 100))
  draw = ImageDraw.Draw(image)
  for index, area in enumerate(AREAS):
    draw.rectangle((index * 100, 0, (index + 1) * 100 - 1, 99), fill=COLORS[area])
  output = BytesIO()
  image.save(output, format="PNG")
  return output.getvalue()


def _fit_assessment() -> dict:
  return {
    "overallScore": 80,
    "dimensions": {
      key: {"available": True, "score": 80, "reason": "plan"}
      for key in (
        "situation",
        "preference",
        "personalColor",
        "faceStructure",
        "skinCompatibility",
        "lookCoherence",
      )
    },
    "evidence": [],
  }


def test_semantic_color_metadata_reads_all_face_areas_without_source_baseline() -> None:
  metadata = build_semantic_makeup_color_metadata(
    _image_bytes(),
    crop_metadata=_crop_metadata(),
    look=_look(),
  )

  assert metadata is not None
  assert metadata["status"] == "completed"
  assert metadata["validAreaCount"] == 5
  assert metadata["baselineCompared"] is False
  assert metadata["score"] >= 85
  assert metadata["textureVerified"] is False
  assert metadata["verifiedSignals"] == [
    "hue",
    "saturation",
    "brightness",
    "targetColorPresence",
  ]
  assert "질감" in metadata["limitation"]
  assert {item["area"] for item in metadata["areas"]} == set(AREAS)


def test_semantic_color_metadata_requires_at_least_three_valid_crops() -> None:
  crop_metadata = _crop_metadata()
  crop_metadata["areas"] = {
    key: value
    for key, value in crop_metadata["areas"].items()
    if key in {"base", "lip"}
  }

  assert build_semantic_makeup_color_metadata(
    _image_bytes(),
    crop_metadata=crop_metadata,
    look=_look(),
  ) is None


def test_post_image_fit_persists_semantic_contract_and_keeps_fallback_cap() -> None:
  look = _look()
  look["fitAssessment"] = _fit_assessment()
  semantic = build_semantic_makeup_color_metadata(
    _image_bytes(),
    crop_metadata=_crop_metadata(),
    look=look,
  )
  assert semantic is not None
  provenance = {
    "width": 500,
    "height": 100,
    "cropMetadata": _crop_metadata(),
    "semanticColorMetadata": semantic,
  }

  updated = build_post_image_fit_assessment(
    look,
    generation_source="claude",
    image_status="completed",
    provenance=provenance,
  )
  fallback = build_post_image_fit_assessment(
    look,
    generation_source="deterministic_fallback",
    image_status="completed",
    provenance=provenance,
  )

  assert updated is not None
  assert fallback is not None
  validation = updated["imageValidation"]
  assert validation["validationSource"] == "generated_semantic_color"
  assert validation["semanticMakeupVerified"] is True
  assert validation["semanticColorScore"] == semantic["score"]
  assert validation["semanticAreaCount"] == 5
  assert validation["verifiedSignals"] == semantic["verifiedSignals"]
  assert validation["textureVerified"] is False
  assert validation["semanticBaselineCompared"] is False
  assert "질감" in validation["limitation"]
  assert len(validation["semanticAreaScores"]) == 5
  assert fallback["overallScore"] <= 74
