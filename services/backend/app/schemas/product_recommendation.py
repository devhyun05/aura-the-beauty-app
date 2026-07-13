from datetime import datetime
import json
from typing import Any, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from app.schemas.base import CamelModel


ProductEventType = Literal["impression", "product_open", "search_result_open", "hide"]
ProductSection = Literal["legacy", "ar", "seasonal", "search", "personalized", "cohort", "auradin"]
PRODUCT_EVENT_CATEGORIES = frozenset({"all", "base", "shadow", "brow", "cheek", "lip", "liner"})


class ProductEvent(CamelModel):
  event_id: UUID = Field(alias="eventId")
  event_type: ProductEventType = Field(alias="eventType")
  occurred_at: datetime = Field(alias="occurredAt")
  section: ProductSection
  product_id: UUID = Field(alias="productId")
  shade_id: UUID | None = Field(default=None, alias="shadeId")
  run_id: UUID | None = Field(default=None, alias="runId")
  collection_id: UUID | None = Field(default=None, alias="collectionId")
  search_request_id: UUID | None = Field(default=None, alias="searchRequestId")
  position: int = Field(default=0, ge=0, le=1000)
  exposure_token: str | None = Field(default=None, alias="exposureToken", max_length=2048)
  context: dict[str, Any] = Field(default_factory=dict)

  @field_validator("context")
  @classmethod
  def validate_context(cls, value: dict[str, Any]) -> dict[str, Any]:
    allowed = {"category", "viewportRatio", "visibleMs", "screen", "source"}
    if any(key not in allowed for key in value):
      raise ValueError("Event context contains an unsupported field.")
    for key in ("screen", "source"):
      if key in value and (not isinstance(value[key], str) or len(value[key]) > 80):
        raise ValueError(f"Event context {key} must be a short string.")
    if "category" in value and value["category"] not in PRODUCT_EVENT_CATEGORIES:
      raise ValueError("Event context category is unsupported.")
    if len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()) > 2048:
      raise ValueError("Event context exceeds 2 KiB.")
    return value


class ProductEventBatch(CamelModel):
  events: list[ProductEvent] = Field(min_length=1, max_length=100)


class ProductLikeRequest(CamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")
  source_shade_id: UUID | None = Field(default=None, alias="sourceShadeId")


class ProductConsentUpdate(CamelModel):
  purpose: Literal["engagement_personalization", "color_cohort"]
  accepted: bool
  version: str = Field(min_length=1, max_length=50)


class ProductPrivacyDeleteRequest(CamelModel):
  target: Literal["engagement", "profile", "all_product_personalization"] = "all_product_personalization"
