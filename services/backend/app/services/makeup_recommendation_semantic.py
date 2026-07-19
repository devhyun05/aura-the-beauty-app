from __future__ import annotations

import colorsys
import io
from typing import Any

import numpy as np
from PIL import Image, ImageOps


SEMANTIC_COLOR_VERSION = "makeup-semantic-color-v1"
SEMANTIC_AREAS = ("base", "brow", "eye", "cheek", "lip")
MIN_SEMANTIC_AREAS = 3
MAX_SAMPLE_PIXELS_PER_REGION = 24_000


def _object(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _number(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  return float(value)


def _bounded(value: float) -> int:
  return max(0, min(100, round(value)))


def _hex_hsv(value: Any) -> tuple[float, float, float] | None:
  text = str(value or "").strip()
  if len(text) != 7 or not text.startswith("#"):
    return None
  try:
    rgb = tuple(int(text[index:index + 2], 16) / 255 for index in (1, 3, 5))
  except ValueError:
    return None
  return colorsys.rgb_to_hsv(*rgb)


def _normalized_box(value: Any) -> tuple[float, float, float, float] | None:
  raw = _object(value)
  coordinates = tuple(_number(raw.get(key)) for key in ("left", "top", "right", "bottom"))
  if any(item is None for item in coordinates):
    return None
  left, top, right, bottom = (float(item) for item in coordinates if item is not None)
  if not 0 <= left < right <= 1 or not 0 <= top < bottom <= 1:
    return None
  return left, top, right, bottom


def _load_rgb(image_bytes: bytes) -> Image.Image:
  with Image.open(io.BytesIO(image_bytes)) as opened:
    image = ImageOps.exif_transpose(opened).convert("RGB")
    image.load()
  return image


def _target_colors(look: dict[str, Any]) -> dict[str, list[tuple[str, tuple[float, float, float]]]]:
  targets: dict[str, list[tuple[str, tuple[float, float, float]]]] = {}
  guides = look.get("areaGuides")
  if not isinstance(guides, list):
    return targets
  for guide in guides:
    if not isinstance(guide, dict):
      continue
    area = str(guide.get("area") or "")
    if area not in SEMANTIC_AREAS:
      continue
    candidate_hexes: list[Any] = [_object(guide.get("color")).get("hex")]
    plan = _object(guide.get("applicationPlan"))
    for step in plan.get("steps", []):
      if not isinstance(step, dict):
        continue
      for color in step.get("colors", []):
        if isinstance(color, dict):
          candidate_hexes.append(color.get("hex"))
    seen: set[str] = set()
    area_targets: list[tuple[str, tuple[float, float, float]]] = []
    for candidate in candidate_hexes:
      text = str(candidate or "").strip().upper()
      hsv = _hex_hsv(text)
      if hsv is None or text in seen:
        continue
      seen.add(text)
      area_targets.append((text, hsv))
    if area_targets:
      targets[area] = area_targets[:6]
  return targets


def _region_hsv_pixels(
  image: Image.Image,
  boxes: list[tuple[float, float, float, float]],
) -> np.ndarray | None:
  samples: list[np.ndarray] = []
  for left, top, right, bottom in boxes:
    pixel_box = (
      max(0, min(image.width - 1, int(left * image.width))),
      max(0, min(image.height - 1, int(top * image.height))),
      max(1, min(image.width, int(np.ceil(right * image.width)))),
      max(1, min(image.height, int(np.ceil(bottom * image.height)))),
    )
    if pixel_box[2] <= pixel_box[0] or pixel_box[3] <= pixel_box[1]:
      continue
    crop = image.crop(pixel_box).convert("HSV")
    values = np.asarray(crop, dtype=np.float32).reshape(-1, 3) / 255.0
    if len(values) > MAX_SAMPLE_PIXELS_PER_REGION:
      stride = max(1, len(values) // MAX_SAMPLE_PIXELS_PER_REGION)
      values = values[::stride][:MAX_SAMPLE_PIXELS_PER_REGION]
    # Exclude clipped highlights and near-black pixels that mostly represent
    # catchlights, pupils, nostrils, or crop-edge background rather than makeup.
    usable = values[(values[:, 2] >= 0.08) & (values[:, 2] <= 0.97)]
    if len(usable) >= 64:
      samples.append(usable)
  if not samples:
    return None
  return np.concatenate(samples, axis=0)


def _area_boxes(crop_metadata: Any, area: str) -> list[tuple[float, float, float, float]]:
  regions = _object(_object(crop_metadata).get("areas")).get(area)
  if not isinstance(regions, list):
    return []
  boxes: list[tuple[float, float, float, float]] = []
  for region in regions:
    box = _normalized_box(_object(region).get("box"))
    if box is not None:
      boxes.append(box)
  return boxes


def _hsv_distance(pixels: np.ndarray, target: tuple[float, float, float]) -> np.ndarray:
  target_hue, target_saturation, target_value = target
  hue_delta = np.abs(pixels[:, 0] - target_hue)
  hue_delta = np.minimum(hue_delta, 1.0 - hue_delta)
  hue_relevance = np.maximum(target_saturation, pixels[:, 1])
  return (
    hue_delta * 2.0 * hue_relevance * 0.45
    + np.abs(pixels[:, 1] - target_saturation) * 0.35
    + np.abs(pixels[:, 2] - target_value) * 0.20
  )


def _target_match(pixels: np.ndarray, target: tuple[float, float, float]) -> tuple[int, float]:
  distances = _hsv_distance(pixels, target)
  # Makeup can occupy a minority of an eye/cheek crop. The 20th percentile
  # measures meaningful presence without cherry-picking a single matching pixel.
  robust_distance = float(np.quantile(distances, 0.20))
  coverage = float(np.mean(distances <= 0.22))
  score = _bounded((1.0 - min(1.0, robust_distance)) * 82 + min(1.0, coverage / 0.35) * 18)
  return score, coverage


def _circular_hue(values: np.ndarray, weights: np.ndarray) -> float:
  angles = values * np.pi * 2
  x = float(np.sum(np.cos(angles) * weights))
  y = float(np.sum(np.sin(angles) * weights))
  if abs(x) + abs(y) < 1e-9:
    return 0.0
  return float((np.arctan2(y, x) / (np.pi * 2)) % 1.0)


def _measured_summary(pixels: np.ndarray) -> dict[str, int]:
  saturation = pixels[:, 1]
  value = pixels[:, 2]
  # Saturation gives hue-bearing pixels more influence while retaining a small
  # floor for neutral foundation/highlight shades.
  weights = np.maximum(0.08, saturation)
  return {
    "hueDegrees": round(_circular_hue(pixels[:, 0], weights) * 360),
    "saturation": _bounded(float(np.median(saturation)) * 100),
    "brightness": _bounded(float(np.median(value)) * 100),
  }


def _look_map_projection(area_summaries: list[dict[str, Any]]) -> dict[str, int] | None:
  measured = [
    _object(item.get("measured"))
    for item in area_summaries
    if isinstance(item.get("measured"), dict)
  ]
  saturations = [_number(item.get("saturation")) for item in measured]
  brightness = [_number(item.get("brightness")) for item in measured]
  sat_values = [value / 100 for value in saturations if value is not None]
  value_values = [value / 100 for value in brightness if value is not None]
  if len(sat_values) < MIN_SEMANTIC_AREAS or len(value_values) < MIN_SEMANTIC_AREAS:
    return None
  average_saturation = sum(sat_values) / len(sat_values)
  average_darkness = sum(1 - value for value in value_values) / len(value_values)
  value_spread = max(value_values) - min(value_values)
  return {
    "naturalityToPersonality": _bounded(12 + average_saturation * 58 + value_spread * 18),
    "casualToGlam": _bounded(14 + average_darkness * 30),
  }


def build_semantic_makeup_color_metadata(
  generated_image_bytes: bytes,
  *,
  crop_metadata: Any,
  look: dict[str, Any],
) -> dict[str, Any] | None:
  """Compare actual face-area HSV pixels with the structured makeup palette.

  This is a deterministic color-presence check, not a classifier. It deliberately
  does not claim that texture, blending technique, or product identity was verified.
  When MediaPipe crop boxes are unavailable, no semantic score is returned.
  """

  targets = _target_colors(look)
  if len(targets) < MIN_SEMANTIC_AREAS:
    return None
  try:
    generated_image = _load_rgb(generated_image_bytes)
  except (OSError, ValueError):
    return None

  area_results: list[dict[str, Any]] = []
  for area in SEMANTIC_AREAS:
    area_targets = targets.get(area)
    boxes = _area_boxes(crop_metadata, area)
    if not area_targets or not boxes:
      continue
    generated_pixels = _region_hsv_pixels(generated_image, boxes)
    if generated_pixels is None:
      continue
    target_results: list[dict[str, Any]] = []
    generated_scores: list[int] = []
    for color_hex, target_hsv in area_targets:
      generated_score, coverage = _target_match(generated_pixels, target_hsv)
      generated_scores.append(generated_score)
      target_result: dict[str, Any] = {
        "hex": color_hex,
        "score": generated_score,
        "coveragePercent": _bounded(coverage * 100),
      }
      target_results.append(target_result)
    target_match_score = sum(generated_scores) / len(generated_scores)
    # Absolute target-color presence is intentionally confidence-capped. Applying
    # generated-image crop boxes to the source image would make a baseline unsafe
    # whenever framing differs even slightly.
    area_score = min(88, target_match_score * 0.92)
    area_results.append({
      "area": area,
      "score": _bounded(area_score),
      "measured": _measured_summary(generated_pixels),
      "targets": target_results,
    })

  if len(area_results) < MIN_SEMANTIC_AREAS:
    return None

  area_score = sum(int(item["score"]) for item in area_results) / len(area_results)
  actual_look_map = _look_map_projection(area_results)
  expected_look_map = _object(look.get("lookMap"))
  expected_personality = _number(expected_look_map.get("naturalityToPersonality"))
  expected_glam = _number(expected_look_map.get("casualToGlam"))
  look_map_score: int | None = None
  if actual_look_map is not None and expected_personality is not None and expected_glam is not None:
    difference = (
      abs(actual_look_map["naturalityToPersonality"] - expected_personality)
      + abs(actual_look_map["casualToGlam"] - expected_glam)
    ) / 2
    # LOOK MAP also contains texture/situation intent, which HSV pixels cannot
    # fully observe, so this color-only projection is intentionally capped.
    look_map_score = min(90, _bounded(100 - difference))

  score = area_score if look_map_score is None else area_score * 0.85 + look_map_score * 0.15
  return {
    "version": SEMANTIC_COLOR_VERSION,
    "status": "completed",
    "score": _bounded(score),
    "validAreaCount": len(area_results),
    "targetAreaCount": len(targets),
    "baselineCompared": False,
    "areas": area_results,
    "lookMapColorScore": look_map_score,
    "actualLookMapColorProjection": actual_look_map,
    "verifiedSignals": ["hue", "saturation", "brightness", "targetColorPresence"],
    "textureVerified": False,
    "limitation": "색상·채도·명도 존재만 휴리스틱으로 확인하며 질감, 블렌딩, 제품 동일성은 판정하지 않습니다.",
  }
