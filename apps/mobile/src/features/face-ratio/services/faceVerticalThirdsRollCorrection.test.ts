import type {
  VerticalThirdsKeypoint,
  VerticalThirdsKeypointMap,
} from '../types';
import {
  applyRollCorrectionToKeypoints,
  ROLL_CORRECTION_MAX_ABS_DEG,
  rotateLandmarksAroundPoint,
  rotatePointAroundCenter,
} from './faceVerticalThirdsRollCorrection';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectClose(actual: number, expected: number, tolerance: number, message: string) {
  expect(
    Math.abs(actual - expected) <= tolerance,
    `${message} (actual=${actual}, expected=${expected})`,
  );
}

// --- 회전 수학 (이미지 좌표계 y-down) ---

const rotated90 = rotatePointAroundCenter({x: 10, y: 0}, 90, {x: 0, y: 0});
expectClose(rotated90.x, 0, 1e-9, '90deg rotation moves +x to origin x');
expectClose(rotated90.y, 10, 1e-9, '90deg rotation in y-down space moves +x to +y');

const centerInvariant = rotatePointAroundCenter({x: 55, y: 70}, 33, {x: 55, y: 70});
expectClose(centerInvariant.x, 55, 1e-9, 'rotation center x is invariant');
expectClose(centerInvariant.y, 70, 1e-9, 'rotation center y is invariant');

const roundTrip = rotatePointAroundCenter(
  rotatePointAroundCenter({x: 320, y: 480}, 2.5, {x: 540, y: 720}),
  -2.5,
  {x: 540, y: 720},
);
expectClose(roundTrip.x, 320, 1e-6, 'rotating by θ then -θ restores x');
expectClose(roundTrip.y, 480, 1e-6, 'rotating by θ then -θ restores y');

const rotatedLandmarks = rotateLandmarksAroundPoint({
  angleDeg: -2,
  center: {x: 540, y: 720},
  landmarks: [
    {confidence: 0.8, method: 'm', provider: 'mediapipe' as const, x: 540, y: 300},
  ],
});
expect(
  rotatedLandmarks[0].confidence === 0.8 && rotatedLandmarks[0].method === 'm',
  'rotation preserves non-coordinate keypoint fields',
);

// --- applyRollCorrectionToKeypoints ---

function buildKeypoint(x: number, y: number): VerticalThirdsKeypoint {
  return {confidence: 0.82, method: 'test', provider: 'mediapipe', x, y};
}

const imageWidth = 1080;
const imageHeight = 1440;
const keypoints: VerticalThirdsKeypointMap = {
  G: buildKeypoint(540, 500),
  H: buildKeypoint(540, 330),
  Me: buildKeypoint(540, 980),
  Sn: buildKeypoint(540, 720),
};

const applied = applyRollCorrectionToKeypoints({
  imageHeight,
  imageWidth,
  keypoints,
  rollDeg: 2,
});

expect(applied.outcome.applied, 'valid roll applies the correction');
expect(
  applied.outcome.method === 'mediapipe_pose_roll' &&
    applied.outcome.rollCorrectionDeg === -2,
  'correction angle is -rollDeg per the contract',
);
expect(
  applied.outcome.center?.x === 540 && applied.outcome.center?.y === 720,
  'rotation centers on the image geometric center',
);
// Sn at image center (540,720) stays put
expect(
  applied.keypoints.Sn?.x === 540 && applied.keypoints.Sn?.y === 720,
  'keypoint at the rotation center stays put',
);
// H above center: θ=-2° → x' = 540 - (720-330)·sin(2°)
const rotatedH = applied.keypoints.H as VerticalThirdsKeypoint;
expectClose(
  rotatedH.x,
  540 - (720 - 330) * Math.sin((2 * Math.PI) / 180),
  0.05,
  'H rotates around the image center by the correction angle',
);

const nullSafe = applyRollCorrectionToKeypoints({
  imageHeight,
  imageWidth,
  keypoints: {...keypoints, H: null},
  rollDeg: 2,
});
expect(nullSafe.keypoints.H === null, 'null keypoints stay null through the correction');
expect(nullSafe.outcome.applied, 'null keypoints do not block correction of the others');

const noRoll = applyRollCorrectionToKeypoints({
  imageHeight,
  imageWidth,
  keypoints,
  rollDeg: undefined,
});
expect(
  !noRoll.outcome.applied && noRoll.outcome.skippedReason === 'roll_unavailable',
  'missing roll skips with roll_unavailable',
);
expect(noRoll.keypoints === keypoints, 'skipped correction returns the input keypoints');

const bigRoll = applyRollCorrectionToKeypoints({
  imageHeight,
  imageWidth,
  keypoints,
  rollDeg: ROLL_CORRECTION_MAX_ABS_DEG + 1,
});
expect(
  !bigRoll.outcome.applied && bigRoll.outcome.skippedReason === 'roll_out_of_range',
  'large roll is never rescued by correction',
);

const badDim = applyRollCorrectionToKeypoints({
  imageHeight: 0,
  imageWidth,
  keypoints,
  rollDeg: 2,
});
expect(
  !badDim.outcome.applied && badDim.outcome.skippedReason === 'dimension_invalid',
  'invalid image dimension skips the correction',
);

console.log('faceVerticalThirdsRollCorrection tests passed');
