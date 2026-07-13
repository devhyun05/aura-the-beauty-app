import {
  getFaceCaptureConfirmationCopy,
  getFaceCaptureConfirmationNextRouteName,
  getFaceCaptureConfirmationRetakeRoute,
} from './faceCaptureConfirmationRoutes';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const faceAnalysisCopy = getFaceCaptureConfirmationCopy('faceAnalysis');
const makeupFeedbackCopy = getFaceCaptureConfirmationCopy('makeupFeedback');
const referenceExtractionCopy = getFaceCaptureConfirmationCopy('referenceMakeupExtraction');

expectEqual(
  faceAnalysisCopy.title,
  '이 사진으로 얼굴 분석을 시작할까요?',
  'face analysis confirmation title',
);
expectEqual(
  makeupFeedbackCopy.confirmLabel,
  '메이크업 피드백 시작',
  'makeup feedback confirmation label',
);
expectEqual(
  referenceExtractionCopy.description,
  '메이크업 추출에 사용할 사진을 확인해 주세요.',
  'reference extraction confirmation description',
);
expectEqual(
  getFaceCaptureConfirmationNextRouteName('faceAnalysis'),
  'Face3DMeasurement',
  'face analysis confirmation next route',
);
expectEqual(
  getFaceCaptureConfirmationNextRouteName('makeupFeedback'),
  'MakeupFeedbackGoalInput',
  'makeup feedback confirmation next route',
);
expectEqual(
  getFaceCaptureConfirmationNextRouteName('referenceMakeupExtraction'),
  'ReferenceMakeupExtractionLoading',
  'reference extraction confirmation next route',
);
expectEqual(
  getFaceCaptureConfirmationRetakeRoute({
    source: 'gallery',
    target: 'faceAnalysis',
  }).name,
  'FaceCapture',
  'face analysis retake route',
);
expectEqual(
  getFaceCaptureConfirmationRetakeRoute({
    source: 'gallery',
    target: 'faceAnalysis',
  }).params?.initialSource,
  'gallery',
  'face analysis gallery retake source',
);
expectEqual(
  getFaceCaptureConfirmationRetakeRoute({
    source: 'gallery',
    target: 'makeupFeedback',
  }).name,
  'MakeupFeedbackAlbumUpload',
  'makeup feedback gallery retake route',
);
expectEqual(
  getFaceCaptureConfirmationRetakeRoute({
    source: 'camera',
    target: 'referenceMakeupExtraction',
  }).params?.initialSource,
  'camera',
  'reference extraction camera retake source',
);
