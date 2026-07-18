import {
  isUnifiedFaceCaptureDiagnosticsEnabled,
  isUnifiedFaceCaptureEnabled,
} from './unifiedFaceCaptureMode';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(isUnifiedFaceCaptureEnabled(undefined), true, 'product flag defaults on');
expectEqual(isUnifiedFaceCaptureEnabled('unknown'), true, 'unknown product flag stays on');
expectEqual(isUnifiedFaceCaptureEnabled('1'), true, 'enabled product flag stays on');
expectEqual(isUnifiedFaceCaptureEnabled('true'), true, 'true product flag stays on');
expectEqual(isUnifiedFaceCaptureEnabled('off'), true, 'disabled product flag cannot turn it off');

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
