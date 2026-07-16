import {
  getUnifiedFaceCaptureLabPolicy,
  UNIFIED_FACE_CAPTURE_LAB_MODES,
} from './unifiedFaceCaptureDiagnostics';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  UNIFIED_FACE_CAPTURE_LAB_MODES.map(option => option.mode).join(','),
  'legacy-30,product-5-of-8,exact-1,exact-3,exact-5,exact-8,exact-12,exact-30',
  'lab exposes legacy, product candidate, and exact sweep',
);
expectEqual(
  getUnifiedFaceCaptureLabPolicy('legacy-30'),
  null,
  'legacy mode does not enter unified controller',
);
expectEqual(
  getUnifiedFaceCaptureLabPolicy('exact-1'),
  'diagnostics-exact-1-v1',
  'single-frame mode uses exact policy',
);
expectEqual(
  getUnifiedFaceCaptureLabPolicy('exact-30'),
  'diagnostics-exact-30-v1',
  'paired baseline uses exact 30 policy',
);
