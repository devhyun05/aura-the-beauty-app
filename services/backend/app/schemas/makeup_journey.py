from datetime import date, datetime
from typing import Annotated, Any, Generic, Literal, TypeVar
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.core.casing import to_camel
from app.schemas.base import CamelModel


MissionLevel = Literal["beginner", "intermediate", "advanced"]


class StrictMakeupJourneyAnalyticsModel(CamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")


class MakeupJourneyOpenedProperties(StrictMakeupJourneyAnalyticsModel):
  month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
  has_records: bool = Field(alias="hasRecords", strict=True)

  @field_validator("month")
  @classmethod
  def validate_month(cls, value: str) -> str:
    if value.startswith("0000-"):
      raise ValueError("month year must be greater than 0000")
    return value


class MakeupJourneyDayOpenedProperties(StrictMakeupJourneyAnalyticsModel):
  has_report: bool = Field(alias="hasReport", strict=True)
  report_count: int = Field(alias="reportCount", ge=0, le=1000, strict=True)
  status: Literal["success", "failure", "empty"]


class MakeupJourneySettingsSavedProperties(StrictMakeupJourneyAnalyticsModel):
  goal_score: int = Field(alias="goalScore", ge=1, le=100, strict=True)
  mission_level: MissionLevel = Field(alias="missionLevel")


class MakeupJourneyMissionCompletedProperties(StrictMakeupJourneyAnalyticsModel):
  difficulty: MissionLevel
  source: Literal["curated", "ai", "user"]


class MakeupJourneyCorrectionStartedProperties(StrictMakeupJourneyAnalyticsModel):
  pass


class MakeupJourneyCorrectionCompletedProperties(StrictMakeupJourneyAnalyticsModel):
  score_delta: int = Field(alias="scoreDelta", ge=-100, le=100, strict=True)


class FloatingActionRepositionedProperties(StrictMakeupJourneyAnalyticsModel):
  quadrant: Literal["topLeft", "topRight", "bottomLeft", "bottomRight"]


class MakeupJourneyOpenedEvent(StrictMakeupJourneyAnalyticsModel):
  name: Literal["makeup_journey_opened"]
  properties: MakeupJourneyOpenedProperties


class MakeupJourneyDayOpenedEvent(StrictMakeupJourneyAnalyticsModel):
  name: Literal["makeup_journey_day_opened"]
  properties: MakeupJourneyDayOpenedProperties


class MakeupJourneySettingsSavedEvent(StrictMakeupJourneyAnalyticsModel):
  name: Literal["makeup_journey_settings_saved"]
  properties: MakeupJourneySettingsSavedProperties


class MakeupJourneyMissionCompletedEvent(StrictMakeupJourneyAnalyticsModel):
  name: Literal["makeup_journey_mission_completed"]
  properties: MakeupJourneyMissionCompletedProperties


class MakeupJourneyCorrectionStartedEvent(StrictMakeupJourneyAnalyticsModel):
  name: Literal["makeup_journey_correction_started"]
  properties: MakeupJourneyCorrectionStartedProperties


class MakeupJourneyCorrectionCompletedEvent(StrictMakeupJourneyAnalyticsModel):
  name: Literal["makeup_journey_correction_completed"]
  properties: MakeupJourneyCorrectionCompletedProperties


class FloatingActionRepositionedEvent(StrictMakeupJourneyAnalyticsModel):
  name: Literal["floating_action_repositioned"]
  properties: FloatingActionRepositionedProperties


MakeupJourneyAnalyticsEvent = Annotated[
  MakeupJourneyOpenedEvent
  | MakeupJourneyDayOpenedEvent
  | MakeupJourneySettingsSavedEvent
  | MakeupJourneyMissionCompletedEvent
  | MakeupJourneyCorrectionStartedEvent
  | MakeupJourneyCorrectionCompletedEvent
  | FloatingActionRepositionedEvent,
  Field(discriminator="name"),
]


class MakeupJourneySettingsUpdate(CamelModel):
  goal_score: int = Field(alias="goalScore", ge=1, le=100)
  mission_level: MissionLevel = Field(alias="missionLevel")
  timezone_name: str = Field(default="Asia/Seoul", alias="timezoneName", min_length=1, max_length=64)

  @field_validator("timezone_name")
  @classmethod
  def validate_timezone_name(cls, value: str) -> str:
    normalized = value.strip()
    try:
      ZoneInfo(normalized)
    except ZoneInfoNotFoundError as exc:
      raise ValueError("timezoneName must be a valid IANA timezone") from exc
    return normalized


class MakeupJourneyNoteUpdate(CamelModel):
  content: str = Field(max_length=2000)


class MakeupJourneyMissionGenerate(CamelModel):
  count: int = Field(default=3, ge=3, le=3)


class MakeupJourneyMissionCreate(CamelModel):
  title: str = Field(min_length=1, max_length=120)

  @field_validator("title")
  @classmethod
  def normalize_title(cls, value: str) -> str:
    normalized = value.strip()
    if not normalized:
      raise ValueError("title must not be blank")
    return normalized


class MakeupJourneyMissionUpdate(CamelModel):
  title: str | None = Field(default=None, min_length=1, max_length=120)
  is_completed: bool | None = Field(default=None, alias="isCompleted")

  @field_validator("title")
  @classmethod
  def normalize_title(cls, value: str | None) -> str | None:
    if value is None:
      return None
    normalized = value.strip()
    if not normalized:
      raise ValueError("title must not be blank")
    return normalized

  @model_validator(mode="after")
  def require_change(self):
    if self.title is None and self.is_completed is None:
      raise ValueError("title or isCompleted is required")
    return self


ResponseDataT = TypeVar("ResponseDataT")
JourneyStatus = Literal["success", "failure", "empty"]
MissionSource = Literal["curated", "ai", "user"]
FeedbackKind = Literal["initial", "correction"]
TrendRange = Literal["7d", "30d", "90d"]
AnalyticsEventName = Literal[
  "makeup_journey_opened",
  "makeup_journey_day_opened",
  "makeup_journey_settings_saved",
  "makeup_journey_mission_completed",
  "makeup_journey_correction_started",
  "makeup_journey_correction_completed",
  "floating_action_repositioned",
]


class MakeupJourneyResponseModel(CamelModel):
  model_config = ConfigDict(
    populate_by_name=True,
    alias_generator=to_camel,
    extra="forbid",
  )


class MakeupJourneySuccessResponse(
  MakeupJourneyResponseModel,
  Generic[ResponseDataT],
):
  data: ResponseDataT
  meta: dict[str, Any]
  error: None


class MakeupJourneyAnalyticsResponseData(MakeupJourneyResponseModel):
  accepted: Literal[True]
  event_name: AnalyticsEventName


class MakeupJourneySettings(MakeupJourneyResponseModel):
  goal_score: int = Field(ge=1, le=100)
  mission_level: MissionLevel
  timezone_name: str
  created_at: datetime
  updated_at: datetime


class MakeupJourneySettingsResponseData(MakeupJourneyResponseModel):
  settings: MakeupJourneySettings | None
  requires_onboarding: bool


class MakeupJourneyMissionSummary(MakeupJourneyResponseModel):
  completed: int = Field(ge=0)
  total: int = Field(ge=0)


class MakeupJourneyCalendarDay(MakeupJourneyResponseModel):
  date: date
  status: JourneyStatus
  first_score: int | None = Field(ge=0, le=100)
  latest_score: int | None = Field(ge=0, le=100)
  score_delta: int | None = Field(ge=-100, le=100)
  report_count: int = Field(ge=0)
  has_note: bool
  mission_summary: MakeupJourneyMissionSummary


class MakeupJourneyMonthSummary(MakeupJourneyResponseModel):
  average_score: int | None = Field(ge=0, le=100)
  recorded_days: int = Field(ge=0)
  current_streak: int = Field(ge=0)


class MakeupJourneyCalendarResponseData(MakeupJourneyResponseModel):
  month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
  goal_score: int | None = Field(ge=1, le=100)
  summary: MakeupJourneyMonthSummary
  days: list[MakeupJourneyCalendarDay]


class MakeupJourneyFeedbackDigest(MakeupJourneyResponseModel):
  report_id: UUID
  headline: str | None
  strength_count: int = Field(ge=0)
  strengths: list[str]
  improvement_count: int = Field(ge=0)
  improvements: list[str]
  next_action: str | None


class MakeupJourneyReport(MakeupJourneyResponseModel):
  report_id: UUID
  score: int = Field(ge=0, le=100)
  feedback_kind: FeedbackKind
  parent_feedback_report_id: UUID | None
  completed_at: datetime
  image_url: str | None
  goal_context: dict[str, Any]


class MakeupJourneyMission(MakeupJourneyResponseModel):
  id: UUID
  source: MissionSource
  difficulty: MissionLevel
  title: str = Field(min_length=1, max_length=120)
  is_completed: bool
  completed_at: datetime | None
  sort_order: int = Field(ge=0)
  created_at: datetime
  updated_at: datetime


class MakeupJourneyNote(MakeupJourneyResponseModel):
  content: str = Field(max_length=2000)
  created_at: datetime
  updated_at: datetime


class MakeupJourneyDayResponseData(MakeupJourneyResponseModel):
  date: date
  goal_score: int | None = Field(ge=1, le=100)
  status: JourneyStatus
  first_score: int | None = Field(ge=0, le=100)
  latest_score: int | None = Field(ge=0, le=100)
  score_delta: int | None = Field(ge=-100, le=100)
  report_count: int = Field(ge=0)
  feedback_digest: MakeupJourneyFeedbackDigest | None
  reports: list[MakeupJourneyReport]
  missions: list[MakeupJourneyMission]
  note: MakeupJourneyNote | None


class MakeupJourneyTrendPoint(MakeupJourneyResponseModel):
  date: date
  score: int = Field(ge=0, le=100)
  status: Literal["success", "failure"]


class MakeupJourneyTrendSummary(MakeupJourneyResponseModel):
  first_score: int | None = Field(ge=0, le=100)
  latest_score: int | None = Field(ge=0, le=100)
  highest_score: int | None = Field(ge=0, le=100)
  average_score: int | None = Field(ge=0, le=100)


class MakeupJourneyTrendResponseData(MakeupJourneyResponseModel):
  range: TrendRange
  goal_score: int | None = Field(ge=1, le=100)
  points: list[MakeupJourneyTrendPoint]
  summary: MakeupJourneyTrendSummary


class MakeupJourneyNoteResponseData(MakeupJourneyResponseModel):
  note: MakeupJourneyNote | None


class MakeupJourneyMissionResponseData(MakeupJourneyResponseModel):
  mission: MakeupJourneyMission


class MakeupJourneyMissionsResponseData(MakeupJourneyResponseModel):
  missions: list[MakeupJourneyMission]


class MakeupJourneyDeleteMissionResponseData(MakeupJourneyResponseModel):
  deleted: Literal[True]
  mission_id: UUID


class MakeupJourneyAnalyticsResponse(
  MakeupJourneySuccessResponse[MakeupJourneyAnalyticsResponseData],
):
  pass


class MakeupJourneySettingsResponse(
  MakeupJourneySuccessResponse[MakeupJourneySettingsResponseData],
):
  pass


class MakeupJourneyCalendarResponse(
  MakeupJourneySuccessResponse[MakeupJourneyCalendarResponseData],
):
  pass


class MakeupJourneyDayResponse(
  MakeupJourneySuccessResponse[MakeupJourneyDayResponseData],
):
  pass


class MakeupJourneyTrendResponse(
  MakeupJourneySuccessResponse[MakeupJourneyTrendResponseData],
):
  pass


class MakeupJourneyNoteResponse(
  MakeupJourneySuccessResponse[MakeupJourneyNoteResponseData],
):
  pass


class MakeupJourneyMissionResponse(
  MakeupJourneySuccessResponse[MakeupJourneyMissionResponseData],
):
  pass


class MakeupJourneyMissionsResponse(
  MakeupJourneySuccessResponse[MakeupJourneyMissionsResponseData],
):
  pass


class MakeupJourneyDeleteMissionResponse(
  MakeupJourneySuccessResponse[MakeupJourneyDeleteMissionResponseData],
):
  pass
