import type {UnifiedFaceCaptureCompletedEvent} from './unifiedFaceCaptureContract';
import type {FaceCaptureUploadResult} from './faceCaptureUploadService';
import {
  beginUnifiedFaceCapture,
  commitUnifiedFaceCapture,
  INITIAL_UNIFIED_FACE_CAPTURE_FLOW_STATE,
  invalidateUnifiedFaceCapture,
} from './unifiedFaceCaptureFlowState';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const capture: {
  result: UnifiedFaceCaptureCompletedEvent;
  upload: FaceCaptureUploadResult;
} = {
  result: {
    hairline: {
      analysisEligible: false,
      confidence: null,
      outcome: 'omitted',
      provider: 'none',
      retryRecommendation: {attemptCount: 0, recommended: false},
    },
    image: {uri: 'file:///tmp/unified.jpg'},
    requestId: 'request-new',
    type: 'unified_face_capture_completed',
  } as UnifiedFaceCaptureCompletedEvent,
  upload: {
    bucket: 'local-test',
    imageUri: 'file:///tmp/unified.jpg',
    mediaId: 'media-new',
    objectKey: 'file:///tmp/unified.jpg',
    photoCaptureId: 'capture-new',
    source: 'camera',
  },
};

let state = beginUnifiedFaceCapture(
  INITIAL_UNIFIED_FACE_CAPTURE_FLOW_STATE,
  'request-old',
);
state = beginUnifiedFaceCapture(state, 'request-new');

const stale = commitUnifiedFaceCapture(state, {
  ...capture,
  result: {...capture.result, requestId: 'request-old'},
});
expectEqual(stale.accepted, false, 'stale completion rejected');
expectEqual(stale.state, state, 'stale completion cannot mutate state');

const committed = commitUnifiedFaceCapture(state, capture);
expectEqual(committed.accepted, true, 'active completion accepted');
expectEqual(
  committed.state.committedCapture?.result.requestId,
  'request-new',
  'capture committed atomically',
);
expectEqual(committed.state.activeRequestId, null, 'active request cleared on commit');

const duplicate = commitUnifiedFaceCapture(committed.state, capture);
expectEqual(duplicate.accepted, false, 'duplicate completion rejected');

const mismatchedUpload = commitUnifiedFaceCapture(state, {
  ...capture,
  upload: {
    ...capture.upload,
    imageUri: 'file:///tmp/other.jpg',
  },
});
expectEqual(
  mismatchedUpload.accepted,
  false,
  'upload from another local image cannot enter the atomic bundle',
);

const invalidated = invalidateUnifiedFaceCapture(
  beginUnifiedFaceCapture(committed.state, 'request-retake'),
  {incrementRetryAttempt: true},
);
expectEqual(invalidated.activeRequestId, null, 'retake invalidates active request');
expectEqual(invalidated.committedCapture, null, 'retake clears committed capture');
expectEqual(invalidated.retryAttemptCount, 1, 'first retake increments recommendation attempt');
expectEqual(
  invalidateUnifiedFaceCapture(invalidated, {incrementRetryAttempt: true})
    .retryAttemptCount,
  1,
  'additional recommended retakes do not exceed the recommendation cap',
);

const manualRetake = invalidateUnifiedFaceCapture(
  beginUnifiedFaceCapture(invalidated, 'request-manual-retake'),
);
expectEqual(
  manualRetake.retryAttemptCount,
  1,
  'manual retake preserves the recommendation attempt cap',
);
expectEqual(
  beginUnifiedFaceCapture(manualRetake, 'request-after-manual-retake')
    .retryAttemptCount,
  1,
  'the retry attempt remains monotonic across the current flow',
);

const cancelled = invalidateUnifiedFaceCapture(manualRetake, {
  resetRetryAttempt: true,
});
expectEqual(
  cancelled.retryAttemptCount,
  0,
  'ending the capture flow resets the retry attempt',
);

let conflictingOptionsRejected = false;
try {
  invalidateUnifiedFaceCapture(manualRetake, {
    incrementRetryAttempt: true,
    resetRetryAttempt: true,
  });
} catch {
  conflictingOptionsRejected = true;
}
expectEqual(
  conflictingOptionsRejected,
  true,
  'increment and reset cannot be requested together',
);
