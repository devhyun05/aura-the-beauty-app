from uuid import UUID

from app.services.makeup_recommendation_context import (
  compile_context_snapshot,
  has_current_ai_data_consent_snapshot,
)
from app.services.privacy_consents import (
  AI_DATA_CONSENT_TYPES,
  AI_DATA_CONSENT_VERSION,
)


ANALYSIS_REPORT_ID = UUID("22222222-2222-2222-2222-222222222222")
SOURCE_MEDIA_ID = UUID("77777777-7777-7777-7777-777777777777")


def _verified_consent() -> dict:
  return {
    "accepted": True,
    "version": AI_DATA_CONSENT_VERSION,
    "consentIds": [
      "71111111-1111-1111-1111-111111111111",
      "72222222-2222-2222-2222-222222222222",
      "73333333-3333-3333-3333-333333333333",
    ],
    "purposes": {
      purpose: {
        "accepted": True,
        "acceptedAt": "2026-07-23T00:00:00+00:00",
        "version": AI_DATA_CONSENT_VERSION,
      }
      for purpose in AI_DATA_CONSENT_TYPES
    },
  }


def _context(consent: dict | None) -> dict:
  return compile_context_snapshot(
    {
      "id": ANALYSIS_REPORT_ID,
      "status": "completed",
      "valid_source_media_id": SOURCE_MEDIA_ID,
      "detail_payload": {},
    },
    situation=None,
    keyword=None,
    custom_situation_text="출근 메이크업",
    custom_situation_label=None,
    normalized_custom=None,
    requested_image_mode="personalized",
    ai_data_consent_snapshot=consent,
  )


def test_personalized_mode_without_server_consent_is_downgraded() -> None:
  context = _context(None)

  assert context["image"] == {
    "requestedMode": "personalized",
    "effectiveMode": "generic",
    "personalizedConsent": False,
  }
  assert "aiDataConsent" not in context
  assert has_current_ai_data_consent_snapshot(context) is False


def test_server_verified_consent_enables_personalized_mode_and_is_snapshotted() -> None:
  context = _context(_verified_consent())

  assert context["image"]["effectiveMode"] == "personalized"
  assert context["image"]["personalizedConsent"] is True
  assert context["aiDataConsent"]["schemaVersion"] == "ai-data-consent-snapshot-v1"
  assert has_current_ai_data_consent_snapshot(context) is True


def test_legacy_or_tampered_boolean_does_not_count_as_consent() -> None:
  legacy_context = {
    "image": {
      "requestedMode": "personalized",
      "effectiveMode": "personalized",
      "personalizedConsent": True,
    },
  }
  assert has_current_ai_data_consent_snapshot(legacy_context) is False

  tampered = _verified_consent()
  tampered["consentIds"][1] = tampered["consentIds"][0]
  context = _context(tampered)
  assert context["image"]["effectiveMode"] == "generic"
  assert has_current_ai_data_consent_snapshot(context) is False
