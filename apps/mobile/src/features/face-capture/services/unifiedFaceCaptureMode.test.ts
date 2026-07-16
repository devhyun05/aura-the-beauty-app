import {
  isUnifiedFaceCaptureDiagnosticsEnabled,
  isUnifiedFaceCaptureEnabled,
} from './unifiedFaceCaptureMode';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(isUnifiedFaceCaptureEnabled(undefined), false, 'product flag defaults off');
expectEqual(isUnifiedFaceCaptureEnabled('unknown'), false, 'unknown product flag stays off');
expectEqual(isUnifiedFaceCaptureEnabled('1'), true, 'product flag accepts one');
expectEqual(isUnifiedFaceCaptureEnabled('true'), true, 'product flag accepts true');
expectEqual(isUnifiedFaceCaptureEnabled('off'), false, 'product flag accepts off');

expectEqual(
  isUnifiedFaceCaptureDiagnosticsEnabled(undefined),
  false,
  'diagnostics flag defaults off',
);
expectEqual(
  isUnifiedFaceCaptureDiagnosticsEnabled('yes'),
  true,
  'diagnostics flag accepts yes',
);
