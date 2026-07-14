import {
  FACE_3D_SEMANTIC_CAPTURE_SHOT_KINDS,
  buildFace3DSemanticCaptureRequest,
  createFace3DSemanticCaptureSetId,
} from './face3DSemanticCaptureContract';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectThrows(callback: () => void, label: string) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(`${label}: expected callback to throw`);
}

const subjectOneSetId = createFace3DSemanticCaptureSetId(1000);
const subjectOneRequests = FACE_3D_SEMANTIC_CAPTURE_SHOT_KINDS.map(
  (captureShotKind, index) => buildFace3DSemanticCaptureRequest({
    captureSetId: subjectOneSetId,
    captureShotKind,
    now: 1001 + index,
  }),
);

expectEqual(new Set(subjectOneRequests.map(request => request.captureSetId)).size, 1, 'three poses share one subject capture set');
expectEqual(new Set(subjectOneRequests.map(request => request.capturePairId)).size, 3, 'three poses keep distinct capture pairs');
expectEqual(subjectOneRequests[0].captureShotKind, 'neutral', 'first shot is neutral');
expectEqual(subjectOneRequests[1].captureShotKind, 'yawLeft', 'second shot is yawLeft');
expectEqual(subjectOneRequests[2].captureShotKind, 'yawRight', 'third shot is yawRight');
expectEqual(subjectOneRequests[0].requestedBy, 'aura-face3d-lab', 'request owner');
expectEqual(subjectOneRequests[0].purpose, 'face3d_semantic_map_g1_overlay_review', 'request purpose');

const subjectTwoSetId = createFace3DSemanticCaptureSetId(2000);
expectEqual(subjectTwoSetId === subjectOneSetId, false, 'next subject gets a different capture set');

const defaultRequest = buildFace3DSemanticCaptureRequest({now: 3000});
expectEqual(defaultRequest.captureSetId, createFace3DSemanticCaptureSetId(3000), 'default request owns a deterministic set');
expectEqual(defaultRequest.captureShotKind, 'neutral', 'default shot is neutral');

expectThrows(
  () => buildFace3DSemanticCaptureRequest({captureSetId: '   ', now: 4000}),
  'blank capture set is rejected',
);
expectThrows(
  () => createFace3DSemanticCaptureSetId(Number.NaN),
  'invalid set timestamp is rejected',
);
