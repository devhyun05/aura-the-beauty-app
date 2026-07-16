import type {UnifiedFaceCaptureCompletedEvent} from './unifiedFaceCaptureContract';
import type {FaceCaptureUploadResult} from './faceCaptureUploadService';

export type UnifiedFaceCaptureCommit = {
  result: UnifiedFaceCaptureCompletedEvent;
  upload: FaceCaptureUploadResult;
};

export type UnifiedFaceCaptureFlowState = {
  activeRequestId: string | null;
  committedCapture: UnifiedFaceCaptureCommit | null;
  revision: number;
  retryAttemptCount: 0 | 1;
};

export type InvalidateUnifiedFaceCaptureOptions = {
  incrementRetryAttempt?: boolean;
  resetRetryAttempt?: boolean;
};

export const INITIAL_UNIFIED_FACE_CAPTURE_FLOW_STATE: UnifiedFaceCaptureFlowState = {
  activeRequestId: null,
  committedCapture: null,
  revision: 0,
  retryAttemptCount: 0,
};

export function beginUnifiedFaceCapture(
  state: UnifiedFaceCaptureFlowState,
  requestId: string,
): UnifiedFaceCaptureFlowState {
  if (!requestId.trim()) {
    throw new Error('Unified capture requestId must not be empty.');
  }

  return {
    activeRequestId: requestId.trim(),
    committedCapture: null,
    revision: state.revision + 1,
    retryAttemptCount: state.retryAttemptCount,
  };
}

export function invalidateUnifiedFaceCapture(
  state: UnifiedFaceCaptureFlowState,
  {
    incrementRetryAttempt = false,
    resetRetryAttempt = false,
  }: InvalidateUnifiedFaceCaptureOptions = {},
): UnifiedFaceCaptureFlowState {
  if (incrementRetryAttempt && resetRetryAttempt) {
    throw new Error(
      'Unified capture retry attempt cannot be incremented and reset together.',
    );
  }

  return {
    activeRequestId: null,
    committedCapture: null,
    revision: state.revision + 1,
    retryAttemptCount: resetRetryAttempt
      ? 0
      : incrementRetryAttempt
        ? 1
        : state.retryAttemptCount,
  };
}

export function commitUnifiedFaceCapture(
  state: UnifiedFaceCaptureFlowState,
  capture: UnifiedFaceCaptureCommit,
): {accepted: boolean; state: UnifiedFaceCaptureFlowState} {
  if (
    state.activeRequestId === null ||
    capture.result.requestId !== state.activeRequestId ||
    capture.result.hairline.retryRecommendation.attemptCount !==
      state.retryAttemptCount ||
    capture.upload.imageUri !== capture.result.image.uri ||
    capture.upload.source !== 'camera' ||
    state.committedCapture !== null
  ) {
    return {accepted: false, state};
  }

  return {
    accepted: true,
    state: {
      activeRequestId: null,
      committedCapture: capture,
      revision: state.revision + 1,
      retryAttemptCount: state.retryAttemptCount,
    },
  };
}
