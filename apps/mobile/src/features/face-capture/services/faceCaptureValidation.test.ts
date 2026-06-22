import {
  FACE_CAPTURE_ERROR_COLOR,
  FACE_CAPTURE_READY_COLOR,
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

const readyGuidance = evaluateFaceCaptureGuidance({
  isFaceCentered: true,
  isLookingForward: true,
  isFaceUncovered: true,
  isHairClear: true,
  isLightingEven: true,
});

expectEqual(readyGuidance.status, 'ready', 'ready status');
expectEqual(readyGuidance.isCaptureEnabled, true, 'ready capture enabled');
expectEqual(readyGuidance.tintColor, FACE_CAPTURE_READY_COLOR, 'ready tint color');
expectEqual(readyGuidance.message, null, 'ready message');

const blockedGuidance = evaluateFaceCaptureGuidance({
  isFaceCentered: true,
  isLookingForward: false,
  isFaceUncovered: false,
  isHairClear: true,
  isLightingEven: true,
});

expectEqual(blockedGuidance.status, 'blocked', 'blocked status');
expectEqual(blockedGuidance.isCaptureEnabled, false, 'blocked capture disabled');
expectEqual(blockedGuidance.tintColor, FACE_CAPTURE_ERROR_COLOR, 'blocked tint color');
expectEqual(blockedGuidance.message, '정면을 바라봐 주세요', 'blocked first message');
expectArrayIncludes(blockedGuidance.failedChecks, 'isLookingForward', 'blocked looking-forward check');
expectArrayIncludes(blockedGuidance.failedChecks, 'isFaceUncovered', 'blocked uncovered-face check');
