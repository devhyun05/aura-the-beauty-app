from datetime import date

from app.services.users import profile_is_completed


def test_profile_is_completed_requires_profile_fields_in_addition_to_email() -> None:
  assert not profile_is_completed({"email": "du822623@gmail.com"})
  assert profile_is_completed(
    {
      "email": "du822623@gmail.com",
      "name": "서진",
      "nickname": "두치",
      "birth_date": date(2001, 1, 1),
      "gender": "unknown",
    }
  )


def test_profile_is_completed_rejects_placeholder_profile_values() -> None:
  assert not profile_is_completed(
    {
      "email": "dev@example.com",
      "name": "Local Dev",
      "nickname": "Local Dev",
      "birth_date": date(2001, 1, 1),
      "gender": "unknown",
    }
  )
