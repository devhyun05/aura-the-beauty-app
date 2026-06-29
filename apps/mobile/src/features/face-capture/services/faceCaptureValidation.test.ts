import {
  FACE_CAPTURE_ERROR_COLOR,
  FACE_CAPTURE_READY_COLOR,
  evaluateFaceCaptureChecksFromLandmarks,
  evaluateFaceCaptureGuidance,
} from './faceCaptureValidation';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectArrayIncludes<T>(actual: readonly T[], expected: T, label: string) {
  if (!actual.includes(expected)) {
    throw new Error(`${label}: expected ${String(expected)} in ${actual.join(', ')}`);
  }
}

const readyChecks = evaluateFaceCaptureChecksFromLandmarks({
  confidence: 0.92,
  faceCount: 1,
  landmarks: {
    chin: {x: 0.5, y: 0.74},
    forehead: {x: 0.5, y: 0.26},
    leftCheek: {x: 0.36, y: 0.52},
    leftEye: {x: 0.42, y: 0.42},
    leftJaw: {x: 0.4, y: 0.66},
    mouthLeft: {x: 0.45, y: 0.62},
    mouthRight: {x: 0.55, y: 0.62},
    noseBase: {x: 0.5, y: 0.54},
    rightCheek: {x: 0.64, y: 0.52},
    rightEye: {x: 0.58, y: 0.421},
    rightJaw: {x: 0.6, y: 0.66},
  },
});

const readyGuidance = evaluateFaceCaptureGuidance(readyChecks);

expectEqual(readyGuidance.status, 'ready', 'ready status');
expectEqual(readyGuidance.isCaptureEnabled, true, 'ready capture enabled');
expectEqual(readyGuidance.tintColor, FACE_CAPTURE_READY_COLOR, 'ready tint color');
expectEqual(readyGuidance.message, null, 'ready message');

const slightlyTurnedGuidance = evaluateFaceCaptureGuidance({
  ...readyChecks,
  isLookingForward: false,
});

expectEqual(slightlyTurnedGuidance.status, 'ready', 'slightly turned status');
expectEqual(
  slightlyTurnedGuidance.isCaptureEnabled,
  true,
  'slightly turned capture enabled',
);

const blockedChecks = evaluateFaceCaptureChecksFromLandmarks({
  confidence: 0.7,
  faceCount: 1,
  landmarks: {
    leftEye: {x: 0.3, y: 0.4},
    mouthLeft: {x: 0.42, y: 0.62},
    mouthRight: {x: 0.58, y: 0.62},
    noseBase: {x: 0.58, y: 0.54},
    rightEye: {x: 0.62, y: 0.5},
  },
});
const blockedGuidance = evaluateFaceCaptureGuidance(blockedChecks);

expectEqual(blockedGuidance.status, 'blocked', 'blocked status');
expectEqual(blockedGuidance.isCaptureEnabled, false, 'blocked capture disabled');
expectEqual(blockedGuidance.tintColor, FACE_CAPTURE_ERROR_COLOR, 'blocked tint color');
expectEqual(
  blockedGuidance.message,
  '얼굴을 가이드 라인 안에 맞춰주세요',
  'blocked first message',
);
expectArrayIncludes(blockedGuidance.failedChecks, 'isLookingForward', 'blocked looking-forward check');
expectArrayIncludes(blockedGuidance.failedChecks, 'isFaceShapeDetected', 'blocked face-shape check');
