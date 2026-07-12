import {evaluateFaceCaptureGreenlight} from './faceCaptureGreenlight';
import {
  REALTIME_DEFAULT_POSE_GATE,
  REALTIME_FACE_ANALYSIS_POSE_GATE,
} from '../constants/facePoseGates';

const guide = {
  centerX: 180,
  centerY: 360,
  height: 420,
  width: 280,
};

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const stableCamera = {
  isStable: true,
  stableDurationMs: 900,
  stableThresholdMs: 700,
  status: 'ok',
} as const;

const alignedScreenLandmarks = {
  chin: {left: 181, top: 540},
  forehead: {left: 178, top: 180},
  noseBridge: {left: 180, top: 300},
  noseTip: {left: 182, top: 380},
};

const missingMediaPipeReport = evaluateFaceCaptureGreenlight({
  cameraStability: stableCamera,
  guide,
});

expect(
  missingMediaPipeReport.mediaPipeAlignmentGreenlight === false,
  'MediaPipe payload absence must never pass alignment greenlight.',
);
expect(
  missingMediaPipeReport.finalCaptureGreenlight === false,
  'MediaPipe payload absence must never pass final capture greenlight.',
);
expect(
  missingMediaPipeReport.failureReasons.includes('landmark_missing'),
  'Missing MediaPipe payload should report landmark_missing.',
);

const passingReport = evaluateFaceCaptureGreenlight({
  cameraStability: stableCamera,
  guide,
  mediaPipe: {
    faceWidthRatio: 0.46,
    landmarks: {},
    rollDeg: 0.4,
    screenLandmarks: alignedScreenLandmarks,
    status: 'ok',
    yawDeg: -1.2,
  },
});

expect(
  passingReport.finalCaptureGreenlight === true,
  'Aligned MediaPipe payload plus stable camera should pass.',
);

const nativeNumericStableReport = evaluateFaceCaptureGreenlight({
  cameraStability: {
    isStable: 1,
    stableDurationMs: 900,
    stableThresholdMs: 700,
    status: 'ok',
  },
  guide,
  mediaPipe: {
    faceWidthRatio: 0.46,
    landmarks: {},
    rollDeg: 0.4,
    screenLandmarks: alignedScreenLandmarks,
    status: 'ok',
    yawDeg: -1.2,
  },
});

expect(
  nativeNumericStableReport.cameraStabilityGreenlight === true,
  'Native numeric isStable=1 should pass camera stability greenlight.',
);
expect(
  nativeNumericStableReport.finalCaptureGreenlight === true,
  'Native numeric isStable=1 should pass final capture greenlight when aligned.',
);

// ── poseGate 프로파일 분기 ─────────────────────────────────────────────
// roll 6°: 기본(완화, roll≤8) 프로파일은 통과, face_analysis(사후 동치,
// roll≤5) 프로파일은 not_forward 로 차단되어야 한다.
const rollSixMediaPipe = {
  faceWidthRatio: 0.46,
  landmarks: {},
  rollDeg: 6,
  screenLandmarks: alignedScreenLandmarks,
  status: 'ok',
  yawDeg: 0,
} as const;

const defaultProfileRollSix = evaluateFaceCaptureGreenlight({
  cameraStability: stableCamera,
  guide,
  mediaPipe: rollSixMediaPipe,
  poseGate: REALTIME_DEFAULT_POSE_GATE,
});
expect(
  defaultProfileRollSix.finalCaptureGreenlight === true,
  'roll 6° should pass the relaxed default profile (personal_color/hair).',
);

const faceAnalysisProfileRollSix = evaluateFaceCaptureGreenlight({
  cameraStability: stableCamera,
  guide,
  mediaPipe: rollSixMediaPipe,
  poseGate: REALTIME_FACE_ANALYSIS_POSE_GATE,
});
expect(
  faceAnalysisProfileRollSix.finalCaptureGreenlight === false &&
    faceAnalysisProfileRollSix.failureReasons.includes('not_forward'),
  'roll 6° must be blocked as not_forward under the face_analysis profile (post-gate parity).',
);

// yaw 9°: 기본 프로파일(≤10) 통과 / face_analysis(≤8) 차단 — 종전 사고 구간.
const yawNineMediaPipe = {...rollSixMediaPipe, rollDeg: 0, yawDeg: 9} as const;
expect(
  evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: yawNineMediaPipe,
    poseGate: REALTIME_DEFAULT_POSE_GATE,
  }).finalCaptureGreenlight === true,
  'yaw 9° should pass the relaxed default profile.',
);
expect(
  evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: yawNineMediaPipe,
    poseGate: REALTIME_FACE_ANALYSIS_POSE_GATE,
  }).finalCaptureGreenlight === false,
  'yaw 9° must be blocked under the face_analysis profile (was the 8<yaw≤10 폐기 구간).',
);

// poseGate 미전달 시 기본 프로파일과 동일 동작 (하위 호환)
expect(
  evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: rollSixMediaPipe,
  }).finalCaptureGreenlight === true,
  'omitted poseGate must behave as the relaxed default profile.',
);

console.log('faceCaptureGreenlight tests passed');
