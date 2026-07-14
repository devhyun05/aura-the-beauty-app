"""Validation, minimisation and projection for saved AR look recipes."""

from __future__ import annotations

from copy import deepcopy
import math
import re
from typing import Any

from app.core.errors import AppError
from app.services.product_color import normalize_hex_color, srgb_hex_to_lab


SAVED_AR_LOOK_SCHEMA = "saved_ar_look_v1"
RECIPE_CONTRACT = "FullFaceMakeupRecipe"
ALLOWED_REGIONS = {"foundation", "lip", "blush", "brow", "eyeliner", "lens"}
PRODUCT_REGION_BY_RUNTIME = {
  "lip": "lip",
  "blush": "cheek",
  "eyeliner": "liner",
  "foundation": "base",
  "brow": "brow",
}
P0_PRODUCT_REGIONS = {"lip", "cheek", "liner"}
ALLOWED_BLEND_MODES = {"normal", "multiply", "screen"}
ALLOWED_HALF_FACE_MODES = {"off", "left", "right"}
ALLOWED_FINISHES = {
  "natural",
  "matte",
  "glow",
  "natural-makeup",
  "cream",
  "gloss",
  "soft-powder",
  "cream-blush",
  "sheer-glow",
  "soft-powder-brow",
  "hair-stroke-brow",
  "defined-brow",
  "soft-eye-line",
  "defined-eye-line",
  "soft-eye-shimmer",
  "natural-lens",
  "gradient",
}
CANONICAL_FINISH = {
  "natural": "natural",
  "matte": "matte",
  "glow": "glow",
  "natural-makeup": "natural",
  "cream": "cream",
  "gloss": "gloss",
  "soft-powder": "powder",
  "cream-blush": "cream",
  "sheer-glow": "sheer_glow",
  "soft-powder-brow": "powder",
  "hair-stroke-brow": "natural",
  "defined-brow": "defined",
  "soft-eye-line": "soft_line",
  "defined-eye-line": "defined_line",
  "soft-eye-shimmer": "shimmer",
  "gradient": "gradient",
}
SENSITIVE_KEY_PATTERN = re.compile(
  r"(?:source.?frame|source.?media|camera.?frame|raw.?frame|landmark|face.?embedding|identity.?embedding|face.?image)",
  re.IGNORECASE,
)
ALLOWED_AR_LOOK_SOURCES = {"face-analysis-full-face", "ar_editor", "preset"}
RECIPE_FIELDS = {
  "version", "recipeId", "recipeBatchId", "lookId", "rendererMode", "activeRegions",
  "region", "layerCount", "enabledLayerCount", "sentAtMs", "halfFaceMode", "layers",
}
RECIPE_LAYER_FIELDS = {
  "id", "recipeId", "recipeBatchId", "lookId", "sentAtMs", "activeRegions",
  "layerCount", "enabledLayerCount", "region", "layer", "enabled", "color",
  "secondaryColor", "opacity", "texture", "sample", "textureMode", "intensity",
  "feather", "blendMode", "rendererMode", "coverage", "maskSpreadX", "maskOffsetY",
  "browGap", "browAngle", "browArch", "browArchPosition", "finish", "textureAmount",
  "gradientAmount", "roughness", "specular", "specularPower", "glossBoost",
  "detailAmount", "browCleanupEnabled", "browCleanupStrength", "browReshapeStrength",
  "browCleanupSourceMode", "shimmer", "shimmerColor", "skinAdaptive", "preserveDetail",
  "materialId", "shaderMode", "passCount", "candidateId", "maskTextureId",
  "maskThreshold", "maskFeatherUvNormalized", "cornerReach", "upperLipTightness",
  "lowerLipTightness", "upperInnerFill", "verticalOffset", "cameraBackdropAvailable",
  "lightEstimateAvailable", "mode", "fallbackMode", "debugMaskMode", "foundationMode",
  "foundationFallbackMode",
}


def _contract_error(code: str, message: str, **details: Any) -> AppError:
  return AppError(422, code, message, details)


def strip_sensitive_recipe_data(value: Any) -> Any:
  if isinstance(value, list):
    return [strip_sensitive_recipe_data(item) for item in value]
  if not isinstance(value, dict):
    return value
  return {
    key: strip_sensitive_recipe_data(item)
    for key, item in value.items()
    if not SENSITIVE_KEY_PATTERN.search(str(key))
  }


def _known_fields(value: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
  return {key: deepcopy(item) for key, item in value.items() if key in allowed}


def _number_in_unit_interval(value: Any, field: str, region: str) -> float:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    raise _contract_error("INVALID_AR_RECIPE", f"{field} must be a number.", region=region, field=field)
  normalized = float(value)
  if not math.isfinite(normalized) or normalized < 0 or normalized > 1:
    raise _contract_error("INVALID_AR_RECIPE", f"{field} must be between 0 and 1.", region=region, field=field)
  return normalized


def normalize_saved_ar_look(style_payload: dict[str, Any]) -> dict[str, Any]:
  """Validate recipe v2 and return a server-authored, privacy-minimised envelope."""

  if not isinstance(style_payload, dict):
    raise _contract_error("INVALID_AR_LOOK", "stylePayload must be an object.")
  if style_payload.get("schemaVersion") != SAVED_AR_LOOK_SCHEMA:
    raise _contract_error("UNSUPPORTED_AR_LOOK", "Only saved_ar_look_v1 is supported.")
  if style_payload.get("recipeContract") != RECIPE_CONTRACT:
    raise _contract_error("UNSUPPORTED_AR_RECIPE", "FullFaceMakeupRecipe is required.")

  stripped = strip_sensitive_recipe_data(deepcopy(style_payload))
  source = stripped.get("source")
  if source is not None and source not in ALLOWED_AR_LOOK_SOURCES:
    raise _contract_error("INVALID_AR_LOOK", "Unsupported AR look source.")
  raw_recipe = stripped.get("recipe")
  if not isinstance(raw_recipe, dict) or raw_recipe.get("version") != 2:
    raise _contract_error("UNSUPPORTED_AR_RECIPE", "Recipe version 2 is required.")
  recipe = _known_fields(raw_recipe, RECIPE_FIELDS)
  raw_layers = raw_recipe.get("layers")
  if isinstance(raw_layers, list):
    recipe["layers"] = [
      _known_fields(layer, RECIPE_LAYER_FIELDS) if isinstance(layer, dict) else layer
      for layer in raw_layers
    ]
  minimized: dict[str, Any] = {
    "schemaVersion": SAVED_AR_LOOK_SCHEMA,
    "recipeContract": RECIPE_CONTRACT,
    "recipe": recipe,
  }
  if source is not None:
    minimized["source"] = source
  if recipe.get("rendererMode") != "smooth-region-mask":
    raise _contract_error("INVALID_AR_RECIPE", "Unsupported rendererMode.")
  if recipe.get("halfFaceMode", "off") not in ALLOWED_HALF_FACE_MODES:
    raise _contract_error("INVALID_AR_RECIPE", "Unsupported halfFaceMode.")
  layers = recipe.get("layers")
  if not isinstance(layers, list) or not 1 <= len(layers) <= 8:
    raise _contract_error("INVALID_AR_RECIPE", "Recipe must contain between 1 and 8 layers.")
  if recipe.get("layerCount") is not None and recipe.get("layerCount") != len(layers):
    raise _contract_error("INVALID_AR_RECIPE", "layerCount must match the recipe layers.")
  enabled_count = sum(1 for layer in layers if isinstance(layer, dict) and layer.get("enabled") is True)
  if recipe.get("enabledLayerCount") is not None and recipe.get("enabledLayerCount") != enabled_count:
    raise _contract_error("INVALID_AR_RECIPE", "enabledLayerCount must match enabled layers.")

  seen_regions: set[str] = set()
  projection_regions: list[dict[str, Any]] = []
  for layer in layers:
    if not isinstance(layer, dict):
      raise _contract_error("INVALID_AR_RECIPE", "Every recipe layer must be an object.")
    region = str(layer.get("region") or "").strip()
    if region not in ALLOWED_REGIONS or region in seen_regions:
      raise _contract_error("INVALID_AR_RECIPE", "Recipe regions must be unique and supported.", region=region)
    seen_regions.add(region)
    if not isinstance(layer.get("enabled"), bool):
      raise _contract_error("INVALID_AR_RECIPE", "enabled must be boolean.", region=region)
    if layer.get("layer") is not None and layer.get("layer") != region:
      raise _contract_error("INVALID_AR_RECIPE", "layer must match region.", region=region)
    if layer.get("rendererMode") is not None and layer.get("rendererMode") != "smooth-region-mask":
      raise _contract_error("INVALID_AR_RECIPE", "Layer rendererMode is unsupported.", region=region)
    color = normalize_hex_color(str(layer.get("color") or ""))
    layer["color"] = color
    finish = str(layer.get("finish") or "").strip()
    if finish not in ALLOWED_FINISHES:
      raise _contract_error("INVALID_AR_RECIPE", "Unsupported finish.", region=region, finish=finish)
    blend_mode = str(layer.get("blendMode") or "").strip()
    if blend_mode not in ALLOWED_BLEND_MODES:
      raise _contract_error("INVALID_AR_RECIPE", "Unsupported blend mode.", region=region)
    intensity = _number_in_unit_interval(layer.get("intensity"), "intensity", region)
    opacity = _number_in_unit_interval(layer.get("opacity"), "opacity", region)
    for key, value in layer.items():
      if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(float(value)) or abs(value) > 1_000_000_000_000:
          raise _contract_error("INVALID_AR_RECIPE", "Layer numbers must be finite and bounded.", region=region, field=key)
      if isinstance(value, str) and len(value) > 256:
        raise _contract_error("INVALID_AR_RECIPE", "Layer strings are too long.", region=region, field=key)
      if isinstance(value, (dict, list, tuple, set)):
        raise _contract_error("INVALID_AR_RECIPE", "Layer fields must be scalar.", region=region, field=key)

    product_region = PRODUCT_REGION_BY_RUNTIME.get(region)
    if layer["enabled"] and product_region in P0_PRODUCT_REGIONS:
      lab_l, lab_a, lab_b = srgb_hex_to_lab(color)
      projection_regions.append(
        {
          "runtimeRegion": region,
          "productRegion": product_region,
          "authoringColorHex": color,
          "authoringColorLab": {"l": lab_l, "a": lab_a, "b": lab_b},
          "rawFinish": finish,
          "canonicalFinish": CANONICAL_FINISH.get(finish, finish.replace("-", "_")),
          "intensity": intensity,
          "opacity": opacity,
          "blendMode": blend_mode,
        }
      )

  minimized["schemaVersion"] = SAVED_AR_LOOK_SCHEMA
  minimized["recipeContract"] = RECIPE_CONTRACT
  minimized["rendererVersion"] = "smooth-region-mask/recipe-v2"
  minimized["recommendationProjection"] = {
    "version": "ar_recommendation_projection_v1",
    "colorSemantics": "authoring_color",
    "regions": projection_regions,
  }
  minimized["thumbnailRepresentation"] = {
    "version": "saved_ar_swatch_mosaic_v1",
    "kind": "swatch_mosaic",
    "colors": [region["authoringColorHex"] for region in projection_regions],
  }
  return minimized
