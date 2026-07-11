from __future__ import annotations

import base64
import hashlib
from io import BytesIO
import json
import logging
import math
from pathlib import Path
import re
import tempfile
from typing import Any

from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageStat

try:
  from pillow_heif import register_heif_opener

  register_heif_opener()
except ImportError:  # pragma: no cover
  pass

try:
  import mediapipe as mp
  import numpy as np
  from mediapipe.tasks import python as mp_python
  from mediapipe.tasks.python import vision as mp_vision
except ImportError:  # pragma: no cover - exercised only before production deps are installed.
  mp = None
  np = None
  mp_python = None
  mp_vision = None

try:
  from openai import OpenAI
except ImportError:  # pragma: no cover
  OpenAI = None

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.hair_catalog import HairStyle, recommend_hair_styles


logger = logging.getLogger(__name__)

FACE_SHAPES = {"oval", "round", "square", "heart", "oblong", "diamond"}
HAIR_LENGTHS = {"short", "bob", "medium", "long"}
BANGS = {"none", "full", "curtain", "side", "see_through"}
PARTS = {"center", "left", "right", "none"}
TEXTURES = {"straight", "wavy", "curly"}
VOLUMES = {"low", "medium", "high"}
HAIRLINES = {"low", "balanced", "high"}
QUALITY_LANDMARK_INDICES = (10, 33, 61, 152, 234, 263, 291, 454)
MAX_HAIR_IMAGE_PIXELS = 40_000_000

HAIR_ANALYSIS_RESPONSE_FORMAT = {
  "type": "json_schema",
  "name": "aura_hair_analysis",
  "strict": True,
  "schema": {
    "type": "object",
    "additionalProperties": False,
    "properties": {
      "faceShape": {"type": "string", "enum": sorted(FACE_SHAPES)},
      "currentLength": {"type": "string", "enum": sorted(HAIR_LENGTHS)},
      "bangs": {"type": "string", "enum": sorted(BANGS)},
      "part": {"type": "string", "enum": sorted(PARTS)},
      "texture": {"type": "string", "enum": sorted(TEXTURES)},
      "volume": {"type": "string", "enum": sorted(VOLUMES)},
      "hairline": {"type": "string", "enum": sorted(HAIRLINES)},
      "currentColor": {"type": "string"},
      "confidence": {"type": "number", "minimum": 0, "maximum": 1},
      "summary": {"type": "string"},
      "personCount": {"type": "integer", "minimum": 0},
      "frontFacing": {"type": "boolean"},
      "faceAndShouldersVisible": {"type": "boolean"},
      "hatDetected": {"type": "boolean"},
    },
    "required": [
      "faceShape",
      "currentLength",
      "bangs",
      "part",
      "texture",
      "volume",
      "hairline",
      "currentColor",
      "confidence",
      "summary",
      "personCount",
      "frontFacing",
      "faceAndShouldersVisible",
      "hatDetected",
    ],
  },
}


def _json_object(text: str) -> dict[str, Any]:
  normalized = text.strip()
  fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", normalized, flags=re.DOTALL)
  if fenced:
    normalized = fenced.group(1)

  try:
    payload = json.loads(normalized)
  except json.JSONDecodeError as error:
    raise AppError(502, "HAIR_ANALYSIS_INVALID_JSON", "Hair analysis returned invalid JSON.") from error

  if not isinstance(payload, dict):
    raise AppError(502, "HAIR_ANALYSIS_INVALID_RESULT", "Hair analysis must return an object.")
  return payload


def _enum(value: object, allowed: set[str], fallback: str) -> str:
  normalized = str(value or "").strip().lower()
  return normalized if normalized in allowed else fallback


def _confidence(value: object) -> float:
  try:
    return round(max(0.0, min(1.0, float(value))), 4)
  except (TypeError, ValueError):
    return 0.5


def _optional_bool(value: object) -> bool | None:
  if isinstance(value, bool):
    return value
  if isinstance(value, str) and value.strip().lower() in {"true", "false"}:
    return value.strip().lower() == "true"
  return None


def create_openai_safety_identifier(user_id: object) -> str:
  return hashlib.sha256(f"aura-hair:{user_id}".encode("utf-8")).hexdigest()


def _normalize_openai_error(error: Exception, operation: str) -> AppError:
  status_code = getattr(error, "status_code", None)
  provider_code = getattr(error, "code", None)
  if provider_code == "moderation_blocked":
    return AppError(
      422,
      "HAIR_AI_MODERATION_BLOCKED",
      "The photo could not be processed by the image safety check.",
    )
  if status_code in {400, 404, 422}:
    return AppError(422, "HAIR_AI_INPUT_REJECTED", f"Hair {operation} input was rejected.")
  if status_code in {401, 403}:
    return AppError(503, "OPENAI_CONFIGURATION_ERROR", "OpenAI access is not configured correctly.")
  if status_code == 429 or (isinstance(status_code, int) and status_code >= 500):
    return AppError(503, "OPENAI_TEMPORARILY_UNAVAILABLE", f"Hair {operation} is temporarily unavailable.")
  return AppError(502, "OPENAI_INVOCATION_FAILED", f"Hair {operation} failed.")


class HairProcessingService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _openai(self):
    if OpenAI is None:
      raise AppError(503, "OPENAI_SDK_NOT_INSTALLED", "The OpenAI SDK is required.")
    if not self.settings.openai_api_key:
      raise AppError(503, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is required.")
    return OpenAI(
      api_key=self.settings.openai_api_key,
      base_url="https://api.openai.com/v1",
      max_retries=0,
      timeout=self.settings.hair_worker_request_timeout_seconds,
    )

  def _load_image(self, image_bytes: bytes, mode: str = "RGB") -> Image.Image:
    try:
      with Image.open(BytesIO(image_bytes)) as opened:
        if opened.width * opened.height > MAX_HAIR_IMAGE_PIXELS:
          raise AppError(413, "HAIR_IMAGE_TOO_LARGE", "The image dimensions exceed the allowed size.")
        return ImageOps.exif_transpose(opened).convert(mode)
    except AppError:
      raise
    except Exception as error:  # noqa: BLE001 - normalize Pillow and HEIF decoder errors.
      raise AppError(422, "HAIR_IMAGE_INVALID", "The uploaded media is not a valid image.") from error

  def segment_hair(self, source_bytes: bytes) -> bytes:
    model_path = Path(self.settings.hair_segmenter_model_path)
    if mp is None or np is None or mp_python is None or mp_vision is None:
      raise AppError(503, "HAIR_SEGMENTER_NOT_INSTALLED", "MediaPipe Hair Segmenter is not installed.")
    if not model_path.exists():
      raise AppError(
        503,
        "HAIR_SEGMENTER_MODEL_MISSING",
        f"Hair Segmenter model was not found at {model_path}.",
      )

    source = self._load_image(source_bytes)
    image_data = np.asarray(source)

    options = mp_vision.ImageSegmenterOptions(
      base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
      output_category_mask=True,
      output_confidence_masks=False,
    )
    with mp_vision.ImageSegmenter.create_from_options(options) as segmenter:
      result = segmenter.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=image_data))

    if result.category_mask is None:
      raise AppError(422, "HAIR_MASK_NOT_FOUND", "Hair could not be segmented from this photo.")

    mask_array = result.category_mask.numpy_view()
    # The official binary hair model emits background=0 and hair=1.
    mask = Image.fromarray((mask_array > 0).astype("uint8") * 255, mode="L")
    buffer = BytesIO()
    mask.save(buffer, format="PNG")
    return buffer.getvalue()

  def validate_hair_mask(self, source_bytes: bytes, mask_bytes: bytes) -> dict[str, Any]:
    try:
      source = self._load_image(source_bytes)
      mask = self._load_image(mask_bytes, "L").resize(source.size, Image.Resampling.BILINEAR)
    except Exception as error:  # noqa: BLE001 - callers only need a normalized quality result.
      return {"passed": False, "reason": "invalid_image", "errorType": type(error).__name__}

    binary = mask.point(lambda value: 255 if value >= 64 else 0)
    histogram = binary.histogram()
    total_pixels = max(1, source.width * source.height)
    coverage = histogram[255] / total_pixels
    bounding_box = binary.getbbox()
    upper_frame_overlap = bool(bounding_box and bounding_box[1] < source.height * 0.62)
    passed = bounding_box is not None and 0.005 <= coverage <= 0.68 and upper_frame_overlap
    return {
      "passed": passed,
      "coverage": round(coverage, 5),
      "upperFrameOverlap": upper_frame_overlap,
      "bounds": list(bounding_box) if bounding_box else None,
    }

  def analyze_hair(
    self,
    source_bytes: bytes,
    *,
    device_payload: dict[str, Any] | None = None,
    end_user_id: object | None = None,
  ) -> dict[str, Any]:
    analysis_image = self._prepare_analysis_jpeg(source_bytes)
    image_base64 = base64.b64encode(analysis_image).decode("ascii")
    device_payload = device_payload or {}
    prompt = (
      "Analyze exactly one front-facing person's face shape and current hairstyle. "
      "Do not infer gender, ethnicity, identity, health, or attractiveness. "
      "Return JSON only with these keys and enum values: "
      "faceShape=oval|round|square|heart|oblong|diamond; "
      "currentLength=short|bob|medium|long; bangs=none|full|curtain|side|see_through; "
      "part=center|left|right|none; texture=straight|wavy|curly; "
      "volume=low|medium|high; hairline=low|balanced|high; "
      "currentColor as a short neutral color-family label; confidence from 0 to 1; "
      "summary as one concise Korean sentence; personCount as an integer; "
      "frontFacing, faceAndShouldersVisible, and hatDetected as booleans. Use visible evidence only."
    )
    request: dict[str, Any] = {
      "model": self.settings.openai_analysis_model_id,
      "input": [
        {
          "role": "developer",
          "content": "You are a conservative salon hairstyle analyst. Output strict JSON only.",
        },
        {
          "role": "user",
          "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": f"data:image/jpeg;base64,{image_base64}"},
          ],
        },
      ],
      "text": {"format": HAIR_ANALYSIS_RESPONSE_FORMAT, "verbosity": "low"},
    }
    if end_user_id is not None:
      request["safety_identifier"] = create_openai_safety_identifier(end_user_id)
    try:
      response = self._openai().responses.create(**request)
    except Exception as error:  # noqa: BLE001 - normalize OpenAI SDK exception families.
      raise _normalize_openai_error(error, "analysis") from error
    payload = _json_object(getattr(response, "output_text", ""))
    native_hairline = device_payload.get("hairline") if isinstance(device_payload, dict) else None
    raw_hairline_confidence = (
      device_payload.get("hairlineConfidence") if isinstance(device_payload, dict) else None
    )
    native_hairline_confidence = (
      _confidence(raw_hairline_confidence) if raw_hairline_confidence is not None else 0.0
    )
    if native_hairline_confidence < 0.5:
      native_hairline = None
    capture_quality = {
      "personCount": payload.get("personCount"),
      "frontFacing": _optional_bool(payload.get("frontFacing")),
      "faceAndShouldersVisible": _optional_bool(payload.get("faceAndShouldersVisible")),
      "hatDetected": _optional_bool(payload.get("hatDetected")),
    }
    try:
      person_count = int(capture_quality["personCount"])
    except (TypeError, ValueError):
      person_count = None
    if person_count is not None and person_count != 1:
      raise AppError(422, "HAIR_CAPTURE_PERSON_COUNT", "Use a photo containing exactly one person.")
    if capture_quality["frontFacing"] is False:
      raise AppError(422, "HAIR_CAPTURE_NOT_FRONTAL", "Use a front-facing photo.")
    if capture_quality["faceAndShouldersVisible"] is False:
      raise AppError(422, "HAIR_CAPTURE_FRAMING", "Keep the full face and shoulders in frame.")
    if capture_quality["hatDetected"] is True:
      raise AppError(422, "HAIR_CAPTURE_HAT", "Remove hats or hair coverings and try again.")
    capture_quality["personCount"] = person_count

    analysis = {
      "schemaVersion": "aura-hair-analysis-v1",
      "faceShape": _enum(payload.get("faceShape"), FACE_SHAPES, "oval"),
      "currentLength": _enum(payload.get("currentLength"), HAIR_LENGTHS, "medium"),
      "bangs": _enum(payload.get("bangs"), BANGS, "none"),
      "part": _enum(payload.get("part"), PARTS, "none"),
      "texture": _enum(payload.get("texture"), TEXTURES, "straight"),
      "volume": _enum(payload.get("volume"), VOLUMES, "medium"),
      "hairline": _enum(
        native_hairline if isinstance(native_hairline, str) else payload.get("hairline"),
        HAIRLINES,
        "balanced",
      ),
      "currentColor": str(payload.get("currentColor") or "natural").strip()[:40],
      "confidence": _confidence(payload.get("confidence")),
      "summary": str(payload.get("summary") or "현재 헤어와 얼굴 비율을 분석했어요.").strip()[:240],
      "captureQuality": capture_quality,
    }
    analysis["recommendations"] = recommend_hair_styles(analysis)
    return analysis

  def prepare_edit_mask(self, source_bytes: bytes, hair_mask_bytes: bytes) -> bytes:
    source = self._load_image(source_bytes)
    hair_mask = self._load_image(hair_mask_bytes, "L").resize(source.size, Image.Resampling.LANCZOS)

    binary = hair_mask.point(lambda value: 255 if value >= 96 else 0)
    expanded = binary.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.MaxFilter(31))
    expanded = expanded.filter(ImageFilter.GaussianBlur(8))
    alpha = ImageOps.invert(expanded)

    face_box = self._detect_single_face_box(source)
    if face_box is not None:
      left, top, right, bottom = face_box
      protect_top = int(top + (bottom - top) * 0.23)
      alpha.paste(255, (left, protect_top, right, bottom))
      neck_width = max(1, int((right - left) * 0.30))
      neck_center = (left + right) // 2
      alpha.paste(
        255,
        (
          max(0, neck_center - neck_width // 2),
          bottom,
          min(source.width, neck_center + neck_width // 2),
          min(source.height, int(bottom + (bottom - top) * 0.55)),
        ),
      )

    rgba = Image.new("RGBA", source.size, (255, 255, 255, 255))
    rgba.putalpha(alpha)
    buffer = BytesIO()
    rgba.save(buffer, format="PNG")
    return buffer.getvalue()

  def _detect_face_boxes(self, image: Image.Image) -> list[tuple[int, int, int, int]] | None:
    if mp is None or np is None or not hasattr(mp, "solutions"):
      return None
    try:
      with mp.solutions.face_detection.FaceDetection(  # type: ignore[attr-defined]
        model_selection=1,
        min_detection_confidence=0.5,
      ) as detector:
        result = detector.process(np.asarray(image.convert("RGB")))
    except Exception:  # noqa: BLE001 - mask protection is best effort.
      return None

    detections = list(result.detections or [])
    width, height = image.size
    return [
      (
        max(0, int(detection.location_data.relative_bounding_box.xmin * width)),
        max(0, int(detection.location_data.relative_bounding_box.ymin * height)),
        min(
          width,
          int(
            (
              detection.location_data.relative_bounding_box.xmin
              + detection.location_data.relative_bounding_box.width
            )
            * width
          ),
        ),
        min(
          height,
          int(
            (
              detection.location_data.relative_bounding_box.ymin
              + detection.location_data.relative_bounding_box.height
            )
            * height
          ),
        ),
      )
      for detection in detections
    ]

  def _detect_single_face_box(self, image: Image.Image) -> tuple[int, int, int, int] | None:
    boxes = self._detect_face_boxes(image)
    return boxes[0] if boxes is not None and len(boxes) == 1 else None

  def _detect_face_landmarks(
    self,
    image: Image.Image,
  ) -> list[list[tuple[float, float]]] | None:
    if mp is None or np is None or not hasattr(mp, "solutions"):
      return None
    try:
      with mp.solutions.face_mesh.FaceMesh(  # type: ignore[attr-defined]
        static_image_mode=True,
        max_num_faces=2,
        refine_landmarks=False,
        min_detection_confidence=0.5,
      ) as detector:
        result = detector.process(np.asarray(image.convert("RGB")))
    except Exception:  # noqa: BLE001 - quality evaluation reports detector failure.
      return None

    return [
      [
        (
          float(face.landmark[index].x),
          float(face.landmark[index].y),
        )
        for index in QUALITY_LANDMARK_INDICES
      ]
      for face in list(result.multi_face_landmarks or [])
    ]

  def generate_simulation(
    self,
    *,
    source_bytes: bytes,
    hair_mask_bytes: bytes,
    reference_bytes: bytes,
    style: HairStyle,
    end_user_id: object | None = None,
  ) -> tuple[bytes, dict[str, Any]]:
    source_png = self._to_png(source_bytes)
    reference_png = self._to_png(reference_bytes)
    edit_mask = self.prepare_edit_mask(source_png, hair_mask_bytes)
    last_quality: dict[str, Any] = {}

    for quality_attempt in range(2):
      output = self._request_image_edit(
        source_png=source_png,
        reference_png=reference_png,
        edit_mask=edit_mask,
        style=style,
        strict=quality_attempt == 1,
        end_user_id=end_user_id,
      )
      quality = self.evaluate_quality(source_png, output, edit_mask)
      quality["qualityAttempt"] = quality_attempt + 1
      last_quality = quality
      if quality["passed"]:
        return output, quality

    raise AppError(
      422,
      "HAIR_SIMULATION_QUALITY_FAILED",
      "The generated hairstyle did not preserve the original photo.",
      details=last_quality,
    )

  def _request_image_edit(
    self,
    *,
    source_png: bytes,
    reference_png: bytes,
    edit_mask: bytes,
    style: HairStyle,
    strict: bool,
    end_user_id: object | None,
  ) -> bytes:
    prompt = (
      "Edit the first image into one realistic hairstyle simulation. "
      "Use only the hairstyle shape from the second synthetic reference image. "
      f"Target hairstyle: {style.prompt}. Preserve the user's exact current hair color. "
      "Preserve identity, face geometry, expression, skin, ears, neck, body, clothing, camera, crop, lighting, and background. "
      "Replace all visible original hair inside the editable area, including long hair behind the shoulders when creating a short cut. "
      "Return one photo only with no text, collage, border, logo, or watermark."
    )
    if strict:
      prompt += " This is a correction pass: pixels outside the editable mask and all facial features must remain visually identical."

    paths: list[str] = []
    try:
      for suffix, data in (("-source.png", source_png), ("-reference.png", reference_png), ("-mask.png", edit_mask)):
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as file:
          file.write(data)
          paths.append(file.name)

      with open(paths[0], "rb") as source_file, open(paths[1], "rb") as reference_file, open(paths[2], "rb") as mask_file:
        request: dict[str, Any] = {
          "model": self.settings.openai_image_model_id,
          "image": [source_file, reference_file],
          "mask": mask_file,
          "prompt": prompt,
          "background": "opaque",
          "n": 1,
          "quality": self.settings.hair_generation_quality,
          "size": "auto",
          "output_format": "jpeg",
          "output_compression": 88,
        }
        if end_user_id is not None:
          request["user"] = create_openai_safety_identifier(end_user_id)
        try:
          response = self._openai().images.edit(**request)
        except Exception as error:  # noqa: BLE001 - normalize OpenAI SDK exception families.
          raise _normalize_openai_error(error, "simulation") from error
    finally:
      for path in paths:
        Path(path).unlink(missing_ok=True)

    encoded = response.data[0].b64_json if response.data else None
    if not encoded:
      raise AppError(502, "HAIR_SIMULATION_EMPTY", "Image generation returned no image.")
    return base64.b64decode(encoded)

  def _to_png(self, image_bytes: bytes) -> bytes:
    image = self._load_image(image_bytes)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()

  def _prepare_analysis_jpeg(self, image_bytes: bytes) -> bytes:
    image = self._load_image(image_bytes)
    max_edge = max(512, self.settings.openai_image_input_max_edge)
    if max(image.size) > max_edge:
      image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    image.save(
      buffer,
      format="JPEG",
      optimize=True,
      quality=max(60, min(95, self.settings.openai_image_input_quality)),
    )
    return buffer.getvalue()

  def evaluate_quality(
    self,
    source_bytes: bytes,
    output_bytes: bytes,
    edit_mask_bytes: bytes,
  ) -> dict[str, Any]:
    source = self._load_image(source_bytes)
    output = self._load_image(output_bytes).resize(source.size, Image.Resampling.LANCZOS)
    alpha = self._load_image(edit_mask_bytes, "RGBA").getchannel("A").resize(source.size)

    unchanged_mask = alpha.point(lambda value: 255 if value >= 245 else 0)
    difference = ImageChops.difference(source, output)
    masked_difference = Image.new("RGB", source.size)
    masked_difference.paste(difference, mask=unchanged_mask)
    unchanged_pixels = max(1, ImageStat.Stat(unchanged_mask).sum[0] / 255)
    channel_sum = sum(ImageStat.Stat(masked_difference).sum)
    mean_unchanged_difference = channel_sum / (unchanged_pixels * 3 * 255)
    source_faces = self._detect_face_boxes(source)
    output_faces = self._detect_face_boxes(output)
    face_detector_available = source_faces is not None and output_faces is not None
    face_count_passed = face_detector_available and (
      len(source_faces or []) == 1 and len(output_faces or []) == 1
    )
    source_landmarks = self._detect_face_landmarks(source)
    output_landmarks = self._detect_face_landmarks(output)
    landmark_detector_available = source_landmarks is not None and output_landmarks is not None
    landmark_mean_drift = None
    landmark_max_drift = None
    if (
      landmark_detector_available
      and len(source_landmarks or []) == 1
      and len(output_landmarks or []) == 1
    ):
      distances = [
        math.hypot(source_point[0] - output_point[0], source_point[1] - output_point[1])
        for source_point, output_point in zip(source_landmarks[0], output_landmarks[0], strict=True)
      ]
      landmark_mean_drift = sum(distances) / len(distances)
      landmark_max_drift = max(distances)
    landmark_preserved = (
      landmark_mean_drift is not None
      and landmark_max_drift is not None
      and landmark_mean_drift <= 0.025
      and landmark_max_drift <= 0.06
    )
    face_difference = None
    if source_faces is not None and len(source_faces) == 1:
      face_crop = difference.crop(source_faces[0])
      face_difference = sum(ImageStat.Stat(face_crop).mean) / (3 * 255)

    face_preserved = face_difference is None or face_difference <= 0.18
    passed = (
      face_count_passed
      and face_preserved
      and landmark_preserved
      and mean_unchanged_difference <= 0.22
    )
    return {
      "passed": passed,
      "faceDetectorAvailable": face_detector_available,
      "sourceFaceCount": len(source_faces) if source_faces is not None else None,
      "outputFaceCount": len(output_faces) if output_faces is not None else None,
      "faceMeanDifference": round(face_difference, 5) if face_difference is not None else None,
      "faceDifferenceThreshold": 0.18,
      "landmarkDetectorAvailable": landmark_detector_available,
      "landmarkMeanDrift": round(landmark_mean_drift, 5) if landmark_mean_drift is not None else None,
      "landmarkMeanDriftThreshold": 0.025,
      "landmarkMaxDrift": round(landmark_max_drift, 5) if landmark_max_drift is not None else None,
      "landmarkMaxDriftThreshold": 0.06,
      "outsideEditMeanDifference": round(mean_unchanged_difference, 5),
      "outsideEditThreshold": 0.22,
      "dimensions": {"width": output.width, "height": output.height},
    }
