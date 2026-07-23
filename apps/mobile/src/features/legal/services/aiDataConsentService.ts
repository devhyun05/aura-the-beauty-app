import {requestBackendJson} from '../../../shared/services/backendApi';

export const AI_DATA_CONSENT_VERSION = 'ai-photo-processing-v1';

export type AiDataConsentState = {
  accepted: boolean;
  consentIds: string[];
  dataCategories: string[];
  purposes: Record<string, {
    accepted: boolean;
    acceptedAt?: string | null;
    revokedAt?: string | null;
    version?: string | null;
  }>;
  recipients: string[];
  version: string;
};

type AiDataConsentPayload = {
  consent: AiDataConsentState;
};

let cachedConsent:
  | {state: AiDataConsentState; userId: string}
  | null = null;
let cacheGeneration = 0;

const REQUIRED_AI_DATA_CONSENT_PURPOSES = [
  'camera_analysis',
  'ai_processing',
  'third_party_ai',
] as const;

export function isCurrentAiDataConsentAccepted(
  state: AiDataConsentState | null | undefined,
): boolean {
  if (
    !state?.accepted ||
    state.version !== AI_DATA_CONSENT_VERSION ||
    new Set(state.consentIds ?? []).size < REQUIRED_AI_DATA_CONSENT_PURPOSES.length
  ) {
    return false;
  }

  return REQUIRED_AI_DATA_CONSENT_PURPOSES.every(purpose => {
    const purposeState = state.purposes?.[purpose];
    return (
      purposeState?.accepted === true &&
      purposeState.version === AI_DATA_CONSENT_VERSION
    );
  });
}

function normalizeConsentState(state: AiDataConsentState): AiDataConsentState {
  return {
    ...state,
    accepted: isCurrentAiDataConsentAccepted(state),
  };
}

export function clearAiDataConsentCache(): void {
  cacheGeneration += 1;
  cachedConsent = null;
}

export async function getAiDataConsent(
  userId: string,
  options: {force?: boolean} = {},
): Promise<AiDataConsentState> {
  if (!options.force && cachedConsent?.userId === userId) {
    return cachedConsent.state;
  }

  const requestGeneration = cacheGeneration;
  const {consent} = await requestBackendJson<AiDataConsentPayload>(
    '/privacy/ai-consent',
    {method: 'GET'},
  );
  const normalizedConsent = normalizeConsentState(consent);
  if (requestGeneration === cacheGeneration) {
    cachedConsent = {state: normalizedConsent, userId};
  }
  return normalizedConsent;
}

export async function updateAiDataConsent(
  userId: string,
  accepted: boolean,
): Promise<AiDataConsentState> {
  const requestGeneration = cacheGeneration + 1;
  cacheGeneration = requestGeneration;
  cachedConsent = null;
  const {consent} = await requestBackendJson<AiDataConsentPayload>(
    '/privacy/ai-consent',
    {
      body: {accepted},
      method: 'PUT',
    },
  );
  const normalizedConsent = normalizeConsentState(consent);
  if (requestGeneration === cacheGeneration) {
    cachedConsent = {state: normalizedConsent, userId};
  }
  return normalizedConsent;
}
