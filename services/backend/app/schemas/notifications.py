from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


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
