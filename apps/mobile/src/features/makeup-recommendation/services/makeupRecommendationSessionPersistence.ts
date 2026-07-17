import {BackendApiError} from '../../../shared/services/backendApi';
import type {MakeupRecommendationSession} from '../types';

export const MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY =
  '@aura/makeup-recommendation/current-session-id/v1';

export type MakeupRecommendationSessionIdStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type MakeupRecommendationSessionRestoreDestination =
  | 'question'
  | 'loading'
  | 'retry'
  | 'results'
  | 'discard';

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 160 ? normalized : null;
}

export async function readCurrentMakeupRecommendationSessionId(
  storage: MakeupRecommendationSessionIdStorage,
): Promise<string | null> {
  try {
    const stored = await storage.getItem(MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY);
    const sessionId = normalizeSessionId(stored);
    if (stored !== null && !sessionId) {
      await storage.removeItem(MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY);
    }
    return sessionId;
  } catch {
    return null;
  }
}

export async function saveCurrentMakeupRecommendationSessionId(
  sessionId: string,
  storage: MakeupRecommendationSessionIdStorage,
): Promise<void> {
  const normalized = normalizeSessionId(sessionId);
  if (!normalized) return;
  try {
    // Store the opaque id only. Session context, answers, and custom text stay server-side.
    await storage.setItem(MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, normalized);
  } catch {
    // Persistence is best-effort and must not block the recommendation flow.
  }
}

export async function clearCurrentMakeupRecommendationSessionId(
  storage: MakeupRecommendationSessionIdStorage,
  expectedSessionId?: string,
): Promise<void> {
  try {
    if (expectedSessionId) {
      const stored = await storage.getItem(MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY);
      if (normalizeSessionId(stored) !== normalizeSessionId(expectedSessionId)) return;
    }
    await storage.removeItem(MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY);
  } catch {
    // Cleanup is best-effort and must not block navigation.
  }
}

export function isMakeupRecommendationSessionExpired(
  session: Pick<MakeupRecommendationSession, 'expiresAt'>,
  nowMs = Date.now(),
): boolean {
  if (!session.expiresAt) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

export function getMakeupRecommendationSessionRestoreDestination(
  session: Pick<MakeupRecommendationSession, 'status' | 'expiresAt' | 'reportId'>,
  nowMs = Date.now(),
): MakeupRecommendationSessionRestoreDestination {
  if (isMakeupRecommendationSessionExpired(session, nowMs)) return 'discard';
  if (session.status === 'questioning') return 'question';
  if (session.status === 'ready' || session.status === 'generating') return 'loading';
  if (session.status === 'failed') return 'retry';
  if (session.status === 'completed' && session.reportId) return 'results';
  return 'discard';
}

export function shouldDiscardStoredMakeupRecommendationSessionForError(error: unknown): boolean {
  if (!(error instanceof BackendApiError)) return false;
  if (
    error.status === 409
    && (error.code === 'MAKEUP_SESSION_GENERATING' || error.code === 'MAKEUP_SESSION_STATE_CHANGED')
  ) return false;
  return [400, 401, 403, 404, 409, 410, 422].includes(error.status);
}
