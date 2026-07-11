from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


class HairAnalysisCreate(CamelModel):
  client_request_id: UUID = Field(alias="clientRequestId")
  source_media_id: UUID = Field(alias="sourceMediaId")
  mask_media_id: UUID | None = Field(default=None, alias="maskMediaId")
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  device_payload: dict = Field(default_factory=dict, alias="devicePayload")


class HairSimulationCreate(CamelModel):
  client_request_id: UUID = Field(alias="clientRequestId")
  style_id: str = Field(alias="styleId", min_length=1, max_length=64)


class HairSimulationSave(CamelModel):
  saved: bool = True
