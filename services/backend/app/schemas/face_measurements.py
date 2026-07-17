from typing import Literal

from pydantic import ConfigDict, Field, field_validator

from app.schemas.base import CamelModel


FaceMeasurementLocaleSelectionSource = Literal["unset", "self_selected"]


class FaceMeasurementPreferencesUpdate(CamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  self_selected_locale: str | None = Field(
    alias="selfSelectedLocale",
    min_length=2,
    max_length=32,
    pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$",
  )

  @field_validator("self_selected_locale")
  @classmethod
  def normalize_self_selected_locale(cls, value: str | None) -> str | None:
    if value is None:
      return None
    return value.strip()
