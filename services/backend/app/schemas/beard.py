from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


class BeardUploadUrlRequest(CamelModel):
  device_label: str | None = Field(default=None, alias="deviceLabel")


class BeardJobCreate(CamelModel):
  input_key: str = Field(alias="inputKey")
  path: Literal["analysis", "photo"] = "photo"
  survey: dict = Field(default_factory=dict)
