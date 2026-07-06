import type {FaceVerticalThirdsResult} from '../types';

// 보고서 작성 AI(requestPayload.faceVerticalThirds)로 보내는 압축 요약.
// raw keypoint는 보내지 않고 해석에 필요한 값만 담는다.
export type FaceVerticalThirdsAnalysisPayload = {
  confidence: number | null;
  displayRatio: {
    lower: number;
    middle: number;
    upper: number | null;
  };
  dominantPart: string | null;
  hairline: {
    confidence: number | null;
    provider: string | null;
  };
  status: string;
  summary: string;
};

export function buildFaceVerticalThirdsAnalysisPayload(
  result: FaceVerticalThirdsResult | null,
): FaceVerticalThirdsAnalysisPayload | undefined {
  if (
    !result ||
    (result.status !== 'full_success' && result.status !== 'partial_success') ||
    !result.verticalThirds
  ) {
    return undefined;
  }

  return {
    confidence: result.verticalThirds.confidence ?? null,
    displayRatio: {
      lower: result.verticalThirds.displayRatio.lower,
      middle: result.verticalThirds.displayRatio.middle,
      upper: result.verticalThirds.displayRatio.upper,
    },
    dominantPart: result.interpretation.dominantPart ?? null,
    hairline: {
      confidence: result.keypoints.H?.confidence ?? null,
      provider: result.keypoints.H?.provider ?? null,
    },
    status: result.status,
    summary: result.interpretation.summary,
  };
}
