import type {
  RealtimeCameraStabilityPayload,
  RealtimeCaptureFrameMetadata,
  RealtimeFaceCaptureLandmarkPayload,
  RealtimeImageQualityPayload,
  RealtimeMediaPipePayload,
} from '../components/RealtimeFaceCaptureNativeView';
import {
  MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS,
  advanceMakeupFeedbackRealtimeQualitySnapshot,
  evaluateMakeupFeedbackCaptureFrameMetadata,
  evaluateMakeupFeedbackRealtimeCaptureSnapshot,
  evaluateMakeupFeedbackRealtimeQuality,
  shouldRequireMakeupFeedbackRealtimeQuality,
} from './makeupFeedbackRealtimeQuality';

const guide = {
  centerX: 180,
  centerY: 360,
  height: 420,
  width: 280,
};

const alignedScreenLandmarks = {
  chin: {left: 181, top: 540},
  forehead: {left: 178, top: 180},
  noseBridge: {left: 180, top: 300},
  noseTip: {left: 182, top: 380},
};

const validImageQuality: RealtimeImageQualityPayload = {
  blurScore: 40,
  exposureMean: 128,
  faceAreaRatio: 0.3,
  faceWidthRatio: 0.46,
  highlightRatio: 0.1,
  shadowRatio: 0.1,
};

const validMediaPipe: RealtimeMediaPipePayload = {
  faceWidthRatio: 0.46,
  landmarks: {},
  pitchDeg: 0,
  pitchMeasured: true,
  poseSource: 'vision',
  rollDeg: 0,
  screenLandmarks: alignedScreenLandmarks,
  status: 'ok',
  yawDeg: 0,
};

const validCameraStability: RealtimeCameraStabilityPayload = {
  isStable: true,
  stableDurationMs: 900,
  stableThresholdMs: 400,
  status: 'ok',
};

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeFrame({
  cameraStability,
  faceCount = 1,
  imageHeight = 720,
  imageQuality,
  imageWidth = 1280,
  includeImageDimensions = true,
  includeImageQuality = true,
  mediaPipe,
  sequence = 1,
  status = 'ok',
}: {
  cameraStability?: Partial<RealtimeCameraStabilityPayload>;
  faceCount?: number;
  imageHeight?: number;
  imageQuality?: Partial<RealtimeImageQualityPayload>;
  imageWidth?: number;
  includeImageDimensions?: boolean;
  includeImageQuality?: boolean;
  mediaPipe?: Partial<RealtimeMediaPipePayload>;
  sequence?: number;
  status?: RealtimeFaceCaptureLandmarkPayload['status'];
} = {}): RealtimeFaceCaptureLandmarkPayload {
  return {
    cameraStability: {
      ...validCameraStability,
      ...cameraStability,
    },
    faceCount,
    imageHeight: includeImageDimensions ? imageHeight : undefined,
    imageQuality: includeImageQuality
      ? {
          ...validImageQuality,
          ...imageQuality,
        }
      : undefined,
    imageWidth: includeImageDimensions ? imageWidth : undefined,
    mediaPipe: {
      ...validMediaPipe,
      ...mediaPipe,
    },
    sequence,
    status,
  };
}

function evaluate(frame: RealtimeFaceCaptureLandmarkPayload = makeFrame()) {
  return evaluateMakeupFeedbackRealtimeQuality({
    analyzerAvailable: true,
    frame,
    guide,
  });
}

function expectFailure(
  frame: RealtimeFaceCaptureLandmarkPayload,
  reason: ReturnType<typeof evaluate>['failureReasons'][number],
  label: string,
) {
  const report = evaluate(frame);
  expect(!report.isCaptureEnabled, label + ' must block capture');
  expect(report.failureReasons.includes(reason), label + ' must report ' + reason);
  return report;
}

expect(
  shouldRequireMakeupFeedbackRealtimeQuality('makeup_feedback'),
  'makeup_feedback must require the strict realtime policy',
);

const unaffectedCaptureTypes = [
  'face_analysis',
  'filter_extraction',
  'ar_try_on',
  'personal_color',
  'hair_analysis',
] as const;
for (const captureType of unaffectedCaptureTypes) {
  expect(
    !shouldRequireMakeupFeedbackRealtimeQuality(captureType),
    captureType + ' must preserve its existing capture policy',
  );
}

const unavailableReport = evaluateMakeupFeedbackRealtimeQuality({
  analyzerAvailable: false,
  guide,
});
expect(
  !unavailableReport.isCaptureEnabled &&
    unavailableReport.failureReasons[0] === 'analyzer_unavailable',
  'missing native analyzer must fail closed for makeup feedback',
);

const pendingReport = evaluateMakeupFeedbackRealtimeQuality({
  analyzerAvailable: true,
  guide,
});
expect(
  !pendingReport.isCaptureEnabled && pendingReport.failureReasons[0] === 'frame_pending',
  'missing first frame must fail closed',
);

expect(evaluate().isCaptureEnabled, 'complete valid evidence must enable capture');

const limits = MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS;
expectFailure(
  makeFrame({includeImageDimensions: false}),
  'image_dimensions_unavailable',
  'missing image dimensions',
);
expectFailure(
  makeFrame({
    imageHeight: limits.minImageShortSidePx - 1,
    imageWidth: 1280,
  }),
  'image_resolution_too_low',
  'short image side below server minimum',
);
expectFailure(
  makeFrame({
    imageHeight: limits.minImageShortSidePx,
    imageWidth: limits.minImageLongSidePx - 1,
  }),
  'image_resolution_too_low',
  'long image side below server minimum',
);
expect(
  evaluate(
    makeFrame({
      imageHeight: limits.minImageShortSidePx,
      imageWidth: limits.minImageLongSidePx,
    }),
  ).isCaptureEnabled,
  'image dimensions exactly at the server minimum must pass',
);
const boundaryReport = evaluate(
  makeFrame({
    cameraStability: {
      stableDurationMs: limits.minStableDurationMs,
      stableThresholdMs: limits.minStableDurationMs,
    },
    imageQuality: {
      blurScore: limits.minBlurScore,
      exposureMean: limits.minExposureMean,
      faceAreaRatio: limits.minFaceAreaRatio,
      faceWidthRatio: limits.minFaceWidthRatio,
      highlightRatio: limits.maxHighlightRatio,
      shadowRatio: limits.maxShadowRatio,
    },
    mediaPipe: {
      pitchDeg: limits.maxAbsPitchDeg,
      rollDeg: limits.maxAbsRollDeg,
      yawDeg: limits.maxAbsYawDeg,
    },
  }),
);
expect(boundaryReport.isCaptureEnabled, 'inclusive live boundary values must pass');

expectFailure(
  makeFrame({faceCount: 0, status: 'no_face'}),
  'no_face',
  'zero faces',
);
const multipleFaces = expectFailure(
  makeFrame({faceCount: 2}),
  'multiple_faces',
  'multiple faces',
);
expect(
  multipleFaces.message === '한 명의 얼굴만 가이드 안에 맞춰주세요',
  'multiple-face guidance must be actionable',
);
expectFailure(
  makeFrame({mediaPipe: {status: 'landmark_missing'}}),
  'landmark_missing',
  'missing landmarks',
);
expectFailure(
  makeFrame({imageQuality: {faceWidthRatio: undefined}}),
  'face_geometry_unavailable',
  'missing bbox face width',
);
expectFailure(
  makeFrame({mediaPipe: {faceWidthRatio: undefined}}),
  'face_geometry_unavailable',
  'missing guide distance face width',
);
expectFailure(
  makeFrame({imageQuality: {faceAreaRatio: undefined}}),
  'face_geometry_unavailable',
  'missing face area',
);
expectFailure(
  makeFrame({imageQuality: {faceWidthRatio: limits.minFaceWidthRatio - 0.001}}),
  'face_too_far',
  'face width below live minimum',
);
expectFailure(
  makeFrame({imageQuality: {faceAreaRatio: limits.minFaceAreaRatio - 0.001}}),
  'face_too_far',
  'face area below live minimum',
);
expectFailure(
  makeFrame({imageQuality: {faceWidthRatio: limits.maxFaceWidthRatio + 0.001}}),
  'face_too_close',
  'face width above live maximum',
);
expectFailure(
  makeFrame({imageQuality: {faceAreaRatio: limits.maxFaceAreaRatio + 0.001}}),
  'face_too_close',
  'face area above live maximum',
);

expectFailure(
  makeFrame({mediaPipe: {yawDeg: undefined}}),
  'pose_unavailable',
  'missing yaw',
);
expectFailure(
  makeFrame({mediaPipe: {pitchDeg: undefined}}),
  'pose_unavailable',
  'missing pitch',
);
expectFailure(
  makeFrame({mediaPipe: {rollDeg: undefined}}),
  'pose_unavailable',
  'missing roll',
);
expectFailure(
  makeFrame({mediaPipe: {poseSource: 'geometry_unavailable'}}),
  'pose_unavailable',
  'invalid pose source',
);
expectFailure(
  makeFrame({mediaPipe: {pitchMeasured: false}}),
  'pose_unavailable',
  'unmeasured pitch',
);
expectFailure(
  makeFrame({mediaPipe: {yawDeg: limits.maxAbsYawDeg + 0.01}}),
  'not_forward',
  'yaw above live maximum',
);
expectFailure(
  makeFrame({mediaPipe: {rollDeg: limits.maxAbsRollDeg + 0.01}}),
  'not_forward',
  'roll above live maximum',
);
expectFailure(
  makeFrame({mediaPipe: {pitchDeg: limits.maxAbsPitchDeg + 0.01}}),
  'pitch_out_of_range',
  'pitch above live maximum',
);

expectFailure(
  makeFrame({
    mediaPipe: {
      screenLandmarks: {
        chin: {left: 230, top: 540},
        forehead: {left: 230, top: 180},
        noseBridge: {left: 230, top: 300},
        noseTip: {left: 230, top: 380},
      },
    },
  }),
  'not_centered',
  'face outside center guide',
);

expectFailure(
  makeFrame({includeImageQuality: false}),
  'face_geometry_unavailable',
  'missing image quality payload',
);
expectFailure(
  makeFrame({imageQuality: {blurScore: undefined}}),
  'quality_metrics_unavailable',
  'missing blur metric',
);
expectFailure(
  makeFrame({imageQuality: {exposureMean: limits.minExposureMean - 0.01}}),
  'underexposed',
  'low exposure mean',
);
expectFailure(
  makeFrame({imageQuality: {shadowRatio: limits.maxShadowRatio + 0.001}}),
  'underexposed',
  'excessive shadow ratio',
);
expectFailure(
  makeFrame({imageQuality: {exposureMean: limits.maxExposureMean + 0.01}}),
  'overexposed',
  'high exposure mean',
);
expectFailure(
  makeFrame({imageQuality: {highlightRatio: limits.maxHighlightRatio + 0.001}}),
  'overexposed',
  'excessive highlight ratio',
);
expectFailure(
  makeFrame({imageQuality: {blurScore: limits.minBlurScore - 0.01}}),
  'blurred',
  'blur below live minimum',
);
expect(
  evaluate(
    makeFrame({
      cameraStability: {
        stableDurationMs: 0,
        stableThresholdMs: limits.minStableDurationMs,
      },
    }),
  ).isCaptureEnabled,
  'native stableDuration must not add a second 400ms wait',
);
expectFailure(
  makeFrame({cameraStability: {adjustingExposure: true}}),
  'camera_unstable',
  'camera exposure adjustment in progress',
);
expectFailure(
  makeFrame({cameraStability: {isStable: false}}),
  'camera_unstable',
  'native camera instability',
);

const holdStarted = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 10}),
  guide,
  receivedAtMs: 1000,
});
const holdAt100 = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 11}),
  guide,
  previousSnapshot: holdStarted,
  receivedAtMs: 1100,
});
const holdAt200 = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 12}),
  guide,
  previousSnapshot: holdAt100,
  receivedAtMs: 1200,
});
const holdAt300 = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 13}),
  guide,
  previousSnapshot: holdAt200,
  receivedAtMs: 1300,
});
const holdAt399 = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 14}),
  guide,
  previousSnapshot: holdAt300,
  receivedAtMs: 1399,
});
const reportAt399 = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1399,
  snapshot: holdAt399,
});
expect(
  !reportAt399.isCaptureEnabled &&
    reportAt399.failureReasons[0] === 'quality_stabilizing',
  'all quality conditions sampled through 399ms must still block capture',
);

const holdAt400 = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 15}),
  guide,
  previousSnapshot: holdAt399,
  receivedAtMs: 1400,
});
const reportAt400 = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1400,
  snapshot: holdAt400,
});
expect(
  reportAt400.isCaptureEnabled,
  'all quality conditions sampled continuously for exactly 400ms must pass',
);

const holdAfter251MsGap = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 11}),
  guide,
  previousSnapshot: holdStarted,
  receivedAtMs: 1000 + limits.maxContinuousFrameGapMs + 1,
});
expect(
  holdAfter251MsGap.qualityPassingSinceMs === holdAfter251MsGap.receivedAtMs,
  'a 251ms event gap must reset continuous quality evidence',
);

const staleAtBoundary = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1400 + limits.maxFrameAgeMs,
  snapshot: holdAt400,
});
expect(
  staleAtBoundary.isCaptureEnabled,
  'snapshot age exactly at the 1000ms limit must pass',
);
const staleOverBoundary = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1400 + limits.maxFrameAgeMs + 1,
  snapshot: holdAt400,
});
expect(
  !staleOverBoundary.isCaptureEnabled &&
    staleOverBoundary.failureReasons[0] === 'frame_stale',
  'snapshot age above the 1000ms limit must block',
);

const failedDuringHold = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({
    imageQuality: {exposureMean: limits.minExposureMean - 1},
    sequence: 11,
  }),
  guide,
  previousSnapshot: holdStarted,
  receivedAtMs: 1200,
});
expect(
  failedDuringHold.qualityPassingSinceMs === null,
  'any failed quality frame must reset the complete-quality hold',
);
const recoveredHold = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 12}),
  guide,
  previousSnapshot: failedDuringHold,
  receivedAtMs: 1400,
});
const recoveredReport = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1400,
  snapshot: recoveredHold,
});
expect(
  !recoveredReport.isCaptureEnabled &&
    recoveredReport.failureReasons[0] === 'quality_stabilizing',
  'a valid frame after a failure must start a new 400ms hold',
);

const delayedFrame = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 16}),
  guide,
  previousSnapshot: holdAt400,
  receivedAtMs: 1400 + limits.maxFrameAgeMs + 1,
});
expect(
  delayedFrame.qualityPassingSinceMs === delayedFrame.receivedAtMs,
  'a long event gap must reset the hold start',
);

const regressedFrame = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({sequence: 11}),
  guide,
  previousSnapshot: holdAt400,
  receivedAtMs: 1410,
});
expect(
  regressedFrame.qualityPassingSinceMs === regressedFrame.receivedAtMs,
  'a non-increasing sequence must reset the hold start',
);

const minimumSequenceFailure =
  evaluateMakeupFeedbackRealtimeCaptureSnapshot({
    analyzerAvailable: true,
    guide,
    minimumSequence: 16,
    nowMs: 1400,
    snapshot: holdAt400,
  });
expect(
  !minimumSequenceFailure.isCaptureEnabled &&
    minimumSequenceFailure.failureReasons[0] === 'frame_stale',
  'a snapshot older than the shutter-start sequence must block',
);

const futureTimestamp = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1399,
  snapshot: holdAt400,
});
expect(
  !futureTimestamp.isCaptureEnabled &&
    futureTimestamp.failureReasons[0] === 'frame_stale',
  'a future event receive timestamp must fail closed',
);

const invalidReceivedAt = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1400,
  snapshot: {
    ...holdAt400,
    receivedAtMs: Number.NaN,
  },
});
expect(
  !invalidReceivedAt.isCaptureEnabled &&
    invalidReceivedAt.failureReasons[0] === 'frame_stale',
  'a snapshot without a finite event receive timestamp must fail closed',
);

const missingSequenceSnapshot = {
  ...holdAt400,
  frame: {
    ...holdAt400.frame,
    sequence: undefined,
  },
};
const missingSequence = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  nowMs: 1400,
  snapshot: missingSequenceSnapshot,
});
expect(
  !missingSequence.isCaptureEnabled &&
    missingSequence.failureReasons[0] === 'frame_stale',
  'a snapshot without sequence evidence must fail closed',
);

const newerFailedSnapshot = advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable: true,
  frame: makeFrame({
    imageQuality: {exposureMean: limits.minExposureMean - 1},
    sequence: 16,
  }),
  guide,
  previousSnapshot: holdAt400,
  receivedAtMs: 1410,
});
const newerFailedReport = evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable: true,
  guide,
  minimumSequence: 15,
  nowMs: 1410,
  snapshot: newerFailedSnapshot,
});
expect(
  !newerFailedReport.isCaptureEnabled &&
    newerFailedReport.failureReasons.includes('underexposed'),
  'a newer failing frame after shutter start must not reuse the older pass',
);

const validCaptureFrameMetadata: RealtimeCaptureFrameMetadata = {
  frame: makeFrame({sequence: 20}),
  frameAgeMsAtCaptureRequest: 100,
  isStale: false,
  photoPixelsAnalyzed: false,
  source: 'latest_pre_shutter_video_frame',
};

const validCaptureFrameReport = evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable: true,
  captureFrameMetadata: validCaptureFrameMetadata,
  guide,
  minimumSequence: 15,
});
expect(
  validCaptureFrameReport.isCaptureEnabled,
  'fresh native request-time frame metadata must pass instantaneous quality',
);

const missingCaptureFrameReport = evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable: true,
  guide,
  minimumSequence: 15,
});
expect(
  !missingCaptureFrameReport.isCaptureEnabled &&
    missingCaptureFrameReport.failureReasons[0] === 'capture_frame_unavailable',
  'missing native request-time metadata must fail closed',
);

const malformedCaptureFrameReport =
  evaluateMakeupFeedbackCaptureFrameMetadata({
    analyzerAvailable: true,
    captureFrameMetadata: {
      ...validCaptureFrameMetadata,
      frame: undefined,
    } as unknown as RealtimeCaptureFrameMetadata,
    guide,
    minimumSequence: 15,
  });
expect(
  !malformedCaptureFrameReport.isCaptureEnabled &&
    malformedCaptureFrameReport.failureReasons[0] ===
      'capture_frame_unavailable',
  'malformed native metadata without a nested frame must not throw or pass',
);

const wrongSourceReport = evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable: true,
  captureFrameMetadata: {
    ...validCaptureFrameMetadata,
    source: 'photo_pixels',
  } as unknown as RealtimeCaptureFrameMetadata,
  guide,
  minimumSequence: 15,
});
expect(
  !wrongSourceReport.isCaptureEnabled &&
    wrongSourceReport.failureReasons[0] === 'capture_frame_unavailable',
  'an unexpected native metadata source must fail closed',
);

const unexpectedPhotoPixelClaimReport =
  evaluateMakeupFeedbackCaptureFrameMetadata({
    analyzerAvailable: true,
    captureFrameMetadata: {
      ...validCaptureFrameMetadata,
      photoPixelsAnalyzed: true,
    } as unknown as RealtimeCaptureFrameMetadata,
    guide,
    minimumSequence: 15,
  });
expect(
  !unexpectedPhotoPixelClaimReport.isCaptureEnabled &&
    unexpectedPhotoPixelClaimReport.failureReasons[0] ===
      'capture_frame_unavailable',
  'runtime metadata must preserve the explicit photoPixelsAnalyzed=false contract',
);

const staleNativeFrameReport = evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable: true,
  captureFrameMetadata: {
    ...validCaptureFrameMetadata,
    isStale: true,
  },
  guide,
  minimumSequence: 15,
});
expect(
  !staleNativeFrameReport.isCaptureEnabled &&
    staleNativeFrameReport.failureReasons[0] === 'frame_stale',
  'native isStale evidence must be checked before nested frame quality',
);

const nativeAgeBoundaryReport = evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable: true,
  captureFrameMetadata: {
    ...validCaptureFrameMetadata,
    frameAgeMsAtCaptureRequest: limits.maxCaptureFrameAgeMs,
  },
  guide,
  minimumSequence: 15,
});
expect(
  nativeAgeBoundaryReport.isCaptureEnabled,
  'native frame age exactly at 500ms must pass',
);

for (const invalidAge of [
  -1,
  limits.maxCaptureFrameAgeMs + 1,
  Number.NaN,
]) {
  const invalidNativeAgeReport =
    evaluateMakeupFeedbackCaptureFrameMetadata({
      analyzerAvailable: true,
      captureFrameMetadata: {
        ...validCaptureFrameMetadata,
        frameAgeMsAtCaptureRequest: invalidAge,
      },
      guide,
      minimumSequence: 15,
    });
  expect(
    !invalidNativeAgeReport.isCaptureEnabled &&
      invalidNativeAgeReport.failureReasons[0] === 'frame_stale',
    'invalid native frame age must fail closed: ' + String(invalidAge),
  );
}

const olderNativeSequenceReport = evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable: true,
  captureFrameMetadata: {
    ...validCaptureFrameMetadata,
    frame: makeFrame({sequence: 14}),
  },
  guide,
  minimumSequence: 15,
});
expect(
  !olderNativeSequenceReport.isCaptureEnabled &&
    olderNativeSequenceReport.failureReasons[0] === 'frame_stale',
  'native frame sequence older than the pre-shutter snapshot must block',
);

const failingNativeFrameReport = evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable: true,
  captureFrameMetadata: {
    ...validCaptureFrameMetadata,
    frame: makeFrame({
      imageQuality: {exposureMean: limits.minExposureMean - 1},
      sequence: 20,
    }),
  },
  guide,
  minimumSequence: 15,
});
expect(
  !failingNativeFrameReport.isCaptureEnabled &&
    failingNativeFrameReport.failureReasons.includes('underexposed'),
  'native request-time frame must independently pass instantaneous quality',
);

console.log('makeup feedback realtime quality tests passed');
