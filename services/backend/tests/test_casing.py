from app.core.casing import camelize


def test_camelize_nested_payload() -> None:
  payload = {
    "user_id": "u1",
    "profile_data": {
      "skin_type": "dry",
      "tags": [{"created_at": "now"}],
    },
  }

  assert camelize(payload) == {
    "userId": "u1",
    "profileData": {
      "skinType": "dry",
      "tags": [{"createdAt": "now"}],
    },
  }
