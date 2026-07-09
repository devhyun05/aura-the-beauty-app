from datetime import date

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.settings import Settings
from app.main import create_app
from app.schemas.consulting import BookingCreate
from app.services.consulting_places import (
  LOCAL_PLACE_CATEGORY_QUERIES,
  _map_naver_local_item,
  build_local_place_query,
  build_local_place_queries,
)
from app.services.consulting import _build_booking_days


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


def test_consulting_days_are_generated_from_booking_rules() -> None:
  days = _build_booking_days(
    {"2026-07-14": [(18 * 60 + 30, 30)]},
    duration_minutes=60,
    start_day=date(2026, 7, 14),
  )

  assert len(days) == 31
  assert days[0]["id"] == "2026-07-14"
  slots = {slot["id"]: slot for slot in days[0]["slots"]}
  assert slots["17:30"]["available"] is True
  assert slots["18:00"]["available"] is False
  assert slots["18:30"]["available"] is False
  assert slots["19:00"]["available"] is True
  assert slots["19:30"]["available"] is False
  assert slots["20:00"]["available"] is False


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
