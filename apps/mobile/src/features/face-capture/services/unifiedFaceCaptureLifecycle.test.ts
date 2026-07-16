import {shouldFinalizeUnifiedCaptureForAppState} from './unifiedFaceCaptureLifecycle';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

expectEqual(
  shouldFinalizeUnifiedCaptureForAppState('inactive'),
  false,
  'transient iOS inactive state keeps the request resumable',
);
expectEqual(
  shouldFinalizeUnifiedCaptureForAppState('active'),
  false,
  'active state does not finalize',
);
expectEqual(
  shouldFinalizeUnifiedCaptureForAppState('background'),
  true,
  'background transition releases camera ownership',
);
