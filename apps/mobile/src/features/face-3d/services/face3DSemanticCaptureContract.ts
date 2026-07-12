import type {UnitySynchronizedCaptureRequest} from '../../../shared/contracts/fullFaceMakeupCapture';

export const FACE_3D_SEMANTIC_CAPTURE_SHOT_KINDS = [
  'neutral',
  'yawLeft',
  'yawRight',
] as const;

export type Face3DSemanticCaptureShotKind =
  (typeof FACE_3D_SEMANTIC_CAPTURE_SHOT_KINDS)[number];

export function createFace3DSemanticCaptureSetId(now = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('Face3D semantic capture set timestamp must be a non-negative safe integer.');
  }
  return `face3d-semantic-subject-${now}`;
}

export function buildFace3DSemanticCaptureRequest({
  captureSetId,
  captureShotKind = 'neutral',
  now = Date.now(),
}: {
  captureSetId?: string;
  captureShotKind?: Face3DSemanticCaptureShotKind;
  now?: number;
} = {}): UnitySynchronizedCaptureRequest {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('Face3D semantic capture timestamp must be a non-negative safe integer.');
  }

  const resolvedCaptureSetId = captureSetId ?? createFace3DSemanticCaptureSetId(now);
  if (resolvedCaptureSetId.trim().length === 0) {
    throw new Error('Face3D semantic captureSetId must not be empty.');
  }

  return {
    capturePairId: `pair_face3d_semantic_${now}`,
    captureSetId: resolvedCaptureSetId,
    captureShotKind,
    purpose: 'face3d_semantic_map_g1_overlay_review',
    requestedAtMs: now,
    requestedBy: 'aura-face3d-lab',
  };
}
