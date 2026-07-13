import {useCallback, useEffect, useReducer, useRef} from 'react';

import type {Face3DAnalysisState, Face3DEvent} from '../types';
import {
  addFace3DEventListener,
  isFace3DRuntimeReady,
  postFace3DCancelRequest,
  postFace3DStartRequest,
  prepareFace3DRuntime,
} from '../services/face3DBridge';
import {buildFace3DStartRequest} from '../services/face3DContract';
import {appendFace3DRuntimeEvidence} from '../services/face3DRuntimeEvidenceLogger';
import {
  INITIAL_FACE_3D_ANALYSIS_STATE,
  isFace3DSessionActive,
  reduceFace3DAnalysisState,
} from '../services/face3DState';

const RUNTIME_READY_TIMEOUT_MS = 4500;
const RUNTIME_READY_POLL_MS = 120;
// maximumDurationMs는 유효 프레임 수집 창이다. Unity 쪽은 pose gate 진입에 최대
// 12초(AcquisitionTimeoutSeconds)를 준 뒤에야 수집을 시작할 수 있으므로, RN 타임아웃은
// 12초 + 수집 창(maximumDurationMs)보다 길어야 수집 도중 끊기지 않는다.
const RESULT_GRACE_MS = 13000;

type UseFace3DAnalysisResult = {
  cancel: () => void;
  isActive: boolean;
  start: () => void;
  state: Face3DAnalysisState;
};

export function useFace3DAnalysis(): UseFace3DAnalysisResult {
  const [state, dispatch] = useReducer(
    reduceFace3DAnalysisState,
    INITIAL_FACE_3D_ANALYSIS_STATE,
  );
  const activeRequestIdRef = useRef<string | null>(null);
  const readinessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (readinessTimerRef.current) {
      clearTimeout(readinessTimerRef.current);
      readinessTimerRef.current = null;
    }
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    clearTimers();

    if (requestId) {
      postFace3DCancelRequest(requestId);
    }

    activeRequestIdRef.current = null;
    dispatch({type: 'cancelled'});
  }, [clearTimers]);

  useEffect(() => {
    const handleEvent = (event: Face3DEvent) => {
      if (event.requestId !== activeRequestIdRef.current) {
        return;
      }

      void appendFace3DRuntimeEvidence(event);

      if (event.type === 'face3d_status') {
        console.info('[aura:face3d] status', {
          currentMaximumFaceCount: event.currentMaximumFaceCount,
          meshIndexCount: event.meshIndexCount,
          meshUvCount: event.meshUvCount,
          meshVertexCount: event.meshVertexCount,
          message: event.message,
          requestId: event.requestId,
          status: event.status,
          supportedFaceCount: event.supportedFaceCount,
          targetFrameCount: event.targetFrameCount,
          topologyFingerprint: event.topologyFingerprint,
          validFrameCount: event.validFrameCount,
          warnings: event.warnings,
        });
      } else {
        console.info('[aura:face3d] analyzed', {
          metrics: Object.fromEntries(
            Object.entries(event.profile.metrics).map(([key, metric]) => [
              key,
              {
                confidence: metric.confidence,
                mad: metric.mad,
                validFrameCount: metric.validFrameCount,
                value: metric.value,
              },
            ]),
          ),
          requestId: event.requestId,
          targetFrameCount: event.profile.targetFrameCount,
          topologyFingerprint: event.profile.topologyFingerprint,
          validFrameCount: event.profile.validFrameCount,
          warnings: event.profile.warnings,
        });
      }

      if (
        event.type === 'face3d_analyzed' ||
        (event.type === 'face3d_status' &&
          (event.status === 'blocked' || event.status === 'error' || event.status === 'idle'))
      ) {
        clearTimers();
        activeRequestIdRef.current = null;
      }

      dispatch({event, type: 'event_received'});
    };

    const subscription = addFace3DEventListener(handleEvent);

    return () => {
      subscription.remove();
      clearTimers();

      if (activeRequestIdRef.current) {
        postFace3DCancelRequest(activeRequestIdRef.current);
        activeRequestIdRef.current = null;
      }
    };
  }, [clearTimers]);

  const start = useCallback(() => {
    const previousRequestId = activeRequestIdRef.current;
    clearTimers();

    if (previousRequestId) {
      postFace3DCancelRequest(previousRequestId);
    }

    const request = buildFace3DStartRequest();
    activeRequestIdRef.current = request.requestId;
    dispatch({request, type: 'start_requested'});

    const preparation = prepareFace3DRuntime();

    if (!preparation.ok) {
      activeRequestIdRef.current = null;
      dispatch({message: preparation.message, status: 'blocked', type: 'command_failed'});
      return;
    }

    const readinessDeadline = Date.now() + RUNTIME_READY_TIMEOUT_MS;

    const postWhenReady = () => {
      if (activeRequestIdRef.current !== request.requestId) {
        return;
      }

      if (!isFace3DRuntimeReady()) {
        if (Date.now() >= readinessDeadline) {
          activeRequestIdRef.current = null;
          dispatch({
            message: 'Unity 카메라 준비 시간이 초과되었습니다. 앱을 다시 빌드하거나 재시도해 주세요.',
            status: 'blocked',
            type: 'command_failed',
          });
          return;
        }

        readinessTimerRef.current = setTimeout(postWhenReady, RUNTIME_READY_POLL_MS);
        return;
      }

      readinessTimerRef.current = null;
      const result = postFace3DStartRequest(request);

      if (!result.ok) {
        activeRequestIdRef.current = null;
        dispatch({message: result.message, status: 'blocked', type: 'command_failed'});
        return;
      }

      dispatch({type: 'command_sent'});
      resultTimerRef.current = setTimeout(() => {
        if (activeRequestIdRef.current === request.requestId) {
          postFace3DCancelRequest(request.requestId);
          activeRequestIdRef.current = null;
          dispatch({type: 'timed_out'});
        }
      }, request.maximumDurationMs + RESULT_GRACE_MS);
    };

    postWhenReady();
  }, [clearTimers]);

  return {
    cancel,
    isActive: isFace3DSessionActive(state.status),
    start,
    state,
  };
}
