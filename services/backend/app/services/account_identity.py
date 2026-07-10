import hashlib


SUPPORTED_AUTH_PROVIDERS = {"google", "kakao", "naver", "apple"}


def normalize_auth_provider(provider: str) -> str:
  return provider if provider in SUPPORTED_AUTH_PROVIDERS else "google"


def hash_auth_subject(provider: str, subject: str) -> str:
  identity = f"{normalize_auth_provider(provider)}\0{subject}"

  return hashlib.sha256(identity.encode("utf-8")).hexdigest()
