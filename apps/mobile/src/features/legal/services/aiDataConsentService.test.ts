import {
  AI_DATA_CONSENT_VERSION,
  isCurrentAiDataConsentAccepted,
  normalizeAiDataConsentState,
  type AiDataConsentState,
} from './aiDataConsentService';

const acceptedPurpose = {
  accepted: true,
  acceptedAt: '2026-07-23T14:00:00Z',
  revokedAt: null,
  version: AI_DATA_CONSENT_VERSION,
};

function buildConsent(
  purposes: AiDataConsentState['purposes'],
): AiDataConsentState {
  return {
    accepted: true,
    consentIds: ['camera', 'processing', 'third-party'],
    dataCategories: [],
    purposes,
    recipients: [],
    version: AI_DATA_CONSENT_VERSION,
  };
}

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const camelCaseNormalized = normalizeAiDataConsentState(
  buildConsent({
    cameraAnalysis: acceptedPurpose,
    aiProcessing: acceptedPurpose,
    thirdPartyAi: acceptedPurpose,
  }),
);

expectEqual(
  isCurrentAiDataConsentAccepted(camelCaseNormalized),
  true,
  'camel-cased dynamic purpose keys are accepted',
);
expectEqual(
  camelCaseNormalized.purposes.camera_analysis,
  acceptedPurpose,
  'camera purpose is canonicalized',
);
expectEqual(
  camelCaseNormalized.purposes.ai_processing,
  acceptedPurpose,
  'processing purpose is canonicalized',
);
expectEqual(
  camelCaseNormalized.purposes.third_party_ai,
  acceptedPurpose,
  'third-party purpose is canonicalized',
);

const snakeCaseNormalized = normalizeAiDataConsentState(
  buildConsent({
    camera_analysis: acceptedPurpose,
    ai_processing: acceptedPurpose,
    third_party_ai: acceptedPurpose,
  }),
);

expectEqual(
  isCurrentAiDataConsentAccepted(snakeCaseNormalized),
  true,
  'snake-cased purpose keys remain compatible',
);
