from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel

CommunityCategory = Literal["lookbook", "question", "product_combo", "before_after"]
CommunityDifficulty = Literal["easy", "medium", "hard"]


class CommunityProductUsageItem(CamelModel):
  name: str = Field(min_length=1, max_length=60)
  shade: str | None = Field(default=None, max_length=60)


class CommunityProductUsage(CamelModel):
  base: list[CommunityProductUsageItem] = Field(default_factory=list, max_length=12)
  eye: list[CommunityProductUsageItem] = Field(default_factory=list, max_length=12)
  cheek: list[CommunityProductUsageItem] = Field(default_factory=list, max_length=12)
  lip: list[CommunityProductUsageItem] = Field(default_factory=list, max_length=12)


class CommunityThreadCreate(CamelModel):
  category: CommunityCategory
  title: str = Field(min_length=1, max_length=30)
  body: str = Field(default="", max_length=2000)
  media_ids: list[UUID] = Field(alias="mediaIds", min_length=1, max_length=4)
  mood_tags: list[str] = Field(default_factory=list, alias="moodTags", max_length=6)
  situation_tags: list[str] = Field(default_factory=list, alias="situationTags", max_length=6)
  difficulty: CommunityDifficulty | None = None
  duration_minutes: int | None = Field(default=None, alias="durationMinutes", ge=1, le=240)
  product_usage: CommunityProductUsage = Field(default_factory=CommunityProductUsage, alias="productUsage")


class CommunityThreadUpdate(CamelModel):
  category: CommunityCategory
  title: str = Field(min_length=1, max_length=30)
  body: str = Field(default="", max_length=2000)
  media_ids: list[UUID] = Field(alias="mediaIds", min_length=1, max_length=4)
  mood_tags: list[str] = Field(default_factory=list, alias="moodTags", max_length=6)
  situation_tags: list[str] = Field(default_factory=list, alias="situationTags", max_length=6)
  difficulty: CommunityDifficulty | None = None
  duration_minutes: int | None = Field(default=None, alias="durationMinutes", ge=1, le=240)
  product_usage: CommunityProductUsage = Field(default_factory=CommunityProductUsage, alias="productUsage")


class CommunityReplyCreate(CamelModel):
  body: str = Field(min_length=1, max_length=1000)
  parent_reply_id: UUID | None = Field(default=None, alias="parentReplyId")


class CommunityReplyUpdate(CamelModel):
  body: str = Field(min_length=1, max_length=1000)


class CommunityEventCreate(CamelModel):
  event_type: str = Field(alias="eventType", min_length=1, max_length=30)
  thread_id: UUID | None = Field(default=None, alias="threadId")
  search_query: str | None = Field(default=None, alias="searchQuery", max_length=120)
  dwell_ms: int | None = Field(default=None, alias="dwellMs", ge=0, le=3600000)


class CommunityEventsCreate(CamelModel):
  events: list[CommunityEventCreate] = Field(default_factory=list)
