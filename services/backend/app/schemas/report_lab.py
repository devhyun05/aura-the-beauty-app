from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


ReportLabStage = Literal["measure", "perceive", "consult"]


class ReportLabModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")


class ReportLabOverrides(ReportLabModel):
  prompt_developer: str | None = Field(
    default=None,
    alias="promptDeveloper",
    max_length=20_000,
  )
  prompt_user: str | None = Field(
    default=None,
    alias="promptUser",
    max_length=30_000,
  )
  prompt_version: str = Field(
    alias="promptVersion",
    min_length=1,
    max_length=128,
    pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$",
  )
  model: Literal["disabled"] = "disabled"
  max_tokens: int = Field(default=2_800, alias="maxTokens", ge=1, le=8_000)
  temperature: float = Field(default=0, ge=0, le=2)


class ReportLabStageRunRequest(ReportLabModel):
  fixture_id: str = Field(
    alias="fixtureId",
    min_length=1,
    max_length=80,
    pattern=r"^[a-z0-9][a-z0-9._-]*$",
  )
  session_id: UUID = Field(alias="sessionId")
  client_request_id: UUID = Field(alias="clientRequestId")
  stage: ReportLabStage
  overrides: ReportLabOverrides
  bypass_cache: bool = Field(default=False, alias="bypassCache")
  repeat_count: int = Field(default=1, alias="repeatCount", ge=1, le=5)


class ReportLabSessionCancelRequest(ReportLabModel):
  session_id: UUID = Field(alias="sessionId")
