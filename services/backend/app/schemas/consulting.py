from datetime import date
from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


class BookingCreate(CamelModel):
  expert_id: str = Field(alias="expertId")
  duration_id: str = Field(alias="durationId")
  day_id: date = Field(alias="dayId")
  slot_id: str = Field(alias="slotId")
  concern_id: str | None = Field(default=None, alias="concernId")
  share_reports: bool = Field(default=False, alias="shareReports")
  shared_report_ids: list[UUID] | None = Field(default=None, alias="sharedReportIds")
  question: str | None = None
  contact_name: str | None = Field(default=None, alias="contactName", max_length=40)
  contact_phone: str | None = Field(default=None, alias="contactPhone", max_length=40)
  preferred_contact_method: str | None = Field(default=None, alias="preferredContactMethod", pattern="^(sms|call)$")


class AdminBookingStatusUpdate(CamelModel):
  status: str = Field(pattern="^(requested|contacting|confirmed|unavailable|completed|canceled)$")
  operator_note: str | None = Field(default=None, alias="operatorNote", max_length=500)


class ReviewCreate(CamelModel):
  rating: int = Field(ge=1, le=5)
  body: str
  category: str | None = None


class AdminDurationCreate(CamelModel):
  code: str
  label: str
  minutes: int = Field(gt=0)
  price: int = Field(ge=0)
  description: str = ""
  recommended: bool = False


class AdminCareerCreate(CamelModel):
  code: str
  period: str
  role: str


class AdminExpertCreate(CamelModel):
  id: str | None = None
  name: str
  title: str
  signature_line: str = Field(alias="signatureLine")
  initials: str | None = None
  avatar_tone: str = Field(default="rose", alias="avatarTone")
  image_url: str | None = Field(default=None, alias="imageUrl")
  studio_name: str | None = Field(default=None, alias="studioName")
  career_years: int = Field(default=0, ge=0, alias="careerYears")
  response_minutes: int = Field(default=30, ge=0, alias="responseMinutes")
  intro: str = ""
  availability_note: str = Field(default="", alias="availabilityNote")
  tags: list[str] = Field(default_factory=list)
  certifications: list[str] = Field(default_factory=list)
  category_ids: list[str] = Field(default_factory=list, alias="categoryIds")
  durations: list[AdminDurationCreate]
  career_history: list[AdminCareerCreate] = Field(default_factory=list, alias="careerHistory")


class AdminSummaryNoteCreate(CamelModel):
  id: str | None = None
  label: str = Field(min_length=1, max_length=40)
  body: str = Field(min_length=1, max_length=500)


class AdminSummaryProductCreate(CamelModel):
  id: str | None = None
  name: str = Field(min_length=1, max_length=120)
  category: str = Field(min_length=1, max_length=60)
  price: int = Field(default=0, ge=0)
  tone: str = Field(default="sand", max_length=40)


class AdminBookingSummaryUpsert(CamelModel):
  duration_label: str | None = Field(default=None, alias="durationLabel", max_length=40)
  date_label: str | None = Field(default=None, alias="dateLabel", max_length=80)
  notes: list[AdminSummaryNoteCreate] = Field(default_factory=list)
  products: list[AdminSummaryProductCreate] = Field(default_factory=list)
