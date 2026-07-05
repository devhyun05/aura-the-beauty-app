import {evaluateFaceCaptureGreenlight} from './faceCaptureGreenlight';

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

export function runFaceCaptureGreenlightTests() {
  const missingMediaPipeReport = evaluateFaceCaptureGreenlight({
    cameraStability: {
      isStable: true,
      stableDurationMs: 900,
      stableThresholdMs: 700,
      status: 'ok',
    },
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
    cameraStability: {
      isStable: true,
      stableDurationMs: 900,
      stableThresholdMs: 700,
      status: 'ok',
    },
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      rollDeg: 0.4,
      screenLandmarks: {
        chin: {left: 181, top: 540},
        forehead: {left: 178, top: 180},
        noseBridge: {left: 180, top: 300},
        noseTip: {left: 182, top: 380},
      },
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
      screenLandmarks: {
        chin: {left: 181, top: 540},
        forehead: {left: 178, top: 180},
        noseBridge: {left: 180, top: 300},
        noseTip: {left: 182, top: 380},
      },
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
}
