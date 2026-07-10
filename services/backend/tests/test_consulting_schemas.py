from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.settings import Settings
from app.main import create_app
from app.schemas.consulting import AdminBookingStatusUpdate, BookingCreate
from app.schemas.consulting_call import (
  ConsultingCallJoinRequest,
  ConsultingCaptionTranslateRequest,
  ConsultingTranscriptionStartRequest,
)
from app.services.consulting_places import (
  LOCAL_PLACE_CATEGORY_QUERIES,
  _map_naver_local_item,
  build_local_place_query,
  build_local_place_queries,
)
from app.services.consulting import _build_booking_days
from app.services.consulting_call import _validate_joinable_booking


def _schedule_settings(
  hours: list[dict],
  *,
  booking_open_months: int = 1,
  holidays: list[str] | None = None,
):
  return {
    "operating_hours": hours,
    "booking_open_months": booking_open_months,
    "holidays": holidays or [],
  }


def _hours(open_days: dict[int, tuple[str, str]]) -> list[dict]:
  labels = ["월", "화", "수", "목", "금", "토", "일"]
  return [
    {
      "day_of_week": day,
      "label": labels[day],
      "opens_at": open_days.get(day, ("10:00", "19:00"))[0],
      "closes_at": open_days.get(day, ("10:00", "19:00"))[1],
      "is_closed": day not in open_days,
    }
    for day in range(7)
  ]


def test_booking_create_parses_mobile_request_payload() -> None:
  payload = BookingCreate.model_validate(
    {
      "expertId": "exp_sea",
      "durationId": "d30",
      "dayId": "2026-07-07",
      "slotId": "18:30",
      "shareReports": True,
      "contactName": "서진",
      "contactPhone": "010-0000-0000",
      "preferredContactMethod": "sms",
      "sessionMode": "offline",
      "estimatedPrice": 29000,
    },
  )

  assert payload.day_id == date(2026, 7, 7)
  assert payload.contact_name == "서진"
  assert payload.preferred_contact_method == "sms"
  assert payload.session_mode == "offline"
  assert payload.estimated_price == 29000


def test_booking_create_rejects_kakao_contact_method() -> None:
  with pytest.raises(ValidationError):
    BookingCreate.model_validate(
      {
        "expertId": "exp_sea",
        "durationId": "d30",
        "dayId": "2026-07-07",
        "slotId": "18:30",
        "preferredContactMethod": "kakao",
      },
    )


@pytest.mark.parametrize("status", ["scheduled", "in_progress"])
def test_admin_booking_status_accepts_video_call_runtime_statuses(status: str) -> None:
  payload = AdminBookingStatusUpdate.model_validate({"status": status})

  assert payload.status == status


def test_consulting_call_join_accepts_supported_language_codes() -> None:
  payload = ConsultingCallJoinRequest.model_validate({"languageCode": "en-US"})

  assert payload.language_code == "en-US"


def test_consulting_call_join_rejects_unsupported_language_code() -> None:
  with pytest.raises(ValidationError):
    ConsultingCallJoinRequest.model_validate({"languageCode": "ja-JP"})


def test_consulting_transcription_start_requires_explicit_consent_flag() -> None:
  default_payload = ConsultingTranscriptionStartRequest.model_validate({"languageCode": "ko-KR"})
  accepted_payload = ConsultingTranscriptionStartRequest.model_validate(
    {
      "languageCode": "en-US",
      "transcriptionConsentAccepted": True,
    },
  )

  assert default_payload.transcription_consent_accepted is False
  assert accepted_payload.language_code == "en-US"
  assert accepted_payload.transcription_consent_accepted is True


def test_consulting_caption_translate_accepts_final_caption_payload() -> None:
  payload = ConsultingCaptionTranslateRequest.model_validate(
    {
      "resultId": "caption-1",
      "sourceLanguageCode": "ko-KR",
      "content": "이 색상이 잘 어울려요.",
    },
  )

  assert payload.result_id == "caption-1"
  assert payload.source_language_code == "ko-KR"


def test_consulting_caption_translate_rejects_unsupported_language_code() -> None:
  with pytest.raises(ValidationError):
    ConsultingCaptionTranslateRequest.model_validate(
      {
        "resultId": "caption-1",
        "sourceLanguageCode": "ja-JP",
        "content": "테스트",
      },
    )


def test_consulting_call_allows_confirmed_online_booking_in_join_window() -> None:
  now = datetime(2026, 7, 10, 9, 0, tzinfo=timezone.utc)
  booking = {
    "status": "confirmed",
    "session_mode": "online",
    "scheduled_at": now + timedelta(minutes=10),
    "duration_minutes": 30,
  }

  _validate_joinable_booking(booking, now=now, settings=Settings())


def test_consulting_call_allows_scheduled_and_in_progress_online_booking_in_join_window() -> None:
  now = datetime(2026, 7, 10, 9, 0, tzinfo=timezone.utc)
  base_booking = {
    "session_mode": "online",
    "scheduled_at": now + timedelta(minutes=10),
    "duration_minutes": 30,
  }

  _validate_joinable_booking({**base_booking, "status": "scheduled"}, now=now, settings=Settings())
  _validate_joinable_booking({**base_booking, "status": "in_progress"}, now=now, settings=Settings())


def test_consulting_call_rejects_unconfirmed_or_offline_booking() -> None:
  now = datetime(2026, 7, 10, 9, 0, tzinfo=timezone.utc)
  base_booking = {
    "status": "confirmed",
    "session_mode": "online",
    "scheduled_at": now,
    "duration_minutes": 30,
  }

  with pytest.raises(AppError, match="CONSULTING_CALL_BOOKING_NOT_CONFIRMED"):
    _validate_joinable_booking({**base_booking, "status": "requested"}, now=now, settings=Settings())

  with pytest.raises(AppError, match="CONSULTING_CALL_OFFLINE_BOOKING"):
    _validate_joinable_booking({**base_booking, "session_mode": "offline"}, now=now, settings=Settings())


def test_consulting_call_respects_join_window() -> None:
  now = datetime(2026, 7, 10, 9, 0, tzinfo=timezone.utc)
  settings = Settings(consulting_call_join_early_minutes=15, consulting_call_join_late_minutes=30)
  base_booking = {
    "status": "confirmed",
    "session_mode": "online",
    "duration_minutes": 30,
  }

  with pytest.raises(AppError, match="CONSULTING_CALL_TOO_EARLY"):
    _validate_joinable_booking(
      {**base_booking, "scheduled_at": now + timedelta(minutes=16)},
      now=now,
      settings=settings,
    )

  with pytest.raises(AppError, match="CONSULTING_CALL_WINDOW_CLOSED"):
    _validate_joinable_booking(
      {**base_booking, "scheduled_at": now - timedelta(minutes=61)},
      now=now,
      settings=settings,
    )


def test_consulting_days_are_generated_from_booking_rules() -> None:
  days = _build_booking_days(
    {"2026-07-14": [(18 * 60 + 30, 30)]},
    duration_minutes=60,
    start_day=date(2026, 7, 14),
    schedule_settings=_schedule_settings(
      _hours({0: ("10:00", "20:00"), 1: ("10:00", "20:00")}),
    ),
  )

  assert len(days) == 32
  assert days[0]["id"] == "2026-07-14"
  slots = {slot["id"]: slot for slot in days[0]["slots"]}
  assert slots["17:30"]["available"] is True
  assert slots["18:00"]["available"] is False
  assert slots["18:30"]["available"] is False
  assert slots["19:00"]["available"] is True
  assert "19:30" not in slots
  assert "20:00" not in slots


def test_consulting_days_follow_persisted_operating_hours() -> None:
  days = _build_booking_days(
    duration_minutes=30,
    start_day=date(2026, 7, 13),
    schedule_settings=_schedule_settings(
      _hours({
        0: ("18:00", "20:00"),
        1: ("18:00", "20:00"),
        2: ("18:00", "20:00"),
        3: ("18:00", "20:00"),
        4: ("18:00", "20:00"),
        5: ("10:00", "12:00"),
        6: ("10:00", "12:00"),
      }),
    ),
  )

  monday_slots = [slot["id"] for slot in days[0]["slots"]]
  saturday_slots = [slot["id"] for slot in days[5]["slots"]]

  assert monday_slots == ["18:00", "18:30", "19:00", "19:30"]
  assert saturday_slots == ["10:00", "10:30", "11:00", "11:30"]


def test_consulting_days_hide_slots_that_exceed_duration_window() -> None:
  days = _build_booking_days(
    duration_minutes=60,
    start_day=date(2026, 7, 14),
    schedule_settings=_schedule_settings(
      _hours({
        1: ("18:00", "20:00"),
        3: ("18:00", "20:00"),
        5: ("10:00", "17:00"),
        6: ("10:00", "17:00"),
      }),
    ),
  )

  tuesday_slots = [slot["id"] for slot in days[0]["slots"]]
  wednesday_slots = [slot["id"] for slot in days[1]["slots"]]
  saturday_slots = [slot["id"] for slot in days[4]["slots"]]

  assert tuesday_slots == ["18:00", "18:30", "19:00"]
  assert wednesday_slots == []
  assert saturday_slots[-1] == "16:00"


def test_consulting_days_use_real_calendar_months() -> None:
  january_2026_days = _build_booking_days(
    start_day=date(2026, 1, 31),
    schedule_settings=_schedule_settings(_hours({5: ("10:00", "12:00")})),
  )
  january_2028_days = _build_booking_days(
    start_day=date(2028, 1, 31),
    schedule_settings=_schedule_settings(_hours({0: ("10:00", "12:00")})),
  )

  assert january_2026_days[-1]["id"] == "2026-02-28"
  assert january_2028_days[-1]["id"] == "2028-02-29"


def test_consulting_local_place_query_combines_region_and_category() -> None:
  assert build_local_place_query(
    category="makeup",
    region="성수",
    query=None,
  ) == "성수 메이크업샵"


def test_consulting_local_place_categories_match_mvp_scope() -> None:
  assert set(LOCAL_PLACE_CATEGORY_QUERIES) == {
    "hair",
    "makeup",
    "personalColor",
    "fashion",
  }


def test_consulting_local_place_query_variants_expand_region_results() -> None:
  queries = build_local_place_queries(
    category="fashion",
    region="강남",
    query=None,
  )

  assert queries == ["강남 패션 골격진단", "강남 골격진단", "강남 이미지 컨설팅", "강남 체형 진단"]


def test_consulting_local_place_mapping_cleans_naver_markup() -> None:
  place = _map_naver_local_item(
    {
      "title": "<b>아우라</b> 헤어",
      "category": "미용>헤어",
      "description": "성수 헤어샵",
      "telephone": "02-123-4567",
      "address": "서울 성동구",
      "roadAddress": "서울 성동구 연무장길",
      "mapx": "1270000000",
      "mapy": "370000000",
      "link": "https://example.com/aura-hair",
    },
    category="hair",
    latitude=37.1,
    longitude=127.1,
  )

  assert place["name"] == "아우라 헤어"
  assert place["road_address"] == "서울 성동구 연무장길"
  assert place["source"] == "naver_local"
  assert place["naver_map_url"].startswith("https://map.naver.com/p/search/")
  assert place["naver_reservation_url"] == ""
  assert place["naver_place_search_url"] == (
    "https://m.place.naver.com/place/list?"
    "query=%EC%95%84%EC%9A%B0%EB%9D%BC%20%ED%97%A4%EC%96%B4"
  )
  assert place["website_url"] == "https://example.com/aura-hair"
  assert place["distance_label"]
  assert place["category_label"] == "헤어"
  assert place["service_highlights"] == ["컷/펌/염색", "두상·얼굴형 상담", "플레이스 정보 확인"]
  assert place["price_hint"] == "컷·펌·염색 가격은 네이버 플레이스에서 확인"
  assert place["booking_hint"] == "예약 버튼이 보이지 않는 업체도 있어요. 네이버 플레이스에서 실제 예약 운영 여부를 확인해 주세요."
  assert place["reservation_search_keyword"] == "아우라 헤어 헤어 예약 가능 여부"
  assert place["thumbnail_key"] in {
    "consulting-hero-fashion.jpg",
    "consulting-hero-hair.jpg",
    "consulting-hero-online.jpg",
  }
  assert "서울 성동구 연무장길" in place["detail_lines"]


def test_consulting_local_places_returns_empty_without_naver_credentials() -> None:
  client = TestClient(
    create_app(
      Settings(
        naver_shopping_client_id=None,
        naver_shopping_client_secret=None,
      ),
    ),
  )

  response = client.get("/api/consulting/local-places?category=hair&region=성수")

  assert response.status_code == 200
  body = response.json()
  assert body["data"]["places"] == []
  assert body["data"]["source"] == "empty_not_configured"
  assert body["data"]["query"] == "성수 헤어샵"
