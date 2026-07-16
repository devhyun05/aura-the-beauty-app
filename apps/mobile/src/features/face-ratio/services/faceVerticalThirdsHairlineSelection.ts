import {
  APPLE_HAIRLINE_FULL_CONFIDENCE,
  APPLE_HAIRLINE_MIN_CONFIDENCE,
} from '../constants';
import type {
  FaceVerticalThirdsHairlineAnalysis,
  VerticalThirdsKeypoint,
  VerticalThirdsKeypointProvider,
} from '../types';

export type HairlineCandidate = {
  analysisEligible: boolean;
  keypoint: VerticalThirdsKeypoint;
};

export type HairlineSelection = {
  analysis: FaceVerticalThirdsHairlineAnalysis;
  keypoint: VerticalThirdsKeypoint | null;
};

const ACTUAL_HAIRLINE_PROVIDERS: ReadonlySet<VerticalThirdsKeypointProvider> = new Set([
  'apple_semantic_matte',
  'mediapipe_hairline_boundary',
  'face_parsing',
]);

export function isActualHairlineProvider(
  provider: VerticalThirdsKeypointProvider | null | undefined,
): boolean {
  return provider ? ACTUAL_HAIRLINE_PROVIDERS.has(provider) : false;
}

function isFiniteCandidate(candidate: HairlineCandidate | null | undefined) {
  const point = candidate?.keypoint;

  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.confidence) &&
      point.confidence >= 0 &&
      point.confidence <= 1 &&
      isActualHairlineProvider(point.provider),
  );
}

function toAnalysis(
  keypoint: VerticalThirdsKeypoint | null,
  analysisEligible: boolean,
): FaceVerticalThirdsHairlineAnalysis {
  if (!keypoint) {
    return {
      analysisEligible: false,
      confidence: null,
      outcome: 'omitted',
      provider: null,
    };
  }

  return {
    analysisEligible,
    confidence: keypoint.confidence,
    outcome: analysisEligible
      ? 'detected_high_confidence'
      : 'detected_low_confidence',
    provider: keypoint.provider,
  };
}

// Apple auxiliary matte를 우선하되, Apple이 저신뢰일 때 같은 캡처 token의
// 고신뢰 실제 MediaPipe/face-parsing H가 있으면 그 값을 공식 H로 선택한다.
// landmark idx-10 같은 proxy provider는 후보 단계에서 무조건 거부한다.
export function selectHairlineForAnalysis({
  apple,
  captured,
}: {
  apple?: HairlineCandidate | null;
  captured?: HairlineCandidate | null;
}): HairlineSelection {
  const candidates = [apple, captured].filter(isFiniteCandidate) as HairlineCandidate[];
  const highConfidence = candidates.find(
    candidate =>
      candidate.analysisEligible &&
      candidate.keypoint.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE,
  );

  if (highConfidence) {
    return {
      analysis: toAnalysis(highConfidence.keypoint, true),
      keypoint: highConfidence.keypoint,
    };
  }

  const lowConfidence = candidates.find(
    candidate => candidate.keypoint.confidence >= APPLE_HAIRLINE_MIN_CONFIDENCE,
  );

  if (lowConfidence) {
    return {
      analysis: toAnalysis(lowConfidence.keypoint, false),
      keypoint: lowConfidence.keypoint,
    };
  }

  return {
    analysis: toAnalysis(null, false),
    keypoint: null,
  };
}
