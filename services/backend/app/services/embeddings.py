import json
from collections.abc import Mapping
import logging
import math
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.settings import Settings, get_settings


logger = logging.getLogger(__name__)
EMBEDDING_PROVIDER = "bedrock"
EMBEDDING_MODEL_FAMILY = "amazon.titan-embed-text"
EMBEDDING_DIMENSION = 1024
MAX_EMBEDDING_TEXT_LENGTH = 6000


def _clean_text(value: Any, max_length: int | None = None) -> str:
  text = str(value or "").strip()
  if max_length is not None:
    return text[:max_length]
  return text


def _as_list(value: Any) -> list[str]:
  if value is None:
    return []
  if isinstance(value, str):
    return [value] if value.strip() else []
  if isinstance(value, list):
    return [_clean_text(item) for item in value if _clean_text(item)]
  return []


def _as_mapping(value: Any) -> dict[str, Any]:
  if value is None:
    return {}
  if isinstance(value, str):
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}
    return decoded if isinstance(decoded, dict) else {}
  if isinstance(value, Mapping):
    return dict(value)
  if hasattr(value, "model_dump"):
    dumped = value.model_dump()
    return dumped if isinstance(dumped, dict) else {}
  return {}


def _field(source: Any, name: str, default: Any = None) -> Any:
  if isinstance(source, Mapping):
    return source.get(name, default)
  if hasattr(source, "get"):
    try:
      return source.get(name, default)
    except TypeError:
      pass
  try:
    return source[name]
  except (KeyError, IndexError, TypeError):
    return getattr(source, name, default)


def _product_names(product_usage: Any) -> list[str]:
  usage = _as_mapping(product_usage)
  names: list[str] = []
  for group in usage.values():
    if not isinstance(group, list):
      continue
    for item in group:
      if isinstance(item, dict):
        name = _clean_text(item.get("name"))
        shade = _clean_text(item.get("shade"))
        if name and shade:
          names.append(f"{name} {shade}")
        elif name:
          names.append(name)
      elif hasattr(item, "name"):
        name = _clean_text(getattr(item, "name", ""))
        shade = _clean_text(getattr(item, "shade", ""))
        if name and shade:
          names.append(f"{name} {shade}")
        elif name:
          names.append(name)
  return names


def thread_embedding_text(source: Any) -> str:
  mood_tags = _as_list(_field(source, "mood_tags"))
  situation_tags = _as_list(_field(source, "situation_tags"))
  products = _product_names(_field(source, "product_usage"))
  return "\n".join(
    part
    for part in [
      _clean_text(_field(source, "title")),
      f"mood: {' '.join(mood_tags)}" if mood_tags else "",
      f"situation: {' '.join(situation_tags)}" if situation_tags else "",
      f"products: {' '.join(products)}" if products else "",
      _clean_text(_field(source, "body"), 500),
    ]
    if part
  )


def report_embedding_text(source: Any) -> str:
  tags = _as_list(_field(source, "tags"))
  return "\n".join(
    part
    for part in [
      f"personal color: {_clean_text(_field(source, 'personal_color'))}",
      f"skin type: {_clean_text(_field(source, 'skin_type'))}",
      f"recommended mood: {_clean_text(_field(source, 'recommended_mood'))}",
      _clean_text(_field(source, "tone_summary")),
      f"tags: {' '.join(tags)}" if tags else "",
    ]
    if part and not part.endswith(": ")
  )


def format_pgvector(embedding: list[float]) -> str:
  values = [float(value) for value in embedding if math.isfinite(float(value))]
  return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def embedding_match_percent(similarity: float | int | None) -> int:
  if similarity is None:
    return 0
  calibrated = (float(similarity) - 0.18) / (0.55 - 0.18)
  return round(min(1, max(0, calibrated)) * 100)


def _bedrock_embedding_client(settings: Settings):
  client_kwargs = {
    "region_name": settings.effective_bedrock_embedding_region,
    "config": Config(
      connect_timeout=10,
      read_timeout=30,
      retries={"max_attempts": 1},
    ),
  }

  if settings.aws_access_key_id and settings.aws_secret_access_key:
    client_kwargs.update(
      {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
      },
    )

  return boto3.client("bedrock-runtime", **client_kwargs)


def _invoke_bedrock_text_embedding(client: Any, settings: Settings, text: str) -> list[float]:
  model_id = settings.effective_embedding_model_id
  normalized_text = _clean_text(text, MAX_EMBEDDING_TEXT_LENGTH)

  if not model_id or not normalized_text:
    return []

  body: dict[str, Any] = {"inputText": normalized_text}

  if "titan-embed-text-v2" in model_id:
    body.update(
      {
        "dimensions": settings.embedding_dimension,
        "normalize": True,
      },
    )

  response = client.invoke_model(
    modelId=model_id,
    body=json.dumps(body, ensure_ascii=False),
    accept="application/json",
    contentType="application/json",
  )
  payload = json.loads(response["body"].read())
  embedding = payload.get("embedding")

  if not isinstance(embedding, list):
    return []

  return [
    float(value)
    for value in embedding
    if isinstance(value, (int, float)) and math.isfinite(float(value))
  ]


def embed_text(text: str, settings: Settings | None = None) -> list[float] | None:
  content = _clean_text(text)
  if not content:
    return None

  resolved_settings = settings or get_settings()
  if not resolved_settings.effective_embedding_model_id or not resolved_settings.aws_credentials_configured:
    return None

  try:
    embedding = _invoke_bedrock_text_embedding(
      _bedrock_embedding_client(resolved_settings),
      resolved_settings,
      content,
    )
  except (BotoCoreError, ClientError, ValueError, json.JSONDecodeError) as exc:
    logger.warning("[aura:embeddings] bedrock embedding skipped: %s", exc.__class__.__name__)
    return None
  except Exception as exc:  # pragma: no cover - network/provider failures are environment-specific.
    logger.warning("[aura:embeddings] bedrock embedding failed: %s", exc.__class__.__name__)
    return None

  expected_dimension = int(resolved_settings.embedding_dimension or EMBEDDING_DIMENSION)
  if len(embedding) != expected_dimension:
    logger.warning("[aura:embeddings] unexpected dimension: %s", len(embedding))
    return None

  return embedding