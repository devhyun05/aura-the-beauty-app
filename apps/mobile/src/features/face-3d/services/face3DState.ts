import type {
  Face3DAnalysisState,
  Face3DEvent,
  Face3DStartRequest,
  Face3DStatus,
} from '../types';

export const INITIAL_FACE_3D_ANALYSIS_STATE: Face3DAnalysisState = {
  profile: null,
  requestId: null,
  status: 'idle',
  targetFrameCount: 0,
  validFrameCount: 0,
  warnings: [],
};

export type Face3DAnalysisAction =
  | {request: Face3DStartRequest; type: 'start_requested'}
  | {type: 'command_sent'}
  | {event: Face3DEvent; type: 'event_received'}
  | {message: string; status: 'blocked' | 'error'; type: 'command_failed'}
  | {type: 'cancelled'}
  | {type: 'timed_out'};

function mergeWarnings(current: string[], incoming: string[]): string[] {
  return Array.from(new Set([...current, ...incoming]));
}

export function isFace3DSessionActive(status: Face3DStatus): boolean {
  return status === 'preparing' || status === 'tracking' || status === 'collecting';
}

export function reduceFace3DAnalysisState(
  state: Face3DAnalysisState,
  action: Face3DAnalysisAction,
): Face3DAnalysisState {
  switch (action.type) {
    case 'start_requested':
      return {
        message: 'ARKit 얼굴 메시 세션을 준비하고 있습니다.',
        profile: null,
        requestId: action.request.requestId,
        status: 'preparing',
        targetFrameCount: action.request.targetValidFrames,
        validFrameCount: 0,
        warnings: [],
      };
    case 'command_sent':
      return state.status === 'preparing'
        ? {...state, message: '얼굴 추적 응답을 기다리고 있습니다.'}
        : state;
    case 'event_received': {
      const {event} = action;

      if (!state.requestId || event.requestId !== state.requestId) {
        return state;
      }

      if (event.type === 'face3d_analyzed') {
        return {
          ...state,
          message: '3D 얼굴 특성 추출이 완료되었습니다.',
          profile: event.profile,
          requestId: state.requestId,
          status: 'completed',
          targetFrameCount: event.profile.targetFrameCount,
          topologyFingerprint: event.profile.topologyFingerprint,
          validFrameCount: event.profile.validFrameCount,
          warnings: mergeWarnings(state.warnings, event.profile.warnings),
        };
      }

      if (event.status === 'idle') {
        return INITIAL_FACE_3D_ANALYSIS_STATE;
      }

      return {
        ...state,
        currentMaximumFaceCount:
          event.currentMaximumFaceCount ?? state.currentMaximumFaceCount,
        message: event.message ?? state.message,
        meshIndexCount: event.meshIndexCount ?? state.meshIndexCount,
        meshUvCount: event.meshUvCount ?? state.meshUvCount,
        meshVertexCount: event.meshVertexCount ?? state.meshVertexCount,
        status: event.status,
        supportedFaceCount: event.supportedFaceCount ?? state.supportedFaceCount,
        targetFrameCount: event.targetFrameCount || state.targetFrameCount,
        topologyFingerprint:
          event.topologyFingerprint ?? state.topologyFingerprint,
        validFrameCount: event.validFrameCount,
        warnings: mergeWarnings(state.warnings, event.warnings),
      };
    }
    case 'command_failed':
      return {
        ...state,
        message: action.message,
        status: action.status,
      };
    case 'timed_out':
      return {
        ...state,
        message: '제한 시간 안에 분석 결과를 받지 못했습니다. 얼굴을 정면에 맞춘 뒤 다시 시도해 주세요.',
        status: 'error',
      };
    case 'cancelled':
      return INITIAL_FACE_3D_ANALYSIS_STATE;
  }
}
