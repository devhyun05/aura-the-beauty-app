import {
  getFaceAnalysisConfirmationDestination,
  getUnifiedHairlineConfirmationNotice,
  mapUnifiedHairlineToVerticalThirds,
  shouldUseUnifiedFaceCaptureRoute,
} from './unifiedFaceCaptureNavigation';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: true,
    forceLegacyCapture: false,
    nativeViewSupported: true,
  }),
  true,
  'camera route enables unified capture',
);
expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: false,
    forceLegacyCapture: false,
    nativeViewSupported: true,
  }),
  false,
  'feature flag off preserves legacy route',
);
expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: true,
    forceLegacyCapture: false,
    initialSource: 'gallery',
    nativeViewSupported: true,
  }),
  false,
  'gallery never mounts unified camera',
);
expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: true,
    forceLegacyCapture: true,
    nativeViewSupported: true,
  }),
  false,
  'fallback forces legacy route',
);
expectEqual(
  getFaceAnalysisConfirmationDestination(true),
  'FaceAnalysisLoading',
  'unified confirmation skips legacy Face3D',
);
expectEqual(
  getFaceAnalysisConfirmationDestination(false),
  'Face3DMeasurement',
  'legacy confirmation keeps 30-frame Face3D',
);
expectEqual(
  getUnifiedHairlineConfirmationNotice({
    analysisEligible: false,
    confidence: null,
    outcome: 'omitted',
    provider: 'none',
    retryRecommendation: {
      attemptCount: 0,
      reason: 'hairline_occluded',
      recommended: true,
    },
  }),
  '헤어라인을 충분히 확인하지 못해 이마 비율은 제외돼요. 원하면 한 번 다시 촬영할 수 있어요.',
  'actionable omission offers one optional retake',
);
expectEqual(
  getUnifiedHairlineConfirmationNotice({
    analysisEligible: true,
    confidence: 0.82,
    normalizedPoint: {x: 0.5, y: 0.15},
    outcome: 'detected_high_confidence',
    provider: 'mediapipe_selfie_multiclass',
    retryRecommendation: {attemptCount: 0, recommended: false},
  }),
  null,
  'eligible H keeps the normal confirmation copy',
);

const mappedHighConfidenceHairline = mapUnifiedHairlineToVerticalThirds({
  analysisEligible: true,
  confidence: 0.82,
  normalizedPoint: {x: 0.5, y: 0.15},
  outcome: 'detected_high_confidence',
  provider: 'mediapipe_selfie_multiclass',
  retryRecommendation: {attemptCount: 0, recommended: false},
});
expectEqual(
  mappedHighConfidenceHairline?.provider,
  'mediapipe_hairline_boundary',
  'unified MediaPipe boundary maps to an actual hairline provider',
);
expectEqual(
  mappedHighConfidenceHairline?.analysisEligible,
  true,
  'high-confidence unified H remains eligible for the full report',
);

const mappedLowConfidenceHairline = mapUnifiedHairlineToVerticalThirds({
  analysisEligible: false,
  confidence: 0.58,
  normalizedPoint: {x: 0.51, y: 0.14},
  outcome: 'detected_low_confidence',
  provider: 'mediapipe_selfie_multiclass',
  retryRecommendation: {attemptCount: 0, recommended: false},
});
expectEqual(
  mappedLowConfidenceHairline?.provider,
  'mediapipe_hairline_boundary',
  'low-confidence unified MediaPipe H keeps its actual boundary provider',
);
expectEqual(
  mappedLowConfidenceHairline?.analysisEligible,
  false,
  'low-confidence unified H remains preserved but analysis-ineligible',
);
expectEqual(
  mappedLowConfidenceHairline?.confidence,
  0.58,
  'low-confidence unified H preserves its measured confidence',
);
expectEqual(
  mappedLowConfidenceHairline?.normalizedPoint.x,
  0.51,
  'low-confidence unified H preserves its measured x coordinate',
);
expectEqual(
  mappedLowConfidenceHairline?.normalizedPoint.y,
  0.14,
  'low-confidence unified H preserves its measured y coordinate',
);
expectEqual(
  mappedLowConfidenceHairline?.method,
  'unified_mediapipe_selfie_multiclass',
  'low-confidence unified H preserves its capture method',
);
