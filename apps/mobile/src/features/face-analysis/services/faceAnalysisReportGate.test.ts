import {
  FACE_REPORT_OPEN_DEADLINE_MS,
  FACE_REPORT_OPEN_MINIMUM_MS,
  resolveFaceReportOpenDecision,
} from './faceAnalysisReportGate';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

expectEqual(
  resolveFaceReportOpenDecision({
    elapsedMs: FACE_REPORT_OPEN_MINIMUM_MS - 1,
    perceptionReady: true,
  }),
  'wait',
  'perception cannot bypass the ten second minimum',
);

expectEqual(
  resolveFaceReportOpenDecision({
    elapsedMs: FACE_REPORT_OPEN_MINIMUM_MS,
    perceptionReady: true,
  }),
  'open-perception',
  'perception opens the report at the preferred boundary',
);

expectEqual(
  resolveFaceReportOpenDecision({
    elapsedMs: FACE_REPORT_OPEN_DEADLINE_MS - 1,
    perceptionReady: false,
  }),
  'wait',
  'the report waits for perception inside the preferred window',
);

expectEqual(
  resolveFaceReportOpenDecision({
    elapsedMs: FACE_REPORT_OPEN_DEADLINE_MS,
    perceptionReady: false,
  }),
  'open-fallback',
  'the report opens with fallback content at the deadline',
);
