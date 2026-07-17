import type {UnifiedFaceCaptureCompletedEvent} from '../../face-capture/services/unifiedFaceCaptureContract';
import type {Face3DAnalyzedEvent, Face3DEvent} from '../types';

export type Face3DRuntimeEvidenceInput =
  | Face3DEvent
  | Pick<
      UnifiedFaceCaptureCompletedEvent,
      'captureId' | 'face3d' | 'requestId' | 'type'
    >;

export type AdaptedFace3DRuntimeEvidence = {
  event: Face3DEvent;
  unifiedCapture?: {
    captureId: string;
    sourceEventType: 'unified_face_capture_completed';
  };
};

export function adaptFace3DRuntimeEvidence(
  input: Face3DRuntimeEvidenceInput,
): AdaptedFace3DRuntimeEvidence {
  if (input.type !== 'unified_face_capture_completed') {
    return {event: input};
  }

  const event: Face3DAnalyzedEvent = {
    profile: input.face3d,
    requestId: input.requestId,
    type: 'face3d_analyzed',
  };

  return {
    event,
    unifiedCapture: {
      captureId: input.captureId,
      sourceEventType: input.type,
    },
  };
}
