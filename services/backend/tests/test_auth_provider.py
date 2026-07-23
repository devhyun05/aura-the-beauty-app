from app.core.security import _parse_provider
from app.services.account_identity import normalize_auth_provider


def test_cognito_sign_in_with_apple_identity_maps_to_apple() -> None:
  assert _parse_provider({
    "identities": [
      {
        "providerName": "SignInWithApple",
        "providerType": "SignInWithApple",
      }
    ]
  }) == "apple"


def test_cognito_sign_in_with_apple_username_maps_to_apple() -> None:
  assert _parse_provider({"cognito:username": "SignInWithApple_001122"}) == "apple"


def test_cognito_sign_in_with_apple_access_token_username_maps_to_apple() -> None:
  assert _parse_provider({"username": "SignInWithApple_001122"}) == "apple"


def test_account_identity_accepts_cognito_apple_alias() -> None:
  assert normalize_auth_provider("SignInWithApple") == "apple"
