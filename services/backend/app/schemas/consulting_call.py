from pydantic import Field

from app.schemas.base import CamelModel


class ConsultingCallJoinRequest(CamelModel):
  language_code: str = Field(default="ko-KR", alias="languageCode", pattern="^(ko-KR|en-US)$")


class ConsultingCallEndRequest(CamelModel):
  transcript: str | None = Field(default=None, max_length=50000)


class ConsultingTranscriptionStartRequest(CamelModel):
  language_code: str = Field(default="ko-KR", alias="languageCode", pattern="^(ko-KR|en-US)$")
  source_language_code: str | None = Field(default=None, alias="sourceLanguageCode", pattern="^(ko-KR|en-US)$")
  transcription_consent_accepted: bool = Field(default=False, alias="transcriptionConsentAccepted")


class ConsultingCaptionTranslateRequest(CamelModel):
  result_id: str = Field(alias="resultId", min_length=1, max_length=200)
  source_language_code: str = Field(alias="sourceLanguageCode", pattern="^(ko-KR|en-US)$")
  content: str = Field(min_length=1, max_length=2000)
  is_partial: bool = Field(default=False, alias="isPartial")
