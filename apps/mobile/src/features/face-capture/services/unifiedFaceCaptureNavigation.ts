import type {UnifiedFaceCaptureResult} from './unifiedFaceCaptureContract';

export type UnifiedFaceCaptureVerticalThirdsHairline = {
  analysisEligible: boolean;
  confidence: number;
  method: string;
  normalizedPoint: {x: number; y: number};
  provider: 'apple_semantic_matte' | 'mediapipe_hairline_boundary';
};

export function shouldUseUnifiedFaceCaptureRoute({
  featureEnabled,
  forceLegacyCapture,
  initialSource,
  nativeViewSupported,
}: {
  featureEnabled: boolean;
  forceLegacyCapture: boolean;
  initialSource?: 'gallery';
  nativeViewSupported: boolean;
}): boolean {
  return (
    initialSource !== 'gallery' &&
    !forceLegacyCapture &&
    featureEnabled &&
    nativeViewSupported
  );
}

export function getFaceAnalysisConfirmationDestination(
  hasUnifiedCapture: boolean,
): 'Face3DMeasurement' | 'FaceAnalysisLoading' {
  return hasUnifiedCapture ? 'FaceAnalysisLoading' : 'Face3DMeasurement';
}

export function mapUnifiedHairlineToVerticalThirds(
  hairline: UnifiedFaceCaptureResult['hairline'] | undefined,
): UnifiedFaceCaptureVerticalThirdsHairline | undefined {
  if (
    !hairline ||
    hairline.provider === 'none' ||
    hairline.confidence === null ||
    !hairline.normalizedPoint
  ) {
    return undefined;
  }

  return {
    analysisEligible: hairline.analysisEligible,
    confidence: hairline.confidence,
    method: `unified_${hairline.provider}`,
    normalizedPoint: hairline.normalizedPoint,
    provider:
      hairline.provider === 'mediapipe_selfie_multiclass'
        ? 'mediapipe_hairline_boundary'
        : 'apple_semantic_matte',
  };
}

export function getUnifiedHairlineConfirmationNotice(
  hairline: UnifiedFaceCaptureResult['hairline'] | undefined,
): string | null {
  if (!hairline || hairline.analysisEligible) {
    return null;
  }

  if (hairline.retryRecommendation.recommended) {
    return '헤어라인을 충분히 확인하지 못해 이마 비율은 제외돼요. 원하면 한 번 다시 촬영할 수 있어요.';
  }

  return '헤어라인 신뢰도가 충분하지 않아 이마 비율은 제외하고 분석해요.';
}
