import {selectHairlineForAnalysis} from './faceVerticalThirdsHairlineSelection';
import type {VerticalThirdsKeypoint} from '../types';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function point(
  provider: VerticalThirdsKeypoint['provider'],
  confidence: number,
): VerticalThirdsKeypoint {
  return {confidence, method: provider, provider, x: 100, y: 80};
}

const proxy = selectHairlineForAnalysis({
  captured: {
    analysisEligible: true,
    keypoint: point('mediapipe_forehead_approx', 0.99),
  },
});
expect(
  proxy.keypoint === null && !proxy.analysis.analysisEligible,
  'A proxy H must never become a new authoritative or reference hairline.',
);

const appleHigh = selectHairlineForAnalysis({
  apple: {
    analysisEligible: true,
    keypoint: point('apple_semantic_matte', 0.78),
  },
  captured: {
    analysisEligible: true,
    keypoint: point('mediapipe_hairline_boundary', 0.91),
  },
});
expect(
  appleHigh.keypoint?.provider === 'apple_semantic_matte' &&
    appleHigh.analysis.analysisEligible,
  'A high-confidence Apple actual H must have priority.',
);

const capturedHighAfterAppleLow = selectHairlineForAnalysis({
  apple: {
    analysisEligible: true,
    keypoint: point('apple_semantic_matte', 0.58),
  },
  captured: {
    analysisEligible: true,
    keypoint: point('mediapipe_hairline_boundary', 0.84),
  },
});
expect(
  capturedHighAfterAppleLow.keypoint?.provider === 'mediapipe_hairline_boundary' &&
    capturedHighAfterAppleLow.analysis.analysisEligible,
  'A high-confidence actual captured H must beat a low-confidence Apple H.',
);

const low = selectHairlineForAnalysis({
  apple: {
    analysisEligible: true,
    keypoint: point('apple_semantic_matte', 0.52),
  },
});
expect(
  low.keypoint?.provider === 'apple_semantic_matte' &&
    !low.analysis.analysisEligible &&
    low.analysis.outcome === 'detected_low_confidence',
  'A low-confidence actual H may be retained only as analysis-ineligible reference data.',
);

const upstreamIneligible = selectHairlineForAnalysis({
  captured: {
    analysisEligible: false,
    keypoint: point('face_parsing', 0.95),
  },
});
expect(
  upstreamIneligible.keypoint?.provider === 'face_parsing' &&
    !upstreamIneligible.analysis.analysisEligible,
  'An upstream-ineligible candidate must not be promoted by confidence alone.',
);

console.log('faceVerticalThirdsHairlineSelection.test.ts passed');
