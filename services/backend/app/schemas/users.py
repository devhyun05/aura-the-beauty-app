from datetime import date

from pydantic import Field

from app.schemas.base import CamelModel


class ProfileUpdate(CamelModel):
  nickname: str | None = None
  phone: str | None = None
  birth_date: date | None = Field(default=None, alias="birthDate")
  gender: str | None = None
  interest: str | None = None
  personal_color: str | None = Field(default=None, alias="personalColor")
  skin_type: str | None = Field(default=None, alias="skinType")
  skin_tone: str | None = Field(default=None, alias="skinTone")
  tags: list[str] | None = None
