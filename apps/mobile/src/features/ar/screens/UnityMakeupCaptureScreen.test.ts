import {
  buildUnitySynchronizedCaptureRequest,
} from '../../../shared/contracts/fullFaceMakeupRecipe';
import {
  getUnityHudSliderPanResponderInitMode,
  isCurrentUnityCaptureRequest,
  UNITY_GENERATED_LIP_RETRY_USES_LATEST_COMPANION_CONTROLS,
} from './UnityMakeupCaptureScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const currentRequest = buildUnitySynchronizedCaptureRequest({
  capturePairId: 'pair-current',
  requestedAtMs: 1000,
});
const staleRequest = buildUnitySynchronizedCaptureRequest({
  capturePairId: 'pair-stale',
  requestedAtMs: 1001,
});

expectEqual(
  isCurrentUnityCaptureRequest(currentRequest, currentRequest.capturePairId),
  true,
  'unity capture guard accepts current request',
);
expectEqual(
  isCurrentUnityCaptureRequest(staleRequest, currentRequest.capturePairId),
  false,
  'unity capture guard rejects stale request',
);
expectEqual(
  getUnityHudSliderPanResponderInitMode(),
  'lazy-ref',
  'unity hud slider pan responder initializes lazily',
);

const generatedLipRetryUsesLatestControls: true =
  UNITY_GENERATED_LIP_RETRY_USES_LATEST_COMPANION_CONTROLS;
