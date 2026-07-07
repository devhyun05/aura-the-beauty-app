from datetime import date

from app.schemas.consulting import BookingCreate
from app.services.consulting import _build_booking_days


def test_booking_create_parses_mobile_day_id_as_date() -> None:
  payload = BookingCreate.model_validate(
    {
      "expertId": "exp_sea",
      "durationId": "d30",
      "dayId": "2026-07-07",
      "slotId": "18:30",
      "shareReports": True,
    },
  )

  assert payload.day_id == date(2026, 7, 7)


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
