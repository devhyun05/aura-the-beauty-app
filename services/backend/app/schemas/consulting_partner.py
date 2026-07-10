from pydantic import Field

from app.schemas.base import CamelModel


class PartnerLoginRequest(CamelModel):
  email: str = Field(min_length=3, max_length=255)
  password: str = Field(min_length=1, max_length=255)


class PartnerApplicationCreate(CamelModel):
  email: str = Field(min_length=3, max_length=255, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
  name: str = Field(min_length=2, max_length=80)
  title: str = Field(min_length=2, max_length=120)
  studio_name: str | None = Field(default=None, alias="studioName", max_length=120)
  phone: str | None = Field(default=None, max_length=40)
  message: str | None = Field(default=None, max_length=1000)


class PartnerPasswordChangeRequest(CamelModel):
  new_password: str = Field(alias="newPassword", min_length=8, max_length=255)


class AdminPartnerApplicationApprove(CamelModel):
  expert_id: str = Field(alias="expertId", min_length=1, max_length=120)


class AdminPartnerApplicationReject(CamelModel):
  reason: str | None = Field(default=None, max_length=500)


class PartnerBookingStatusUpdate(CamelModel):
  status: str = Field(pattern="^(scheduled|in_progress|completed|cancelled|no_show|refund_requested|requested|contacting|confirmed|unavailable|canceled)$")
  operator_note: str | None = Field(default=None, alias="operatorNote", max_length=500)


class PartnerSummaryGenerateRequest(CamelModel):
  transcript: str = Field(min_length=1, max_length=12000)
  expert_comment: str | None = Field(default=None, alias="expertComment", max_length=1000)
  visible_to_customer: bool = Field(default=True, alias="visibleToCustomer")


class PartnerSummaryCompleteRequest(CamelModel):
  transcript: str | None = Field(default=None, max_length=12000)
  expert_comment: str | None = Field(default=None, alias="expertComment", max_length=1000)
  customer_summary: str | None = Field(default=None, alias="customerSummary", max_length=2500)
  recommendations: str | None = Field(default=None, max_length=2500)
  visible_to_customer: bool = Field(default=True, alias="visibleToCustomer")
  delivered_report_ids: list[str] = Field(default_factory=list, alias="deliveredReportIds")
  send_review_request: bool = Field(default=True, alias="sendReviewRequest")
