import hashlib


SUPPORTED_AUTH_PROVIDERS = {"google", "kakao", "naver", "apple"}
AUTH_PROVIDER_ALIASES = {
  "signinwithapple": "apple",
}


def normalize_auth_provider(provider: str) -> str:
  normalized = provider.strip().lower()
  normalized = AUTH_PROVIDER_ALIASES.get(normalized, normalized)
  return normalized if normalized in SUPPORTED_AUTH_PROVIDERS else "google"


def hash_auth_subject(provider: str, subject: str) -> str:
  identity = f"{normalize_auth_provider(provider)}\0{subject}"

  return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def auth_subject_hashes(provider: str, subject: str) -> list[str]:
  normalized_provider = normalize_auth_provider(provider)
  hashes = [hash_auth_subject(normalized_provider, subject)]

  # Before Apple was normalized explicitly, SignInWithApple identities fell
  # through to the historical Google fallback. Continue honoring that
  # tombstone so an account deleted under the old mapping cannot be recreated.
  if normalized_provider == "apple":
    legacy_hash = hash_auth_subject("google", subject)
    if legacy_hash not in hashes:
      hashes.append(legacy_hash)

  return hashes
