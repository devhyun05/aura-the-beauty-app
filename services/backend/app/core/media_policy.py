ALLOWED_UPLOAD_MEDIA_KINDS = frozenset(
  {
    "capture",
    "community-thread",
    "community-thread-thumbnail",
    "consulting-chat",
    "filter-extraction",
    "hair-analysis-mask",
    "hair-analysis-source",
    "makeup_feedback",
    "profile-avatar",
  },
)

UPLOAD_CONTENT_TYPE_EXTENSIONS = {
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
