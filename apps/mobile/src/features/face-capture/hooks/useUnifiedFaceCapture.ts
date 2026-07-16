import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

import {
  addUnityUnifiedFaceCaptureEventListener,
  cancelUnityUnifiedFaceCapture,
  hideUnityMakeupView,
  prepareUnityUnifiedFaceCapture,
  setUnityMakeupPlayerPaused,
  setUnityMakeupSessionPaused,
  startUnityUnifiedFaceCapture,
} from '../../ar/services/unityMakeupBridge';
import type {
  UnifiedFaceCaptureBlockedEvent,
  UnifiedFaceCaptureCompletedEvent,
  UnifiedFaceCaptureGateEvent,
  UnifiedFaceCaptureRequest,
} from '../services/unifiedFaceCaptureContract';
import {isUnifiedFaceCaptureCompletionCompatible} from '../services/unifiedFaceCaptureContract';
import {UnifiedFaceCaptureDeferredCleanup} from '../services/unifiedFaceCaptureDeferredCleanup';
import {shouldFinalizeUnifiedCaptureForAppState} from '../services/unifiedFaceCaptureLifecycle';

const CAPTURE_RESULT_GRACE_MS = 13000;

export type UnifiedFaceCaptureHookState = {
  blocked: UnifiedFaceCaptureBlockedEvent | null;
  completed: UnifiedFaceCaptureCompletedEvent | null;
  error: string | null;
  gate: UnifiedFaceCaptureGateEvent | null;
  isCapturing: boolean;
  isPrepared: boolean;
};

export function useUnifiedFaceCapture(request: UnifiedFaceCaptureRequest) {
  const [state, setState] = useState<UnifiedFaceCaptureHookState>({
    blocked: null,
    completed: null,
    error: null,
    gate: null,
    isCapturing: false,
    isPrepared: false,
  });
  const captureStartingRef = useRef(false);
  const deferredCleanupRef = useRef(new UnifiedFaceCaptureDeferredCleanup());
  const finalizedRequestIdsRef = useRef(new Set<string>());
  const preparedRequestIdsRef = useRef(new Set<string>());
  const requestIdRef = useRef(request.requestId);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalizeRequest = useCallback(
    (requestId: string, reason: string, sendCancel: boolean): boolean => {
      if (finalizedRequestIdsRef.current.has(requestId)) {
        return false;
      }

      finalizedRequestIdsRef.current.add(requestId);
      if (sendCancel) {
        cancelUnityUnifiedFaceCapture(requestId, reason);
      }

      if (requestIdRef.current === requestId) {
        captureStartingRef.current = false;
        if (resultTimerRef.current) {
          clearTimeout(resultTimerRef.current);
          resultTimerRef.current = null;
        }
        // 캡처 결과를 RN 상태에 공개하기 전에 AR session과 player를 멈춰
        // 업로드·정지영상 분석 단계에 카메라 소유권을 넘긴다.
        setUnityMakeupSessionPaused(true);
        hideUnityMakeupView();
        setUnityMakeupPlayerPaused(true);
      }

      return true;
    },
    [],
  );

  useEffect(() => {
    deferredCleanupRef.current.resume(request.requestId);
    requestIdRef.current = request.requestId;
    captureStartingRef.current = false;
    setState({
      blocked: null,
      completed: null,
      error: null,
      gate: null,
      isCapturing: false,
      isPrepared: false,
    });
    setUnityMakeupPlayerPaused(false);
    setUnityMakeupSessionPaused(false);
    let receivedGate = false;

    const subscription = addUnityUnifiedFaceCaptureEventListener(event => {
      if (
        event.requestId !== request.requestId ||
        finalizedRequestIdsRef.current.has(event.requestId)
      ) {
        return;
      }

      if (event.type === 'unified_face_capture_gate') {
        receivedGate = true;
        setState(current => ({...current, gate: event, isPrepared: true}));
        return;
      }

      if (event.type === 'unified_face_capture_completed') {
        if (!isUnifiedFaceCaptureCompletionCompatible(event, request)) {
          finalizeRequest(
            request.requestId,
            'unified_capture_contract_mismatch',
            true,
          );
          setState(current => ({
            ...current,
            error: 'unified_capture_contract_mismatch',
            isCapturing: false,
          }));
          return;
        }

        finalizeRequest(request.requestId, 'completed', false);
        setState(current => ({
          ...current,
          completed: event,
          isCapturing: false,
          isPrepared: true,
        }));
        return;
      }

      if (event.type === 'unified_face_capture_blocked') {
        finalizeRequest(request.requestId, event.reason, false);
        setState(current => ({
          ...current,
          blocked: event,
          isCapturing: false,
        }));
        return;
      }

      finalizeRequest(request.requestId, event.reason ?? 'cancelled', false);
      setState(current => ({
        ...current,
        error: event.reason ?? 'unified_capture_cancelled',
        isCapturing: false,
      }));
    });

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (
        !shouldFinalizeUnifiedCaptureForAppState(nextState) ||
        finalizedRequestIdsRef.current.has(request.requestId)
      ) {
        return;
      }

      finalizeRequest(request.requestId, 'app_inactive', true);
      setState(current => ({
        ...current,
        error: 'unified_capture_app_inactive',
        isCapturing: false,
      }));
    });

    const prepared = preparedRequestIdsRef.current.has(request.requestId)
      ? true
      : prepareUnityUnifiedFaceCapture(request);
    if (prepared) {
      preparedRequestIdsRef.current.add(request.requestId);
    }
    if (!prepared) {
      setState(current => ({
        ...current,
        error: 'unified_capture_unavailable',
      }));
    }

    const preparationTimer = setTimeout(() => {
      if (
        receivedGate ||
        finalizedRequestIdsRef.current.has(request.requestId)
      ) {
        return;
      }

      finalizeRequest(request.requestId, 'unified_capture_prepare_timeout', true);
      setState(current => ({
        ...current,
        error: 'unified_capture_prepare_timeout',
        isCapturing: false,
      }));
    }, 10000);

    return () => {
      clearTimeout(preparationTimer);
      if (resultTimerRef.current) {
        clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }
      appStateSubscription.remove();
      subscription.remove();
      deferredCleanupRef.current.schedule(request.requestId, () => {
        finalizeRequest(request.requestId, 'screen_unmounted', true);
      });
    };
  }, [finalizeRequest, request]);

  const capture = useCallback(() => {
    if (
      finalizedRequestIdsRef.current.has(request.requestId) ||
      captureStartingRef.current ||
      state.isCapturing ||
      !state.gate?.finalCaptureGreenlight
    ) {
      return false;
    }

    captureStartingRef.current = true;
    const started = startUnityUnifiedFaceCapture(request);
    if (!started) {
      captureStartingRef.current = false;
      setState(current => ({...current, error: 'unified_capture_start_failed'}));
      return false;
    }

    setState(current => ({
      ...current,
      blocked: null,
      error: null,
      isCapturing: true,
    }));
    resultTimerRef.current = setTimeout(() => {
      resultTimerRef.current = null;
      if (
        !finalizeRequest(
          request.requestId,
          'unified_capture_result_timeout',
          true,
        )
      ) {
        return;
      }

      setState(current => ({
        ...current,
        error: 'unified_capture_result_timeout',
        isCapturing: false,
      }));
    }, request.maximumDurationMs + CAPTURE_RESULT_GRACE_MS);
    return true;
  }, [
    finalizeRequest,
    request,
    state.gate?.finalCaptureGreenlight,
    state.isCapturing,
  ]);

  const cancel = useCallback(
    (reason = 'user_cancelled') =>
      finalizeRequest(requestIdRef.current, reason, true),
    [finalizeRequest],
  );

  return {...state, cancel, capture};
}
