import {useCallback, useEffect, useRef, useState} from 'react';

import type {
  UnitySynchronizedCaptureEvent,
  UnitySynchronizedCaptureRequest,
} from '../../../shared/contracts/fullFaceMakeupCapture';
import {
  addUnityMakeupEventListener,
  postUnitySynchronizedCaptureRequest,
} from '../../ar/services/unityMakeupBridge';
import {
  isFace3DRuntimeReady,
  prepareFace3DRuntime,
} from '../services/face3DBridge';
import {
  buildFace3DSemanticCaptureRequest,
  type Face3DSemanticCaptureShotKind,
} from '../services/face3DSemanticCaptureContract';

export type {Face3DSemanticCaptureShotKind} from '../services/face3DSemanticCaptureContract';

const READY_TIMEOUT_MS = 15000;
const READY_POLL_MS = 120;
const CAPTURE_TIMEOUT_MS = 12000;

export type Face3DSemanticCaptureState = {
  capturePairId?: string;
  captureSetId?: string;
  captureShotKind?: Face3DSemanticCaptureShotKind;
  detail?: string;
  framePreviewUri?: string;
  meshIndexCount?: number;
  meshUvCount?: number;
  meshVertexCount?: number;
  relativeDirectory?: string;
  status: 'idle' | 'preparing' | 'capturing' | 'exported' | 'error';
};

type UseFace3DSemanticCaptureResult = {
  reset: () => void;
  start: (
    captureShotKind?: Face3DSemanticCaptureShotKind,
    captureSetId?: string,
  ) => void;
  state: Face3DSemanticCaptureState;
};

function parseCaptureEvent(message: string): UnitySynchronizedCaptureEvent | null {
  try {
    const payload = JSON.parse(message) as Partial<UnitySynchronizedCaptureEvent>;
    if (payload.type !== 'e7_reference_capture' || typeof payload.capturePairId !== 'string') {
      return null;
    }
    return payload as UnitySynchronizedCaptureEvent;
  } catch {
    return null;
  }
}

export function useFace3DSemanticCapture(): UseFace3DSemanticCaptureResult {
  const [state, setState] = useState<Face3DSemanticCaptureState>({status: 'idle'});
  const activeRequestRef = useRef<UnitySynchronizedCaptureRequest | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const subscription = addUnityMakeupEventListener(event => {
      const parsed = parseCaptureEvent(event.message ?? '');
      const activeRequest = activeRequestRef.current;
      if (!parsed || !activeRequest || parsed.capturePairId !== activeRequest.capturePairId) {
        return;
      }

      console.info('[aura:face3d-semantic] capture-event', {
        capturePairId: parsed.capturePairId,
        detail: parsed.detail,
        meshIndexCount: parsed.meshIndexCount,
        meshUvCount: parsed.meshUvCount,
        meshVertexCount: parsed.meshVertexCount,
        relativeDirectory: parsed.relativeDirectory,
        status: parsed.status,
      });

      if (parsed.status === 'requested') {
        setState(previous => ({...previous, detail: parsed.detail, status: 'capturing'}));
        return;
      }
      if (parsed.status === 'exported') {
        clearTimers();
        activeRequestRef.current = null;
        setState({
          capturePairId: parsed.capturePairId,
          captureSetId: activeRequest.captureSetId,
          captureShotKind: activeRequest.captureShotKind as Face3DSemanticCaptureShotKind,
          detail: parsed.detail,
          framePreviewUri: parsed.framePreviewUri,
          meshIndexCount: parsed.meshIndexCount,
          meshUvCount: parsed.meshUvCount,
          meshVertexCount: parsed.meshVertexCount,
          relativeDirectory: parsed.relativeDirectory,
          status: 'exported',
        });
        return;
      }
      if (parsed.status === 'failed' || parsed.status === 'busy') {
        clearTimers();
        activeRequestRef.current = null;
        setState({
          capturePairId: parsed.capturePairId,
          captureShotKind: activeRequest.captureShotKind as Face3DSemanticCaptureShotKind,
          detail: parsed.detail ?? 'ARKit 메시 캡처에 실패했습니다.',
          status: 'error',
        });
      }
    });

    return () => {
      subscription.remove();
      activeRequestRef.current = null;
      clearTimers();
    };
  }, [clearTimers]);

  const reset = useCallback(() => {
    activeRequestRef.current = null;
    clearTimers();
    setState({status: 'idle'});
  }, [clearTimers]);

  const start = useCallback((
    captureShotKind: Face3DSemanticCaptureShotKind = 'neutral',
    captureSetId?: string,
  ) => {
    clearTimers();
    const request = buildFace3DSemanticCaptureRequest({
      captureSetId,
      captureShotKind,
      now: Date.now(),
    });
    activeRequestRef.current = request;
    setState({
      capturePairId: request.capturePairId,
      captureSetId: request.captureSetId,
      captureShotKind,
      status: 'preparing',
    });
    console.info('[aura:face3d-semantic] prepare-start', {
      capturePairId: request.capturePairId,
      readyTimeoutMs: READY_TIMEOUT_MS,
    });

    const preparation = prepareFace3DRuntime();
    if (!preparation.ok) {
      console.warn('[aura:face3d-semantic] prepare-failed', {
        capturePairId: request.capturePairId,
        message: preparation.message,
      });
      activeRequestRef.current = null;
      setState({detail: preparation.message, status: 'error'});
      return;
    }

    const deadline = Date.now() + READY_TIMEOUT_MS;
    const postWhenReady = () => {
      if (activeRequestRef.current?.capturePairId !== request.capturePairId) {
        return;
      }
      if (!isFace3DRuntimeReady()) {
        if (Date.now() >= deadline) {
          console.warn('[aura:face3d-semantic] ready-timeout', {
            capturePairId: request.capturePairId,
          });
          activeRequestRef.current = null;
          setState({detail: 'Unity ARKit 카메라 준비 시간이 초과되었습니다.', status: 'error'});
          return;
        }
        pollTimerRef.current = setTimeout(postWhenReady, READY_POLL_MS);
        return;
      }

      pollTimerRef.current = null;
      if (!postUnitySynchronizedCaptureRequest(request)) {
        console.warn('[aura:face3d-semantic] dispatch-failed', {
          capturePairId: request.capturePairId,
        });
        activeRequestRef.current = null;
        setState({detail: '메시 캡처 명령을 Unity로 보낼 수 없습니다.', status: 'error'});
        return;
      }

      console.info('[aura:face3d-semantic] capture-dispatched', {
        capturePairId: request.capturePairId,
      });

      setState(previous => ({...previous, status: 'capturing'}));
      resultTimerRef.current = setTimeout(() => {
        if (activeRequestRef.current?.capturePairId === request.capturePairId) {
          console.warn('[aura:face3d-semantic] result-timeout', {
            capturePairId: request.capturePairId,
          });
          activeRequestRef.current = null;
          setState({detail: 'ARKit 메시 내보내기 응답 시간이 초과되었습니다.', status: 'error'});
        }
      }, CAPTURE_TIMEOUT_MS);
    };

    postWhenReady();
  }, [clearTimers]);

  return {reset, start, state};
}
