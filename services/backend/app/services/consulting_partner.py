from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from app.core.errors import AppError
from app.core.security import AuthContext
from app.core.settings import get_settings as get_app_settings
from app.db.session import Database
from app.services.consulting_message_store import list_consulting_messages


PARTNER_SESSION_TTL_DAYS = 14
PARTNER_PASSWORD_HASH_SCHEME = "pbkdf2_sha256"
PARTNER_PASSWORD_HASH_ITERATIONS = 600_000
DEFAULT_PARTNER_EMAILS: dict[str, str] = {
  "exp_sea": "seah.kim@aura-partner.local",
  "exp_doa": "doa.jung@aura-partner.local",
  "exp_lian": "rian.park@aura-partner.local",
}
SUMMARY_AI_MODEL = "local-consulting-summary-v1"
SUMMARY_AI_LABEL = "AI 상담 요약"
SUMMARY_RECOMMENDATION_LABEL = "AI 추천 사항"
SUMMARY_EXPERT_COMMENT_LABEL = "전문가 코멘트"


def _decode_json(value: Any, fallback: Any) -> Any:
  if value is None:
    return fallback
  if isinstance(value, str):
    try:
      return json.loads(value)
    except json.JSONDecodeError:
      return fallback
  return value


def _iso_datetime(value: Any) -> str:
  if isinstance(value, datetime):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
  if isinstance(value, str):
    return value
  return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_datetime(value: Any) -> datetime | None:
  if isinstance(value, datetime):
    return value.astimezone(timezone.utc)
  if isinstance(value, str) and value.strip():
    try:
      return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
      return None
  return None


def _date_key(value: datetime | None) -> str | None:
  if value is None:
    return None
  return value.astimezone(timezone.utc).date().isoformat()


def _business_id(expert_id: str) -> str:
  return f"freelancer:{expert_id}"


def _hash_secret(value: str) -> str:
  return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _password_hash(password: str, salt: str) -> str:
  digest = hashlib.pbkdf2_hmac(
    "sha256",
    password.encode("utf-8"),
    salt.encode("utf-8"),
    PARTNER_PASSWORD_HASH_ITERATIONS,
  )
  return f"{PARTNER_PASSWORD_HASH_SCHEME}${PARTNER_PASSWORD_HASH_ITERATIONS}${digest.hex()}"


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
  if not expected_hash.startswith(f"{PARTNER_PASSWORD_HASH_SCHEME}$"):
    return False
  try:
    _, iterations_text, expected_digest = expected_hash.split("$", 2)
    iterations = int(iterations_text)
  except (TypeError, ValueError):
    return False
  if iterations < 100_000 or iterations > 2_000_000:
    return False
  digest = hashlib.pbkdf2_hmac(
    "sha256",
    password.encode("utf-8"),
    salt.encode("utf-8"),
    iterations,
  ).hex()
  return secrets.compare_digest(digest, expected_digest)


def _partner_email_for(expert: dict[str, Any]) -> str:
  expert_id = str(expert["id"])
  if expert_id in DEFAULT_PARTNER_EMAILS:
    return DEFAULT_PARTNER_EMAILS[expert_id]
  normalized_name = "".join(ch for ch in str(expert["name"]).lower() if ch.isalnum())
  return f"{normalized_name or expert_id}@aura-partner.local"


def _new_partner_password() -> str:
  return secrets.token_urlsafe(24)


def _map_booking_status(status: str) -> str:
  if status in {"requested", "contacting"}:
    return "requested"
  if status == "confirmed":
    return "confirmed"
  if status in {"scheduled", "in_progress"}:
    return status
  if status == "completed":
    return "completed"
  if status in {"canceled", "cancelled", "unavailable", "no_show", "refund_requested"}:
    return "cancelled"
  return "requested"


def _map_partner_status(status: str) -> str:
  if status == "completed":
    return "completed"
  if status in {"cancelled", "no_show", "refund_requested", "canceled", "unavailable"}:
    return "canceled"
  if status in {"requested", "contacting"}:
    return "requested"
  if status in {"confirmed", "scheduled", "in_progress"}:
    return status
  return "confirmed"


_CHAT_VISIBLE_STATUSES = {"confirmed", "scheduled", "in_progress", "completed"}
_CHAT_VISIBLE_CLOSED_STATUSES = {"canceled", "cancelled", "unavailable", "no_show", "refund_requested"}


def _is_chat_visible_booking_row(row: dict[str, Any]) -> bool:
  status = str(row.get("status") or "").strip().lower()
  if status in _CHAT_VISIBLE_STATUSES:
    return True
  return status in _CHAT_VISIBLE_CLOSED_STATUSES and row.get("confirmed_at") is not None


def _collapse_whitespace(value: str | None) -> str:
  return " ".join(str(value or "").split())


def _trim_text(value: str, limit: int) -> str:
  text = _collapse_whitespace(value)
  if len(text) <= limit:
    return text
  return text[: limit - 1].rstrip() + "…"


def _first_transcript_point(transcript: str) -> str:
  normalized = _collapse_whitespace(transcript)
  if not normalized:
    return ""
  for separator in (".", "!", "?", "\n", "。"):
    if separator in normalized:
      candidate = normalized.split(separator, 1)[0].strip()
      if candidate:
        return _trim_text(candidate, 150)
  return _trim_text(normalized, 150)


def _recommendation_for_concern(concern: str) -> str:
  if "퍼스널" in concern or "컬러" in concern:
    return "오늘 확인한 톤 기준으로 베이스는 얇게 정돈하고, 포인트 컬러는 얼굴이 맑아 보이는 채도부터 한 가지씩 테스트해 보세요."
  if "헤어" in concern or "스타일" in concern:
    return "다음 스타일링 전까지 얼굴형을 가리는 요소보다 살리는 요소를 우선 적용하고, 전후 사진으로 변화를 기록해 보세요."
  if "메이크업" in concern:
    return "베이스, 블러셔, 립 중 가장 인상이 크게 달라지는 한 영역부터 조정하고 나머지는 같은 톤 안에서 단계적으로 맞춰 보세요."
  return "상담에서 정리한 우선순위 한 가지를 먼저 적용하고, 다음 상담에서는 실제 적용 사진과 앱 리포트를 함께 비교해 보세요."


def _build_ai_summary_fields(row: dict[str, Any], transcript: str) -> dict[str, str]:
  customer_name = _customer_name(row)
  concern = row.get("concern_label") or row.get("category_label") or row.get("duration_label") or "뷰티 고민"
  transcript_point = _first_transcript_point(transcript)
  if transcript_point:
    customer_summary = (
      f"{customer_name} 고객은 '{concern}' 상담을 진행했고, 화상 상담에서는 "
      f"'{transcript_point}' 내용을 핵심으로 정리했습니다."
    )
  else:
    customer_summary = f"{customer_name} 고객의 '{concern}' 상담 내용을 바탕으로 현재 고민과 적용 우선순위를 정리했습니다."
  return {
    "customer_summary": _trim_text(customer_summary, 500),
    "recommendations": _trim_text(_recommendation_for_concern(str(concern)), 500),
  }


def _summary_notes_for_ai(
  customer_summary: str,
  recommendations: str,
  expert_comment: str | None,
) -> list[dict[str, Any]]:
  notes = [
    {
      "id": "ai_summary",
      "label": SUMMARY_AI_LABEL,
      "body": customer_summary.strip(),
    },
    {
      "id": "ai_recommendations",
      "label": SUMMARY_RECOMMENDATION_LABEL,
      "body": recommendations.strip(),
    },
  ]
  comment = (expert_comment or "").strip()
  if comment:
    notes.append(
      {
        "id": "expert_comment",
        "label": SUMMARY_EXPERT_COMMENT_LABEL,
        "body": comment,
      },
    )
  return notes


def _summary_note_body(notes: list[Any], note_id: str, label: str) -> str:
  for note in notes:
    if not isinstance(note, dict):
      continue
    if note.get("id") == note_id or note.get("label") == label:
      return str(note.get("body") or "")
  return ""


def _summary_to_web(row: dict[str, Any]) -> dict[str, Any]:
  notes = _decode_json(row.get("notes"), [])
  if not isinstance(notes, list):
    notes = []
  expert_comment = _summary_note_body(notes, "expert_comment", SUMMARY_EXPERT_COMMENT_LABEL)
  return {
    "id": str(row["id"]),
    "booking_id": str(row["booking_id"]),
    "expert_id": row["expert_id"],
    "customer_id": str(row.get("customer_id") or row.get("user_id") or ""),
    "created_at": _iso_datetime(row.get("created_at")),
    "source": "phone_ai",
    "ai_status": "succeeded",
    "ai_model": SUMMARY_AI_MODEL,
    "transcript": None,
    "internal_memo": expert_comment,
    "customer_summary": _summary_note_body(notes, "ai_summary", SUMMARY_AI_LABEL),
    "recommendations": _summary_note_body(notes, "ai_recommendations", SUMMARY_RECOMMENDATION_LABEL),
    "visible_to_customer": True,
    "delivered_report_ids": [],
    "review_request_status": "ready",
  }


def _summary_job_for(row: dict[str, Any], account: dict[str, Any], created_at: str) -> dict[str, Any]:
  return {
    "id": f"summary-job-{uuid4()}",
    "booking_id": str(row["id"]),
    "business_id": _business_id(row["expert_id"]),
    "expert_id": row["expert_id"],
    "requested_by": str(account["id"]),
    "status": "succeeded",
    "source": "phone_transcript",
    "ai_model": SUMMARY_AI_MODEL,
    "created_at": created_at,
    "updated_at": created_at,
  }


def _assert_can_create_summary(row: dict[str, Any]) -> None:
  status = str(row.get("status") or "")
  if status in {"canceled", "cancelled", "unavailable", "no_show", "refund_requested"}:
    raise AppError(409, "CONSULTING_BOOKING_CLOSED", "취소된 상담에는 요약을 생성할 수 없습니다.")
  if status not in {"confirmed", "completed"}:
    raise AppError(409, "CONSULTING_BOOKING_NOT_CONFIRMED", "확정된 상담만 AI 요약을 생성할 수 있습니다.")


def _customer_name(row: dict[str, Any]) -> str:
  return (
    (row.get("contact_name") or "").strip()
    or (row.get("nickname") or "").strip()
    or (row.get("user_name") or "").strip()
    or "앱 고객"
  )


def _customer_phone(row: dict[str, Any]) -> str:
  return (row.get("contact_phone") or row.get("phone") or "").strip()


def _customer_email(row: dict[str, Any]) -> str:
  email = row.get("email")
  if isinstance(email, str) and email.strip():
    settings = get_app_settings()
    dev_email = (settings.dev_user_email or "").strip()
    if not settings.auth_required and email.strip().lower() == "dev@example.com" and dev_email:
      return dev_email
    return email.strip()
  return f"{row['user_id']}@aura-app.local"


def _booking_datetime(row: dict[str, Any]) -> datetime:
  scheduled_at = row.get("scheduled_at")
  if isinstance(scheduled_at, datetime):
    return scheduled_at
  created_at = row.get("created_at")
  if isinstance(created_at, datetime):
    return created_at
  return datetime.now(timezone.utc)


def _booking_to_web(row: dict[str, Any]) -> dict[str, Any]:
  starts_at = _booking_datetime(row)
  duration_minutes = int(row.get("duration_minutes") or 30)
  ends_at = starts_at + timedelta(minutes=duration_minutes)
  concern_tags = [
    value
    for value in (
      row.get("concern_label"),
      row.get("category_label"),
      row.get("duration_label"),
    )
    if isinstance(value, str) and value.strip()
  ]
  question = (row.get("question") or "").strip()
  contact_note = " · ".join(
    value
    for value in (
      f"연락처: {_customer_phone(row)}" if _customer_phone(row) else "",
      f"희망 연락: {row.get('preferred_contact_method')}" if row.get("preferred_contact_method") else "",
    )
    if value
  )
  request_memo = "\n".join(value for value in (question, contact_note) if value) or "앱 예약 신청"
  shared_report_ids = [str(report_id) for report_id in row.get("shared_report_ids") or []]
  status = _map_booking_status(str(row.get("status") or ""))
  payment_confirmed = bool(row.get("confirmed_at")) or status in {"confirmed", "scheduled", "in_progress", "completed"}
  return {
    "id": str(row["id"]),
    "conversation_id": str(row.get("conversation_id") or row["id"]),
    "customer_left_at": _iso_datetime(row["customer_left_at"]) if row.get("customer_left_at") else None,
    "expert_left_at": _iso_datetime(row["expert_left_at"]) if row.get("expert_left_at") else None,
    "customer_id": str(row["user_id"]),
    "customer_name": _customer_name(row),
    "expert_id": row["expert_id"],
    "business_id": _business_id(row["expert_id"]),
    "starts_at": _iso_datetime(starts_at),
    "ends_at": _iso_datetime(ends_at),
    "duration_minutes": 60 if duration_minutes >= 60 else 30,
    "type": row.get("category_label") or row.get("concern_label") or "뷰티 상담",
    "status": status,
    "payment_status": "paid" if payment_confirmed else "pending",
    "paid_amount": int(row.get("price") or 0),
    "discount_amount": 0,
    "channel": "video" if row.get("session_mode") == "online" else "offline",
    "requested_at": _iso_datetime(row.get("created_at")),
    "request_memo": request_memo,
    "selected_concern_tags": concern_tags,
    "internal_memo": row.get("operator_note") or "",
    "shared_report_ids": shared_report_ids,
    "consultation_summary_id": str(row.get("summary_id")) if row.get("summary_id") else None,
    "refund_request_id": None,
    "review_id": str(row.get("review_id")) if row.get("review_id") else None,
    "review_request_status": "ready" if row.get("summary_id") else "not_ready",
  }


def _customer_to_web(row: dict[str, Any]) -> dict[str, Any]:
  total_bookings = int(row.get("total_bookings") or 1)
  completed_bookings = int(row.get("completed_bookings") or 0)
  total_paid_amount = int(row.get("total_paid_amount") or 0)
  preferred = "phone" if row.get("preferred_contact_method") == "call" else "chat"
  return {
    "id": str(row["user_id"]),
    "name": _customer_name(row),
    "phone": _customer_phone(row),
    "email": _customer_email(row),
    "joined_at": _iso_datetime(row.get("user_created_at") or row.get("created_at")),
    "last_active_at": _iso_datetime(row.get("last_booking_at") or row.get("created_at")),
    "tags": [value for value in [row.get("category_label"), row.get("concern_label")] if value],
    "memo": row.get("question") or "",
    "profile_image_url": f"https://api.dicebear.com/8.x/initials/svg?seed={_customer_name(row)}",
    "total_bookings": total_bookings,
    "completed_bookings": completed_bookings,
    "total_paid_amount": total_paid_amount,
    "risk_flags": [],
    "preferred_channel": preferred,
    "latest_booking_status": _map_booking_status(str(row.get("latest_booking_status") or row.get("status") or "requested")),
    "attachments": [],
  }


def _customer_to_web_for_booking(
  row: dict[str, Any],
  aggregate_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
  base = _customer_to_web(row)
  if aggregate_row is None:
    return base
  return {
    **base,
    "joined_at": _iso_datetime(aggregate_row.get("user_created_at") or row.get("user_created_at") or row.get("created_at")),
    "last_active_at": _iso_datetime(aggregate_row.get("last_booking_at") or row.get("created_at")),
    "total_bookings": int(aggregate_row.get("total_bookings") or base["total_bookings"]),
    "completed_bookings": int(aggregate_row.get("completed_bookings") or 0),
    "total_paid_amount": int(aggregate_row.get("total_paid_amount") or 0),
  }


def _expert_to_web(row: dict[str, Any], account: dict[str, Any] | None = None) -> dict[str, Any]:
  tags = _decode_json(row.get("tags"), [])
  if not isinstance(tags, list):
    tags = []
  certifications = _decode_json(row.get("certifications"), [])
  if not isinstance(certifications, list):
    certifications = []
  expert_id = str(row["id"])
  return {
    "id": expert_id,
    "business_id": _business_id(expert_id),
    "name": row["name"],
    "role_label": row.get("title") or "프리랜서 뷰티 전문가",
    "tagline": row.get("signature_line") or row.get("title") or "AURA 상담 전문가",
    "email": account.get("email") if account else _partner_email_for(row),
    "phone": "",
    "avatar_url": row.get("image_url") or f"https://api.dicebear.com/8.x/initials/svg?seed={row['name']}",
    "specialties": tags,
    "categories": tags,
    "introduction": row.get("intro") or "",
    "years_of_experience": int(row.get("career_years") or 0),
    "credentials": [
      {
        "id": f"{expert_id}-credential-{index}",
        "owner_id": expert_id,
        "type": "credential",
        "name": str(label),
        "url": "",
        "uploaded_at": _iso_datetime(row.get("created_at")),
      }
      for index, label in enumerate(certifications)
    ],
    "price30_min": int(row.get("price30_min") or 0),
    "price60_min": int(row.get("price60_min") or 0),
    "exposure_status": "public" if row.get("is_active") else "private",
    "rating": float(row.get("rating") or 0),
    "review_count": int(row.get("review_count") or 0),
    "consultation_count": int(row.get("session_count") or 0),
    "rebooking_rate": int(row.get("rebook_rate") or 0),
    "response_within_minutes": int(row.get("response_minutes") or 30),
  }


def _expert_row_from_account(account: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": account["expert_id"],
    "name": account["expert_name"],
    "title": account.get("title"),
    "studio_name": account.get("studio_name"),
    "signature_line": account.get("signature_line"),
    "image_url": account.get("image_url"),
    "intro": account.get("intro"),
    "tags": account.get("tags"),
    "certifications": account.get("certifications"),
    "career_years": account.get("career_years"),
    "rating": account.get("rating"),
    "review_count": account.get("review_count"),
    "session_count": account.get("session_count"),
    "rebook_rate": account.get("rebook_rate"),
    "response_minutes": account.get("response_minutes"),
    "is_active": account.get("is_active"),
    "created_at": account.get("expert_created_at"),
  }


def _business_to_web(expert: dict[str, Any], account: dict[str, Any] | None = None) -> dict[str, Any]:
  expert_id = str(expert["id"])
  return {
    "id": _business_id(expert_id),
    "partner_type": "freelancer",
    "name": expert.get("studio_name") or expert["name"],
    "owner_name": expert["name"],
    "business_registration_number": None,
    "phone": "",
    "address": "",
    "website": None,
    "description": expert.get("intro") or "",
    "photos": [],
    "exposure_status": "public" if expert.get("is_active") else "private",
    "verification_status": "approved",
    "verification_documents": [],
    "settlement_account_status": "approved",
    "default_operating_hours": [],
    "cancellation_policy": "상담 시작 전 예약 상태에 따라 취소 정책이 적용됩니다.",
    "refund_policy": "상담 미진행 또는 플랫폼 귀책 시 환불됩니다.",
  }


def _shared_report_from_analysis(row: dict[str, Any], booking_id: str | None = None) -> dict[str, Any]:
  return {
    "id": str(row["id"]),
    "customer_id": str(row["user_id"]),
    "booking_id": booking_id,
    "title": row.get("report_title") or row.get("title") or "AI 분석 리포트",
    "category": "AI 얼굴 분석",
    "created_at": _iso_datetime(row.get("analyzed_at") or row.get("created_at")),
    "source": "customer_app",
    "summary": row.get("short_summary") or row.get("summary") or "",
    "attachment_ids": [],
  }


def _shared_report_from_feedback(row: dict[str, Any], booking_id: str | None = None) -> dict[str, Any]:
  payload = _decode_json(row.get("feedback_payload"), {})
  title = "메이크업 피드백 리포트"
  summary = ""
  if isinstance(payload, dict):
    title = str(payload.get("title") or payload.get("headline") or title)
    summary = str(payload.get("summary") or payload.get("oneLineSummary") or "")
  return {
    "id": str(row["id"]),
    "customer_id": str(row["user_id"]),
    "booking_id": booking_id,
    "title": title,
    "category": "메이크업 피드백",
    "created_at": _iso_datetime(row.get("completed_at") or row.get("created_at")),
    "source": "customer_app",
    "summary": summary,
    "attachment_ids": [],
  }


def _recommended_makeup_images(detail_payload: dict[str, Any]) -> list[dict[str, Any]]:
  result = detail_payload.get("result") if isinstance(detail_payload, dict) else None
  cards = result.get("recommendedMakeups") if isinstance(result, dict) else None
  if not isinstance(cards, list):
    return []

  images: list[dict[str, Any]] = []
  for index, card in enumerate(cards):
    if not isinstance(card, dict):
      continue
    image_url = next(
      (
        str(card[key]).strip()
        for key in ("imageUrl", "cdnUrl", "previewUrl", "image_url")
        if card.get(key) and str(card[key]).strip()
      ),
      "",
    )
    if not image_url:
      continue
    images.append(
      {
        "title": str(card.get("title") or f"AI 추천 메이크업 {index + 1}"),
        "image_url": image_url,
      }
    )
  return images


def _default_partner_operating_hours() -> list[dict[str, Any]]:
  labels = ["월", "화", "수", "목", "금", "토", "일"]
  return [
    {
      "dayOfWeek": day,
      "label": labels[day],
      "opensAt": "10:00",
      "closesAt": "19:00",
      "isClosed": day >= 5,
    }
    for day in range(7)
  ]


def _manager_operating_hours(value: Any) -> list[dict[str, Any]]:
  raw_hours = _decode_json(value, [])
  defaults = _default_partner_operating_hours()
  if not isinstance(raw_hours, list):
    raw_hours = []

  by_day: dict[int, dict[str, Any]] = {}
  for raw in raw_hours:
    if not isinstance(raw, dict):
      continue
    try:
      day = int(raw.get("day_of_week", raw.get("dayOfWeek")))
    except (TypeError, ValueError):
      continue
    if day < 0 or day > 6:
      continue
    default = defaults[day]
    by_day[day] = {
      "dayOfWeek": day,
      "label": str(raw.get("label") or default["label"]),
      "opensAt": str(raw.get("opens_at", raw.get("opensAt")) or default["opensAt"]),
      "closesAt": str(raw.get("closes_at", raw.get("closesAt")) or default["closesAt"]),
      "isClosed": bool(raw.get("is_closed", raw.get("isClosed", default["isClosed"]))),
    }
    lunch_start = raw.get("lunch_start", raw.get("lunchStart"))
    lunch_end = raw.get("lunch_end", raw.get("lunchEnd"))
    if lunch_start:
      by_day[day]["lunchStart"] = str(lunch_start)
    if lunch_end:
      by_day[day]["lunchEnd"] = str(lunch_end)

  return [by_day.get(day, defaults[day]) for day in range(7)]


def _holiday_dates(value: Any) -> list[str]:
  raw_holidays = _decode_json(value, [])
  if not isinstance(raw_holidays, list):
    return []
  return sorted({str(item)[:10] for item in raw_holidays if str(item or "").strip()})


def _settings_payload(account: dict[str, Any], expert: dict[str, Any]) -> dict[str, Any]:
  return {
    "operatingHours": _manager_operating_hours(expert.get("operating_hours")),
    "holidays": _holiday_dates(expert.get("holiday_dates")),
    "bookingOpenMonths": int(expert.get("booking_open_months") or 1),
    "notification": {
      "bookingCreated": True,
      "bookingReminder": True,
      "unreadChatDigest": True,
      "reviewCreated": True,
    },
    "integrations": {
      "phoneProvider": "none",
      "chatProvider": "websocket",
      "smsProvider": "none",
    },
    "accountRoles": [
        {
          "id": str(account.get("id") or account.get("account_id") or ""),
          "name": str(account.get("expert_name") or account.get("email") or "파트너"),
          "email": str(account.get("email") or ""),
        "role": str(account.get("role") or "expert"),
        "scope": str(account.get("workspace_scope") or "expert_personal"),
      },
    ],
  }


def _settings_operating_hours_for_db(value: Any) -> list[dict[str, Any]]:
  return [
    {
      "day_of_week": item["dayOfWeek"],
      "label": item["label"],
      "opens_at": item["opensAt"],
      "closes_at": item["closesAt"],
      "is_closed": item["isClosed"],
      **({"lunch_start": item["lunchStart"]} if item.get("lunchStart") else {}),
      **({"lunch_end": item["lunchEnd"]} if item.get("lunchEnd") else {}),
    }
    for item in _manager_operating_hours(value)
  ]


async def get_manager_settings(db: Database, account: dict[str, Any]) -> dict[str, Any]:
  expert = await db.fetchrow(
    """
    select id, operating_hours, holiday_dates, booking_open_months
    from consulting_experts
    where id = $1
    """,
    account["expert_id"],
  )
  if expert is None:
    raise AppError(404, "PARTNER_EXPERT_NOT_FOUND", "전문가 정보를 찾을 수 없습니다.")
  return _settings_payload(account, expert)


async def update_manager_settings(db: Database, account: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
  current = await get_manager_settings(db, account)
  next_operating_hours = patch.get("operating_hours", patch.get("operatingHours", current["operatingHours"]))
  next_holidays = patch.get("holidays", current["holidays"])
  next_open_months = patch.get("booking_open_months", patch.get("bookingOpenMonths", current["bookingOpenMonths"]))
  try:
    booking_open_months = min(max(int(next_open_months), 1), 3)
  except (TypeError, ValueError):
    booking_open_months = current["bookingOpenMonths"]

  row = await db.fetchrow(
    """
    update consulting_experts
    set operating_hours = $2::jsonb,
        holiday_dates = $3::jsonb,
        booking_open_months = $4,
        updated_at = now()
    where id = $1
    returning id, operating_hours, holiday_dates, booking_open_months
    """,
    account["expert_id"],
    json.dumps(_settings_operating_hours_for_db(next_operating_hours), ensure_ascii=False),
    json.dumps(_holiday_dates(next_holidays), ensure_ascii=False),
    booking_open_months,
  )
  if row is None:
    raise AppError(404, "PARTNER_EXPERT_NOT_FOUND", "전문가 정보를 찾을 수 없습니다.")
  return _settings_payload(account, row)


async def ensure_partner_account_schema(db: Database) -> None:
  await db.execute("create extension if not exists pgcrypto")
  await db.execute("create extension if not exists citext")
  await db.execute(
    """
    create table if not exists consulting_partner_accounts (
      id uuid primary key default gen_random_uuid(),
      expert_id text not null,
      email citext not null unique,
      password_hash text not null,
      password_salt text not null,
      role text not null default 'expert',
      workspace_scope text not null default 'expert_personal',
      status text not null default 'active',
      password_change_required boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_consulting_partner_accounts_role check (role in ('expert', 'business_manager', 'operator')),
      constraint chk_consulting_partner_accounts_scope check (workspace_scope in ('expert_personal', 'business_operations')),
      constraint chk_consulting_partner_accounts_status check (status in ('invited', 'active', 'suspended'))
    )
    """,
  )
  await db.execute(
    """
    create table if not exists consulting_partner_sessions (
      token_hash text primary key,
      account_id uuid not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz,
      constraint fk_consulting_partner_sessions_account
        foreign key (account_id) references consulting_partner_accounts(id) on delete cascade
    )
    """,
  )
  await db.execute(
    """
    create table if not exists consulting_partner_applications (
      id uuid primary key default gen_random_uuid(),
      email citext not null,
      name text not null,
      title text not null,
      studio_name text,
      phone text,
      message text,
      status text not null default 'submitted',
      expert_id text,
      rejection_reason text,
      reviewed_by_subject text,
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_consulting_partner_applications_status
        check (status in ('submitted', 'needs_update', 'approved', 'rejected'))
    )
    """,
  )
  await db.execute(
    """
    create unique index if not exists uq_consulting_partner_applications_pending_email
      on consulting_partner_applications (email)
      where status in ('submitted', 'needs_update')
    """,
  )
  await db.execute(
    """
    create index if not exists idx_consulting_partner_accounts_expert
      on consulting_partner_accounts (expert_id)
    """,
  )
  await db.execute(
    """
    create index if not exists idx_consulting_partner_sessions_account_expires
      on consulting_partner_sessions (account_id, expires_at)
    """,
  )


async def rotate_existing_partner_credentials(db: Database) -> list[dict[str, Any]]:
  await ensure_partner_account_schema(db)
  accounts = await db.fetch(
    """
    select account.id, account.expert_id, account.email::text,
      expert.name as expert_name
    from consulting_partner_accounts account
    join consulting_experts expert on expert.id = account.expert_id
    where account.status in ('invited', 'active')
    order by account.created_at, account.id
    """,
  )
  rotated: list[dict[str, Any]] = []
  for account in accounts:
    password = _new_partner_password()
    salt = secrets.token_hex(16)
    updated = await db.fetchrow(
      """
      update consulting_partner_accounts
      set password_hash = $2,
        password_salt = $3,
        status = 'active',
        password_change_required = false,
        updated_at = now()
      where id = $1
      returning id, expert_id, email::text
      """,
      account["id"],
      _password_hash(password, salt),
      salt,
    )
    await db.execute(
      "delete from consulting_partner_sessions where account_id = $1",
      updated["id"],
    )
    rotated.append(
      {
        "id": str(updated["id"]),
        "expert_id": updated["expert_id"],
        "expert_name": account["expert_name"],
        "email": updated["email"],
        "temporary_password": password,
      },
    )
  return rotated


async def submit_partner_application(db: Database, payload: Any) -> dict[str, Any]:
  await ensure_partner_account_schema(db)
  application = await db.fetchrow(
    """
    insert into consulting_partner_applications (
      email, name, title, studio_name, phone, message
    )
    select $1, $2, $3, $4, $5, $6
    where not exists (
      select 1 from consulting_partner_accounts account
      where account.email = $1
    )
    on conflict (email) where status in ('submitted', 'needs_update')
    do update set
      name = excluded.name,
      title = excluded.title,
      studio_name = excluded.studio_name,
      phone = excluded.phone,
      message = excluded.message,
      status = 'submitted',
      updated_at = now()
    returning id::text, email::text, name, title, studio_name, phone, message,
      status, created_at, updated_at
    """,
    payload.email.strip().lower(),
    payload.name.strip(),
    payload.title.strip(),
    (payload.studio_name or "").strip() or None,
    (payload.phone or "").strip() or None,
    (payload.message or "").strip() or None,
  )
  if application is None:
    return {"status": "submitted"}
  return dict(application)


async def list_partner_applications(db: Database, status: str) -> list[dict[str, Any]]:
  await ensure_partner_account_schema(db)
  condition = "" if status == "all" else "where status = $1"
  args = () if status == "all" else (status,)
  return await db.fetch(
    f"""
    select id::text, email::text, name, title, studio_name, phone, message,
      status, expert_id, rejection_reason, reviewed_by_subject, reviewed_at,
      created_at, updated_at
    from consulting_partner_applications
    {condition}
    order by created_at asc
    """,
    *args,
  )


async def approve_partner_application(
  db: Database,
  application_id: str,
  expert_id: str,
  reviewer_subject: str,
) -> dict[str, Any]:
  await ensure_partner_account_schema(db)
  temporary_password = _new_partner_password()
  salt = secrets.token_hex(16)
  approved = await db.fetchrow(
    """
    with selected as (
      select application.id, application.email
      from consulting_partner_applications application
      where application.id = $1::uuid
        and application.status in ('submitted', 'needs_update')
        and exists (
          select 1 from consulting_experts expert
          where expert.id = $2 and expert.is_active = true
        )
    ),
    account as (
      insert into consulting_partner_accounts (
        expert_id, email, password_hash, password_salt, role,
        workspace_scope, status, password_change_required
      )
      select $2, selected.email, $4, $5, 'expert',
        'expert_personal', 'invited', true
      from selected
      on conflict (email)
      do update set
        expert_id = excluded.expert_id,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        role = 'expert',
        workspace_scope = 'expert_personal',
        status = 'invited',
        password_change_required = true,
        updated_at = now()
      returning id, email::text, expert_id, status
    ),
    revoked_sessions as (
      delete from consulting_partner_sessions session
      using account
      where session.account_id = account.id
      returning session.account_id
    ),
    approved_application as (
      update consulting_partner_applications application
      set status = 'approved',
          expert_id = $2,
          rejection_reason = null,
          reviewed_by_subject = $3,
          reviewed_at = now(),
          updated_at = now()
      from selected
      where application.id = selected.id
      returning application.id::text, application.email::text, application.status,
        application.expert_id, application.reviewed_at
    )
    select approved_application.*, account.id::text as account_id,
      account.email, account.status as account_status,
      true as password_change_required
    from approved_application
    cross join account
    """,
    application_id,
    expert_id.strip(),
    reviewer_subject,
    _password_hash(temporary_password, salt),
    salt,
  )
  if approved is None:
    raise AppError(
      409,
      "PARTNER_APPLICATION_NOT_APPROVABLE",
      "가입 신청이 대기 상태가 아니거나 활성 상담사 프로필을 찾을 수 없습니다.",
    )
  return {
    "application": dict(approved),
    "account": {
      "id": approved["account_id"],
      "expert_id": approved["expert_id"],
      "email": approved["email"],
      "temporary_password": temporary_password,
      "role": "expert",
      "workspace_scope": "expert_personal",
      "status": approved["account_status"],
      "password_change_required": True,
      "delivered_by": "manual",
    },
  }


async def reject_partner_application(
  db: Database,
  application_id: str,
  reviewer_subject: str,
  reason: str | None,
) -> dict[str, Any]:
  await ensure_partner_account_schema(db)
  rejected = await db.fetchrow(
    """
    update consulting_partner_applications
    set status = 'rejected',
        rejection_reason = $3,
        reviewed_by_subject = $2,
        reviewed_at = now(),
        updated_at = now()
    where id = $1::uuid and status in ('submitted', 'needs_update')
    returning id::text, email::text, status, rejection_reason, reviewed_at
    """,
    application_id,
    reviewer_subject,
    (reason or "").strip() or None,
  )
  if rejected is None:
    raise AppError(409, "PARTNER_APPLICATION_NOT_PENDING", "대기 중인 가입 신청을 찾을 수 없습니다.")
  return dict(rejected)


async def request_partner_application_update(
  db: Database,
  application_id: str,
  reviewer_subject: str,
  reason: str | None,
) -> dict[str, Any]:
  await ensure_partner_account_schema(db)
  requested = await db.fetchrow(
    """
    update consulting_partner_applications
    set status = 'needs_update',
        rejection_reason = $3,
        reviewed_by_subject = $2,
        reviewed_at = now(),
        updated_at = now()
    where id = $1::uuid and status = 'submitted'
    returning id::text, email::text, status, rejection_reason, reviewed_at
    """,
    application_id,
    reviewer_subject,
    (reason or "").strip() or None,
  )
  if requested is None:
    raise AppError(409, "PARTNER_APPLICATION_NOT_SUBMITTED", "검토 중인 가입 신청을 찾을 수 없습니다.")
  return dict(requested)


async def change_partner_password(db: Database, account_id: str, password: str) -> dict[str, Any]:
  await ensure_partner_account_schema(db)
  salt = secrets.token_hex(16)
  activated = await db.fetchrow(
    """
    update consulting_partner_accounts
    set password_hash = $2,
        password_salt = $3,
        status = 'active',
        password_change_required = false,
        updated_at = now()
    where id = $1::uuid
      and status = 'invited'
      and password_change_required = true
    returning id::text, email::text, expert_id, status, password_change_required
    """,
    account_id,
    _password_hash(password, salt),
    salt,
  )
  if activated is None:
    raise AppError(
      400,
      "PARTNER_PASSWORD_CHANGE_NOT_ALLOWED",
      "임시 비밀번호 변경이 필요한 계정을 찾을 수 없습니다.",
    )
  return dict(activated)


async def _account_by_token(db: Database, token: str) -> dict[str, Any] | None:
  await ensure_partner_account_schema(db)
  row = await db.fetchrow(
    """
    select
      a.*,
      e.name as expert_name,
      e.title,
      e.studio_name,
      e.signature_line,
      e.image_url,
      e.intro,
      e.tags,
      e.certifications,
      e.career_years,
      e.rating,
      e.review_count,
      e.session_count,
      e.rebook_rate,
      e.response_minutes,
      e.is_active,
      e.created_at as expert_created_at
    from consulting_partner_sessions s
    join consulting_partner_accounts a on a.id = s.account_id
    join consulting_experts e on e.id = a.expert_id
    where s.token_hash = $1
      and s.expires_at > now()
      and a.status in ('invited', 'active')
    """,
    _hash_secret(token),
  )
  if row is None:
    return None

  await db.execute(
    "update consulting_partner_sessions set last_seen_at = now() where token_hash = $1",
    _hash_secret(token),
  )
  return dict(row)


async def account_for_token(db: Database, token: str) -> dict[str, Any] | None:
  return await _account_by_token(db, token)


async def auth_context_for_partner_token(db: Database, token: str) -> AuthContext | None:
  account = await _account_by_token(db, token)
  if account is None or account.get("status") != "active" or account.get("password_change_required"):
    return None
  return AuthContext(
    subject=str(account["id"]),
    provider="google",
    email=account["email"],
    name=account["expert_name"],
    claims={
      "sub": str(account["id"]),
      "token_use": "partner_session",
      "custom:expert_id": account["expert_id"],
      "expert_id": account["expert_id"],
      "cognito:groups": [account["role"]],
    },
  )


async def login(db: Database, email: str, password: str) -> dict[str, Any]:
  await ensure_partner_account_schema(db)
  account = await db.fetchrow(
    """
    select
      a.*,
      e.name as expert_name,
      e.title,
      e.studio_name,
      e.signature_line,
      e.image_url,
      e.intro,
      e.tags,
      e.certifications,
      e.career_years,
      e.rating,
      e.review_count,
      e.session_count,
      e.rebook_rate,
      e.response_minutes,
      e.is_active,
      e.created_at as expert_created_at
    from consulting_partner_accounts a
    join consulting_experts e on e.id = a.expert_id
    where lower(a.email::text) = lower($1)
      and a.status in ('invited', 'active')
    limit 1
    """,
    email.strip(),
  )
  if account is None or not _verify_password(password, account["password_salt"], account["password_hash"]):
    raise AppError(401, "PARTNER_LOGIN_FAILED", "파트너 계정 또는 비밀번호를 확인해 주세요.")

  token = secrets.token_urlsafe(32)
  await db.execute(
    """
    insert into consulting_partner_sessions (token_hash, account_id, expires_at)
    values ($1, $2, now() + ($3::int * interval '1 day'))
    """,
    _hash_secret(token),
    account["id"],
    PARTNER_SESSION_TTL_DAYS,
  )
  return {
    "token": token,
    "user": _auth_user(account),
    "expires_in_days": PARTNER_SESSION_TTL_DAYS,
  }


def _auth_user(account: dict[str, Any]) -> dict[str, Any]:
  expert_id = account["expert_id"]
  return {
    "id": str(account["id"]),
    "name": account["expert_name"],
    "email": account["email"],
    "role": account["role"],
    "expert_id": expert_id,
    "business_id": _business_id(expert_id),
    "workspace_scope": account["workspace_scope"],
    "partner_type": "freelancer",
    "application_status": "approved",
    "account_id": str(account["id"]),
    "password_change_required": bool(account.get("password_change_required")),
  }


async def current_user(account: dict[str, Any]) -> dict[str, Any]:
  return _auth_user(account)


async def business_profile(account: dict[str, Any]) -> dict[str, Any]:
  return _business_to_web(_expert_row_from_account(account), account)


async def expert_profile(account: dict[str, Any]) -> dict[str, Any]:
  return _expert_to_web(_expert_row_from_account(account), account)


async def dashboard_summary(db: Database, account: dict[str, Any]) -> dict[str, Any]:
  bookings = await list_bookings(db, account, {})
  today = datetime.now(timezone.utc).date().isoformat()
  today_bookings = [booking for booking in bookings if booking["starts_at"][:10] == today]
  upcoming = [booking for booking in bookings if booking["status"] in {"requested", "contacting", "confirmed", "scheduled", "in_progress"}]
  pending_completion = [booking for booking in bookings if booking["status"] in {"confirmed", "in_progress"}]
  pending_reports = [booking for booking in bookings if booking["status"] == "completed" and booking["shared_report_ids"]]
  chat_threads = await chat_threads_for_account(db, account)
  unread_count = sum(thread["thread"]["unread_count"] for thread in chat_threads)
  urgent_tasks: list[dict[str, Any]] = []
  for thread_detail in chat_threads:
    thread = thread_detail["thread"]
    if thread["unread_count"] > 0:
      urgent_tasks.append(
        {
          "id": f"task-message-{thread['id']}",
          "type": "message",
          "title": "읽지 않은 고객 메시지",
          "description": f"{thread_detail['customer']['name']} 고객이 상담 톡을 보냈습니다.",
          "due_at": thread["last_message_at"],
          "booking_id": thread.get("booking_id"),
          "customer_id": thread["customer_id"],
        },
      )
  return {
    "today_booking_count": len(today_bookings),
    "upcoming_booking_count": len(upcoming),
    "pending_completion_count": len(pending_completion),
    "refund_request_count": 0,
    "unread_message_count": unread_count,
    "new_review_count": 0,
    "today_paid_amount": sum(int(booking["paid_amount"]) for booking in today_bookings),
    "pending_report_delivery_count": len(pending_reports),
    "available_slot_count": 20,
    "verification_status": "approved",
    "today_timeline": today_bookings,
    "urgent_tasks": urgent_tasks[:8],
  }


async def _booking_rows(db: Database, account: dict[str, Any]) -> list[dict[str, Any]]:
  rows = await db.fetch(
    """
    select
      b.*,
      u.email,
      u.nickname,
      u.name as user_name,
      u.phone,
      u.created_at as user_created_at,
      b.expert_read_at,
      s.id as summary_id,
      r.id as review_id
    from consulting_bookings b
    join users u on u.id = b.user_id
    left join consulting_summaries s on s.booking_id = b.id
    left join consulting_expert_reviews r on r.booking_id = b.id
    where b.expert_id = $1
    order by b.scheduled_at asc nulls last, b.created_at desc
    """,
    account["expert_id"],
  )
  return [dict(row) for row in rows]


async def list_bookings(db: Database, account: dict[str, Any], filters: dict[str, Any]) -> list[dict[str, Any]]:
  rows = await _booking_rows(db, account)
  bookings = [_booking_to_web(row) for row in rows]
  status = filters.get("status")
  if status and status != "all":
    bookings = [booking for booking in bookings if booking["status"] == status]
  expert_id = filters.get("expert_id")
  if expert_id:
    bookings = [booking for booking in bookings if booking["expert_id"] == expert_id]
  date_from = filters.get("date_from")
  if date_from:
    bookings = [booking for booking in bookings if booking["starts_at"][:10] >= date_from]
  date_to = filters.get("date_to")
  if date_to:
    bookings = [booking for booking in bookings if booking["starts_at"][:10] <= date_to]
  query = str(filters.get("query") or "").strip().lower()
  if query:
    by_id = {str(row["id"]): row for row in rows}
    bookings = [
      booking
      for booking in bookings
      if query in " ".join(
        [
          booking["type"],
          booking["request_memo"],
          _customer_name(by_id[booking["id"]]),
          _customer_phone(by_id[booking["id"]]),
          account["expert_name"],
        ],
      ).lower()
    ]
  sort = filters.get("sort") or "startsAtAsc"
  if sort == "startsAtDesc":
    return sorted(bookings, key=lambda item: item["starts_at"], reverse=True)
  if sort == "createdDesc":
    return sorted(bookings, key=lambda item: item["requested_at"], reverse=True)
  return sorted(bookings, key=lambda item: item["starts_at"])


async def booking_detail(db: Database, account: dict[str, Any], booking_id: str) -> dict[str, Any]:
  row = await _booking_row(db, account, booking_id)
  booking = _booking_to_web(row)
  reports = await shared_reports_for_booking(db, booking_id, row.get("shared_report_ids") or [])
  return {
    "booking": booking,
    "customer": await customer_detail_for_user(db, account, str(row["user_id"]), row),
    "expert": await expert_profile(account),
    "shared_reports": reports,
    "consultation_summary": await consultation_summary_for_booking(db, booking_id),
    "refund_request": None,
    "review": None,
  }


async def _booking_row(db: Database, account: dict[str, Any], booking_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select
      b.*,
      u.email,
      u.nickname,
      u.name as user_name,
      u.phone,
      u.created_at as user_created_at,
      b.expert_read_at,
      s.id as summary_id,
      r.id as review_id
    from consulting_bookings b
    join users u on u.id = b.user_id
    left join consulting_summaries s on s.booking_id = b.id
    left join consulting_expert_reviews r on r.booking_id = b.id
    where b.id::text = $1
      and b.expert_id = $2
    """,
    booking_id,
    account["expert_id"],
  )
  if row is None:
    raise AppError(404, "PARTNER_BOOKING_NOT_FOUND", "예약을 찾을 수 없습니다.")
  return dict(row)


async def update_booking_status(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  status: str,
  operator_note: str | None = None,
) -> dict[str, Any]:
  await _booking_row(db, account, booking_id)
  next_status = _map_partner_status(status)
  if next_status == "completed":
    raise AppError(409, "CONSULTING_SUMMARY_REQUIRED", "완료 처리는 AI 요약 생성 후 진행해 주세요.")
  row = await db.fetchrow(
    """
    update consulting_bookings
    set status = $3,
        operator_note = coalesce($4, operator_note),
        confirmed_at = case when $3 in ('confirmed', 'scheduled', 'in_progress') then now() else confirmed_at end
    where id::text = $1 and expert_id = $2
    returning *
    """,
    booking_id,
    account["expert_id"],
    next_status,
    operator_note,
  )
  return _booking_to_web(dict(row))


def _parse_partner_booking_datetime(value: Any) -> datetime | None:
  if not isinstance(value, str) or not value.strip():
    return None
  try:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
  except ValueError as error:
    raise AppError(400, "PARTNER_BOOKING_DATETIME_INVALID", "예약 날짜와 시간을 확인해 주세요.") from error
  return parsed if parsed.tzinfo else parsed.replace(tzinfo=ZoneInfo("Asia/Seoul"))


def _append_operator_note(current: str, value: str | None) -> str:
  normalized = (value or "").strip()
  if not normalized:
    return current
  return "\n".join(part for part in (current.strip(), normalized) if part)


async def update_booking_details(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  payload: dict[str, Any],
) -> dict[str, Any]:
  current = await _booking_row(db, account, booking_id)
  patch = payload.get("patch") if isinstance(payload.get("patch"), dict) else {}
  status_value = payload.get("status")
  next_status = _map_partner_status(str(status_value)) if status_value else str(current.get("status") or "requested")
  if next_status == "completed":
    raise AppError(409, "CONSULTING_SUMMARY_REQUIRED", "완료 처리는 AI 요약 생성 후 진행해 주세요.")

  scheduled_at = _parse_partner_booking_datetime(patch.get("starts_at"))
  duration_value = patch.get("duration_minutes")
  duration_minutes = int(duration_value) if duration_value in {30, 60, "30", "60"} else None
  category_label = str(patch.get("type") or "").strip() or None
  operator_note = str(patch.get("internal_memo") if "internal_memo" in patch else current.get("operator_note") or "")
  operator_note = _append_operator_note(operator_note, payload.get("note"))
  cancel_reason = str(payload.get("cancel_reason") or "").strip()
  if cancel_reason:
    operator_note = _append_operator_note(operator_note, f"취소 사유: {cancel_reason}")
  payment_confirmed = bool(payload.get("mark_payment_paid"))

  local_scheduled_at = scheduled_at.astimezone(ZoneInfo("Asia/Seoul")) if scheduled_at else None
  row = await db.fetchrow(
    """
    update consulting_bookings
    set status = $3,
        operator_note = $4,
        scheduled_at = coalesce($5, scheduled_at),
        scheduled_date = coalesce($6, scheduled_date),
        slot_id = coalesce($7, slot_id),
        slot_start_minutes = coalesce($8, slot_start_minutes),
        duration_minutes = coalesce($9, duration_minutes),
        duration_label = case when $9 is null then duration_label else $9::text || '분' end,
        category_label = coalesce($10, category_label),
        confirmed_at = case
          when $11 or $3 in ('confirmed', 'scheduled', 'in_progress') then coalesce(confirmed_at, now())
          else confirmed_at
        end,
        updated_at = now()
    where id::text = $1 and expert_id = $2
    returning *
    """,
    booking_id,
    account["expert_id"],
    next_status,
    operator_note,
    scheduled_at,
    local_scheduled_at.date() if local_scheduled_at else None,
    local_scheduled_at.strftime("%H:%M") if local_scheduled_at else None,
    (local_scheduled_at.hour * 60 + local_scheduled_at.minute) if local_scheduled_at else None,
    duration_minutes,
    category_label,
    payment_confirmed,
  )
  if row is None:
    raise AppError(404, "PARTNER_BOOKING_NOT_FOUND", "예약을 찾을 수 없습니다.")
  return _booking_to_web(dict(row))


async def mark_booking_payment_paid(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
) -> dict[str, Any]:
  return await update_booking_details(
    db,
    account,
    booking_id,
    {"mark_payment_paid": True, "status": "contacting"},
  )


async def customers(db: Database, account: dict[str, Any], filters: dict[str, Any]) -> list[dict[str, Any]]:
  rows = await db.fetch(
    """
    select distinct on (b.user_id)
      b.user_id::text as user_id,
      u.email,
      u.nickname,
      u.name as user_name,
      u.phone,
      u.created_at as user_created_at,
      b.contact_name,
      b.contact_phone,
      b.preferred_contact_method,
      b.category_label,
      b.concern_label,
      b.question,
      b.status as latest_booking_status,
      b.created_at,
      max(b.created_at) over (partition by b.user_id) as last_booking_at,
      count(*) over (partition by b.user_id) as total_bookings,
      count(*) filter (where b.status = 'completed') over (partition by b.user_id) as completed_bookings,
      coalesce(sum(b.price) over (partition by b.user_id), 0) as total_paid_amount
    from consulting_bookings b
    join users u on u.id = b.user_id
    where b.expert_id = $1
    order by b.user_id, b.created_at desc
    """,
    account["expert_id"],
  )
  result = [_customer_to_web(dict(row)) for row in rows]
  query = str(filters.get("query") or "").strip().lower()
  if query:
    result = [
      customer
      for customer in result
      if query in " ".join([customer["name"], customer["phone"], customer["email"], customer["memo"]]).lower()
    ]
  tag = str(filters.get("tag") or "").strip()
  if tag and tag != "all":
    result = [customer for customer in result if tag in customer["tags"]]
  status = str(filters.get("status") or "").strip()
  if status and status != "all":
    result = [customer for customer in result if customer["latest_booking_status"] == status]
  sort = str(filters.get("sort") or "lastActiveDesc")
  if sort == "nameAsc":
    return sorted(result, key=lambda item: item["name"])
  if sort == "paidDesc":
    return sorted(result, key=lambda item: item["total_paid_amount"], reverse=True)
  return sorted(result, key=lambda item: item["last_active_at"], reverse=True)


async def customer_detail_for_user(
  db: Database,
  account: dict[str, Any],
  customer_id: str,
  fallback_booking_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
  rows = await db.fetch(
    """
    select
      b.*,
      u.email,
      u.nickname,
      u.name as user_name,
      u.phone,
      u.created_at as user_created_at,
      s.id as summary_id,
      r.id as review_id,
      count(*) over (partition by b.user_id) as total_bookings,
      count(*) filter (where b.status = 'completed') over (partition by b.user_id) as completed_bookings,
      coalesce(sum(b.price) over (partition by b.user_id), 0) as total_paid_amount,
      max(b.created_at) over (partition by b.user_id) as last_booking_at
    from consulting_bookings b
    join users u on u.id = b.user_id
    left join consulting_summaries s on s.booking_id = b.id
    left join consulting_expert_reviews r on r.booking_id = b.id
    where b.expert_id = $1 and b.user_id::text = $2
    order by b.created_at desc
    """,
    account["expert_id"],
    customer_id,
  )
  if not rows and fallback_booking_row is None:
    raise AppError(404, "PARTNER_CUSTOMER_NOT_FOUND", "고객을 찾을 수 없습니다.")
  aggregate_row = dict(rows[0]) if rows else None
  booking_row = fallback_booking_row or aggregate_row or {}
  return _customer_to_web_for_booking(dict(booking_row), aggregate_row)


async def customer_detail(db: Database, account: dict[str, Any], customer_id: str) -> dict[str, Any]:
  rows = await _booking_rows(db, account)
  customer_rows = [row for row in rows if str(row["user_id"]) == customer_id]
  if not customer_rows:
    raise AppError(404, "PARTNER_CUSTOMER_NOT_FOUND", "고객을 찾을 수 없습니다.")
  booking_items = [_booking_to_web(row) for row in customer_rows]
  report_items: list[dict[str, Any]] = []
  for booking in booking_items:
    row = next(item for item in customer_rows if str(item["id"]) == booking["id"])
    report_items.extend(await shared_reports_for_booking(db, booking["id"], row.get("shared_report_ids") or []))
  return {
    "customer": await customer_detail_for_user(db, account, customer_id, customer_rows[0]),
    "bookings": sorted(booking_items, key=lambda item: item["starts_at"], reverse=True),
    "shared_reports": report_items,
    "consultation_summaries": [
      summary
      for booking in booking_items
      if (summary := await consultation_summary_for_booking(db, booking["id"])) is not None
    ],
    "reviews": [],
  }


async def shared_reports_for_booking(
  db: Database,
  booking_id: str,
  report_ids: list[Any],
) -> list[dict[str, Any]]:
  ids = [str(report_id) for report_id in report_ids]
  if not ids:
    return []
  analysis_rows = await db.fetch(
    """
    select *
    from analysis_reports
    where id::text = any($1::text[])
    order by analyzed_at desc nulls last, created_at desc
    """,
    ids,
  )
  feedback_rows = await db.fetch(
    """
    select *
    from makeup_feedback_reports
    where id::text = any($1::text[])
    order by completed_at desc nulls last, created_at desc
    """,
    ids,
  )
  reports = [
    _shared_report_from_analysis(dict(row), booking_id)
    for row in analysis_rows
  ] + [
    _shared_report_from_feedback(dict(row), booking_id)
    for row in feedback_rows
  ]
  by_id = {report["id"]: report for report in reports}
  return [by_id[report_id] for report_id in ids if report_id in by_id]


async def shared_reports(db: Database, account: dict[str, Any], customer_id: str | None = None) -> list[dict[str, Any]]:
  rows = await _booking_rows(db, account)
  result: list[dict[str, Any]] = []
  for row in rows:
    if customer_id and str(row["user_id"]) != customer_id:
      continue
    result.extend(await shared_reports_for_booking(db, str(row["id"]), row.get("shared_report_ids") or []))
  seen: set[str] = set()
  unique: list[dict[str, Any]] = []
  for report in result:
    if report["id"] in seen:
      continue
    seen.add(report["id"])
    unique.append(report)
  return unique


async def report_detail(db: Database, account: dict[str, Any], report_id: str) -> dict[str, Any]:
  allowed_reports = await shared_reports(db, account)
  if report_id not in {report["id"] for report in allowed_reports}:
    raise AppError(404, "PARTNER_REPORT_NOT_FOUND", "예약에 연결된 리포트를 찾을 수 없습니다.")
  analysis = await db.fetchrow(
    """
    select
      r.*,
      coalesce(source.thumbnail_cdn_url, source.cdn_url) as source_image_url,
      coalesce(preview.thumbnail_cdn_url, preview.cdn_url) as preview_image_url
    from analysis_reports r
    left join media_assets source on source.id = r.source_media_id
    left join media_assets preview on preview.id = r.preview_media_id
    where r.id::text = $1
    """,
    report_id,
  )
  if analysis is not None:
    row = dict(analysis)
    detail_payload = _decode_json(row.get("detail_payload"), {})
    source_image_url = row.get("source_image_url")
    preview_image_url = row.get("preview_image_url")
    return {
      "report": _shared_report_from_analysis(row),
      "kind": "analysis",
      "detail": {
        "personal_color": row.get("personal_color"),
        "face_shape": row.get("face_shape"),
        "skin_type": row.get("skin_type"),
        "tone_summary": row.get("tone_summary"),
        "recommended_mood": row.get("recommended_mood"),
        "summary": row.get("summary"),
        "short_summary": row.get("short_summary"),
        "skin_analysis_summary": row.get("skin_analysis_summary"),
        "base_makeup_guide": row.get("base_makeup_guide"),
        "tags": row.get("tags") or [],
        "image_url": preview_image_url or source_image_url,
        "source_image_url": source_image_url,
        "preview_image_url": preview_image_url,
        "recommended_makeup_images": _recommended_makeup_images(detail_payload),
        "detail_payload": detail_payload,
      },
    }
  feedback = await db.fetchrow(
    """
    select
      r.*,
      coalesce(media.thumbnail_cdn_url, media.cdn_url) as uploaded_image_url
    from makeup_feedback_reports r
    left join media_assets media on media.id = r.uploaded_media_id
    where r.id::text = $1
    """,
    report_id,
  )
  if feedback is not None:
    row = dict(feedback)
    detail = _decode_json(row.get("feedback_payload"), {})
    if isinstance(detail, dict):
      detail = {
        **detail,
        "image_url": row.get("uploaded_image_url"),
        "source_image_url": row.get("uploaded_image_url"),
      }
    return {
      "report": _shared_report_from_feedback(row),
      "kind": "feedback",
      "detail": detail,
    }
  raise AppError(404, "PARTNER_REPORT_NOT_FOUND", "리포트를 찾을 수 없습니다.")


async def consultation_summary_for_booking(db: Database, booking_id: str) -> dict[str, Any] | None:
  row = await db.fetchrow(
    """
    select
      s.*,
      b.user_id::text as customer_id
    from consulting_summaries s
    join consulting_bookings b on b.id = s.booking_id
    where s.booking_id::text = $1
    """,
    booking_id,
  )
  if row is None:
    return None
  return _summary_to_web(dict(row))


async def generate_consultation_summary(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  transcript: str,
  expert_comment: str | None = None,
  visible_to_customer: bool = True,
) -> dict[str, Any]:
  row = await _booking_row(db, account, booking_id)
  _assert_can_create_summary(row)
  clean_transcript = _collapse_whitespace(transcript)
  if not clean_transcript:
    raise AppError(400, "CONSULTING_TRANSCRIPT_REQUIRED", "AI 요약 생성을 위해 화상상담 transcript가 필요합니다.")

  fields = _build_ai_summary_fields(row, clean_transcript)
  created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
  summary = {
    "id": f"summary-preview-{uuid4()}",
    "booking_id": str(row["id"]),
    "expert_id": row["expert_id"],
    "customer_id": str(row["user_id"]),
    "created_at": created_at,
    "source": "phone_ai",
    "ai_status": "succeeded",
    "ai_model": SUMMARY_AI_MODEL,
    "transcript": clean_transcript,
    "internal_memo": (expert_comment or "").strip(),
    "customer_summary": fields["customer_summary"],
    "recommendations": fields["recommendations"],
    "visible_to_customer": visible_to_customer,
    "delivered_report_ids": [],
    "review_request_status": "ready",
  }
  return {"job": _summary_job_for(row, account, created_at), "summary": summary}


async def complete_consultation_summary(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  transcript: str | None = None,
  expert_comment: str | None = None,
  customer_summary: str | None = None,
  recommendations: str | None = None,
  visible_to_customer: bool = True,
  delivered_report_ids: list[str] | None = None,
  send_review_request: bool = True,
) -> dict[str, Any]:
  row = await _booking_row(db, account, booking_id)
  _assert_can_create_summary(row)
  clean_transcript = _collapse_whitespace(transcript)
  clean_summary = (customer_summary or "").strip()
  clean_recommendations = (recommendations or "").strip()
  if not clean_summary or not clean_recommendations:
    if not clean_transcript:
      raise AppError(400, "CONSULTING_AI_SUMMARY_REQUIRED", "AI 요약 생성 후 완료 처리해 주세요.")
    fields = _build_ai_summary_fields(row, clean_transcript)
    clean_summary = clean_summary or fields["customer_summary"]
    clean_recommendations = clean_recommendations or fields["recommendations"]

  notes = _summary_notes_for_ai(clean_summary, clean_recommendations, expert_comment)
  await db.execute(
    """
    insert into consulting_summaries (
      booking_id,
      expert_id,
      duration_label,
      date_label,
      notes,
      products
    )
    values ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb)
    on conflict (booking_id) do update set
      expert_id = excluded.expert_id,
      duration_label = excluded.duration_label,
      date_label = excluded.date_label,
      notes = excluded.notes,
      products = excluded.products
    """,
    booking_id,
    row["expert_id"],
    row.get("duration_label") or "",
    row.get("date_label") or "",
    json.dumps(notes, ensure_ascii=False),
  )

  if str(row.get("status") or "") != "completed":
    await db.execute(
      """
      update consulting_bookings
      set status = 'completed',
          updated_at = now()
      where id::text = $1 and expert_id = $2
      """,
      booking_id,
      account["expert_id"],
    )
    await db.execute(
      """
      update consulting_experts
      set session_count = session_count + 1
      where id = $1
      """,
      row["expert_id"],
    )

  summary = await consultation_summary_for_booking(db, booking_id)
  if summary is None:
    raise AppError(500, "CONSULTING_SUMMARY_SAVE_FAILED", "상담 요약 저장에 실패했습니다.")
  summary["visible_to_customer"] = visible_to_customer
  summary["delivered_report_ids"] = delivered_report_ids or []
  summary["review_request_status"] = "sent" if send_review_request else "ready"
  return summary


async def chat_threads_for_account(db: Database, account: dict[str, Any]) -> list[dict[str, Any]]:
  rows = await _booking_rows(db, account)
  details: list[dict[str, Any]] = []
  conversations: dict[str, list[dict[str, Any]]] = {}
  for row in rows:
    conversation_id = str(row.get("conversation_id") or row["id"])
    conversations.setdefault(conversation_id, []).append(row)

  for conversation_rows in conversations.values():
    visible_rows = [row for row in conversation_rows if _is_chat_visible_booking_row(row)]
    if not visible_rows:
      continue
    row = max(visible_rows, key=lambda item: item.get("created_at") or datetime.min.replace(tzinfo=timezone.utc))
    if row.get("expert_left_at") is not None:
      continue
    booking_ids = [str(item["id"]) for item in visible_rows]
    messages = await _messages_for_bookings(db, booking_ids, str(row["id"]))
    booking = _booking_to_web(row)
    latest_message = messages[-1] if messages else None
    read_at = max(
      (value for value in (item.get("expert_read_at") for item in visible_rows) if value is not None),
      default=None,
    )
    unread_count = _unread_customer_message_count(messages, read_at)
    is_closed = row.get("customer_left_at") is not None or booking["status"] in {"cancelled", "no_show", "refund_requested"}
    thread = {
      "id": str(row["id"]),
      "customer_id": str(row["user_id"]),
      "booking_id": str(row["id"]),
      "assigned_expert_id": row["expert_id"],
      "last_message_at": latest_message["sent_at"] if latest_message else booking["requested_at"],
      "unread_count": unread_count,
      "status": "closed" if is_closed else "waiting" if unread_count else "open",
      "channel": "app_chat",
    }
    details.append(
      {
        "thread": thread,
        "customer": await customer_detail_for_user(db, account, str(row["user_id"]), row),
        "booking": booking,
        "expert": await expert_profile(account),
        "shared_reports": await shared_reports_for_booking(db, str(row["id"]), row.get("shared_report_ids") or []),
        "messages": messages,
      },
    )
  return sorted(
    details,
    key=lambda item: item["thread"]["last_message_at"],
    reverse=True,
  )


async def chat_thread_detail(db: Database, account: dict[str, Any], thread_id: str) -> dict[str, Any]:
  requested_row = await _booking_row(db, account, thread_id)
  if not _is_chat_visible_booking_row(requested_row):
    raise AppError(404, "PARTNER_CHAT_NOT_CONFIRMED", "예약 확정 후 채팅을 이용할 수 있습니다.")
  conversation_id = str(requested_row.get("conversation_id") or requested_row["id"])
  conversation_rows = [
    item
    for item in await _booking_rows(db, account)
    if str(item.get("conversation_id") or item["id"]) == conversation_id
  ]
  visible_rows = [row for row in conversation_rows if _is_chat_visible_booking_row(row)]
  if not visible_rows:
    raise AppError(404, "PARTNER_CHAT_NOT_CONFIRMED", "예약 확정 후 채팅을 이용할 수 있습니다.")
  latest_row = max(visible_rows, key=lambda item: item.get("created_at") or datetime.min.replace(tzinfo=timezone.utc))
  booking_ids = [str(item["id"]) for item in visible_rows]
  messages = await _messages_for_bookings(db, booking_ids, str(latest_row["id"]))
  row = latest_row
  thread_id = str(row["id"])
  booking = _booking_to_web(row)
  latest_message = messages[-1] if messages else None
  return {
    "thread": {
      "id": thread_id,
      "customer_id": str(row["user_id"]),
      "booking_id": thread_id,
      "assigned_expert_id": row["expert_id"],
      "last_message_at": latest_message["sent_at"] if latest_message else booking["requested_at"],
      "unread_count": 0,
      "status": "closed" if row.get("customer_left_at") or row.get("expert_left_at") else "open",
      "channel": "app_chat",
    },
    "customer": await customer_detail_for_user(db, account, str(row["user_id"]), row),
    "booking": booking,
    "expert": await expert_profile(account),
    "shared_reports": await shared_reports_for_booking(db, thread_id, row.get("shared_report_ids") or []),
    "messages": messages,
  }


async def mark_chat_thread_read(db: Database, account: dict[str, Any], thread_id: str) -> dict[str, Any]:
  row = await _booking_row(db, account, thread_id)
  await db.execute(
    """
    update consulting_bookings
    set expert_read_at = now()
    where coalesce(conversation_id, id) = $1 and expert_id = $2
    """,
    row.get("conversation_id") or row["id"],
    account["expert_id"],
  )
  return await chat_thread_detail(db, account, thread_id)


async def _messages_for_booking(db: Database, booking_id: str) -> list[dict[str, Any]]:
  events = await list_consulting_messages(db, booking_id=booking_id, limit=100)
  return [_message_event_to_web(event, booking_id) for event in events]


async def _messages_for_bookings(db: Database, booking_ids: list[str], thread_id: str) -> list[dict[str, Any]]:
  events = await list_consulting_messages(
    db,
    booking_id=thread_id,
    booking_ids=booking_ids,
    limit=100,
  )
  return [_message_event_to_web(event, thread_id) for event in events]


async def leave_chat_thread(db: Database, account: dict[str, Any], thread_id: str) -> dict[str, Any]:
  booking_id = thread_id.removeprefix("thread-")
  row = await _booking_row(db, account, booking_id)
  conversation_id = row.get("conversation_id") or row["id"]
  await db.execute(
    """
    update consulting_bookings
    set expert_left_at = coalesce(expert_left_at, now()), updated_at = now()
    where coalesce(conversation_id, id) = $1 and expert_id = $2
    """,
    conversation_id,
    account["expert_id"],
  )
  return {"booking_id": str(row["id"]), "conversation_id": str(conversation_id), "left": True}


def _unread_customer_message_count(messages: list[dict[str, Any]], read_at: Any) -> int:
  read_datetime = _parse_datetime(read_at)
  count = 0
  for message in messages:
    if message.get("sender_type") != "customer":
      continue
    sent_datetime = _parse_datetime(message.get("sent_at"))
    if read_datetime is None or sent_datetime is None or sent_datetime > read_datetime:
      count += 1
  return count


def _message_event_to_web(event: dict[str, Any], thread_id: str) -> dict[str, Any]:
  sender_type = event.get("senderType") or event.get("sender_type")
  if sender_type == "user":
    web_sender_type = "customer"
  elif sender_type == "system":
    web_sender_type = "system"
  else:
    web_sender_type = sender_type or "expert"
  media = event.get("media") or []
  return {
    "id": event["id"],
    "thread_id": thread_id,
    "sender_type": web_sender_type,
    "sender_name": event.get("senderName") or event.get("sender_name") or "상담",
    "body": event.get("body") or "",
    "sent_at": event.get("sentAt") or event.get("sent_at") or _iso_datetime(None),
    "attachments": [
      {
        "id": item["id"],
        "owner_id": thread_id,
        "type": "image",
        "name": item.get("contentType") or "chat-image",
        "url": item.get("thumbnailUrl") or item.get("cdnUrl") or "",
        "uploaded_at": event.get("sentAt") or event.get("sent_at") or _iso_datetime(None),
      }
      for item in media
      if isinstance(item, dict) and item.get("id")
    ],
  }
