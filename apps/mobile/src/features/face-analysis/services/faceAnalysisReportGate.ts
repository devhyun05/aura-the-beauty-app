export const FACE_REPORT_OPEN_MINIMUM_MS = 10_000;
export const FACE_REPORT_OPEN_DEADLINE_MS = 15_000;

export type FaceReportOpenDecision =
  | 'wait'
  | 'open-perception'
  | 'open-fallback';

export function resolveFaceReportOpenDecision({
  elapsedMs,
  perceptionReady,
}: {
  elapsedMs: number;
  perceptionReady: boolean;
}): FaceReportOpenDecision {
  if (elapsedMs < FACE_REPORT_OPEN_MINIMUM_MS) {
    return 'wait';
  }
  if (perceptionReady) {
    return 'open-perception';
  }
  return elapsedMs >= FACE_REPORT_OPEN_DEADLINE_MS
    ? 'open-fallback'
    : 'wait';
}
