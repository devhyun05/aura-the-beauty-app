from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


ReportNotificationType = Literal[
  "analysis_report_completed",
  "makeup_recommendation_completed",
  "makeup_feedback_completed",
  "filter_extraction_completed",
]


class PushDeviceRegistration(CamelModel):
  expo_push_token: str = Field(
    min_length=16,
    max_length=512,
    alias="expoPushToken",
  )
  platform: Literal["ios", "android"]
  app_version: str | None = Field(
    default=None,
    max_length=64,
    alias="appVersion",
  )


class PushDeviceUnregistration(CamelModel):
  expo_push_token: str = Field(
    min_length=16,
    max_length=512,
    alias="expoPushToken",
  )


class ReportNotificationSuppression(CamelModel):
  notification_type: ReportNotificationType = Field(alias="notificationType")
  report_id: UUID = Field(alias="reportId")
