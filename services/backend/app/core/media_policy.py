ALLOWED_UPLOAD_MEDIA_KINDS = frozenset(
  {
    "capture",
    "community-thread",
    "community-thread-thumbnail",
    "consulting-chat",
    "filter-extraction",
    "golden-mask",
    "hair-analysis-mask",
    "hair-analysis-source",
    "makeup_feedback",
    "profile-avatar",
  },
)

GOLDEN_MASK_MEDIA_KIND = "golden-mask"
GOLDEN_MASK_CONTENT_TYPE = "application/vnd.aura.golden-mask"
GOLDEN_MASK_SCHEMA_VERSION = "aura.golden-mask.v1"
GOLDEN_MASK_MAX_BYTES = 1_048_576

UPLOAD_CONTENT_TYPE_EXTENSIONS = {
  GOLDEN_MASK_CONTENT_TYPE: ".auragm",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}
ALLOWED_UPLOAD_CONTENT_TYPES = frozenset(UPLOAD_CONTENT_TYPE_EXTENSIONS)


def normalize_upload_content_type(content_type: str) -> str:
  return content_type.split(";", 1)[0].strip().lower()


def upload_extension_for_content_type(content_type: str) -> str:
  return UPLOAD_CONTENT_TYPE_EXTENSIONS.get(normalize_upload_content_type(content_type), "")
