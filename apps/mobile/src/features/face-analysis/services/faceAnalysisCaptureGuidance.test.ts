import {
  FACE_ANALYSIS_CAPTURE_PLAN,
  FACE_3D_PREFLIGHT_COPY,
  getFace3DFailureAction,
  getFace3DRemainingSeconds,
  getFace3DStatusCopy,
  shouldStartFace3DMeasurement,
} from './faceAnalysisCaptureGuidance';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expect(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label);
  }
}

expectEqual(FACE_ANALYSIS_CAPTURE_PLAN.length, 2, 'two camera stages');
expectEqual(FACE_ANALYSIS_CAPTURE_PLAN[0].title, '정면 사진 촬영', 'S1 title');
expectEqual(FACE_ANALYSIS_CAPTURE_PLAN[1].title, '3D 얼굴 측정', '3D title');
expect(
  FACE_3D_PREFLIGHT_COPY.description.includes('약 3초'),
  '3D preflight discloses the hold duration',
);
expectEqual(getFace3DRemainingSeconds(0, 30), 3, 'initial remaining seconds');
expectEqual(getFace3DRemainingSeconds(10, 30), 2, 'middle remaining seconds');
expectEqual(getFace3DRemainingSeconds(20, 30), 1, 'late remaining seconds');
expectEqual(getFace3DRemainingSeconds(30, 30), 0, 'completed remaining seconds');
expectEqual(getFace3DRemainingSeconds(0, 0), 3, 'unknown target fallback');
expectEqual(
  getFace3DStatusCopy('blocked'),
  '3D 측정을 완료하지 못했어요.',
  'safe blocked copy',
);
expectEqual(
  getFace3DStatusCopy('collecting'),
  '좋아요. 표정과 고개를 그대로 유지해 주세요.',
  'actionable collecting copy',
);
expectEqual(getFace3DFailureAction(1), 'retry', 'first failure retries');
expectEqual(getFace3DFailureAction(2), 'review', 'second failure reviews guidance');
expectEqual(getFace3DFailureAction(3), 'review', 'later failures keep guidance review');
expectEqual(
  shouldStartFace3DMeasurement({
    attemptCount: 0,
    instructionsAccepted: false,
    nativeViewReady: true,
  }),
  false,
  'instructions gate measurement start',
);
expectEqual(
  shouldStartFace3DMeasurement({
    attemptCount: 0,
    instructionsAccepted: true,
    nativeViewReady: true,
  }),
  true,
  'accepted ready measurement starts',
);
expectEqual(
  shouldStartFace3DMeasurement({
    attemptCount: 1,
    instructionsAccepted: true,
    nativeViewReady: true,
  }),
  false,
  'existing attempt does not auto-start twice',
);
