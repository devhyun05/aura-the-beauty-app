import {buildFaceVerticalThirdsAnalysisPayload} from './faceVerticalThirdsAiPayload';
import type {FaceVerticalThirdsResult} from '../types';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function fixture(): FaceVerticalThirdsResult {
  return {
    artifacts: {},
    captureId: 'capture',
    createdAt: '2026-07-16T00:00:00.000Z',
    faceLength: {heightPx: 900, ratio: 1.3, widthPx: 690},
    hairlineAnalysis: {
      analysisEligible: true,
      confidence: 0.82,
      outcome: 'detected_high_confidence',
      provider: 'apple_semantic_matte',
    },
    interpretation: {
      dominantPart: 'upper',
      summary: '상안부가 긴 편이에요.',
      title: '얼굴 세로 비율 분석',
    },
    keypoints: {
      G: {confidence: 0.9, method: 'g', provider: 'mediapipe', x: 100, y: 300},
      H: {
        confidence: 0.82,
        method: 'hair',
        provider: 'apple_semantic_matte',
        x: 100,
        y: 100,
      },
      Me: {confidence: 0.9, method: 'me', provider: 'mediapipe', x: 100, y: 1000},
      Sn: {confidence: 0.9, method: 'sn', provider: 'mediapipe', x: 100, y: 650},
    },
    measurementMode: 'full_vertical_thirds',
    quality: {usable: true, warnings: []},
    schemaVersion: 'aura-face-vertical-thirds-v1',
    sessionId: 'capture',
    sourceImage: {height: 1200, uri: 'file:///capture.jpg', width: 900},
    status: 'full_success',
    verticalThirds: {
      confidence: 0.82,
      displayRatio: {lower: 1.0, middle: 1.0, upper: 0.9},
      lowerNormalized: 0.35,
      lowerPx: 350,
      middleNormalized: 0.35,
      middlePx: 350,
      totalPx: 900,
      upperNormalized: 0.3,
      upperPx: 200,
      warnings: [],
    },
  };
}

const fullPayload = buildFaceVerticalThirdsAnalysisPayload(fixture());
expect(
  fullPayload?.measurementMode === 'full_vertical_thirds' &&
    'hairline' in fullPayload &&
    'displayRatio' in fullPayload,
  'An authoritative actual H must produce the full AI payload.',
);

const lowResult: FaceVerticalThirdsResult = {
  ...fixture(),
  hairlineAnalysis: {
    analysisEligible: false,
    confidence: 0.58,
    outcome: 'detected_low_confidence',
    provider: 'apple_semantic_matte',
  },
  measurementMode: 'middle_lower_only',
  status: 'partial_success',
};
const lowPayload = buildFaceVerticalThirdsAnalysisPayload(lowResult);
const lowJson = JSON.stringify(lowPayload);
expect(
  lowPayload?.measurementMode === 'middle_lower_only',
  'A low-confidence H must be downgraded for AI.',
);
for (const forbidden of [
  '"hairline"',
  '"upper"',
  '"upperPx"',
  '"upperNormalized"',
  '"dominantPart"',
  '"faceLength"',
]) {
  expect(!lowJson.includes(forbidden), `Low-confidence AI payload leaked ${forbidden}.`);
}

const proxyResult: FaceVerticalThirdsResult = {
  ...fixture(),
  hairlineAnalysis: {
    analysisEligible: true,
    confidence: 0.99,
    outcome: 'detected_high_confidence',
    provider: 'mediapipe_forehead_approx',
  },
  keypoints: {
    ...fixture().keypoints,
    H: {
      confidence: 0.99,
      method: 'idx10',
      provider: 'mediapipe_forehead_approx',
      x: 100,
      y: 100,
    },
  },
};
const proxyPayload = buildFaceVerticalThirdsAnalysisPayload(proxyResult);
expect(
  proxyPayload?.measurementMode === 'middle_lower_only' &&
    !JSON.stringify(proxyPayload).includes('mediapipe_forehead_approx'),
  'A malformed proxy result must fail closed and never reach AI.',
);

console.log('faceVerticalThirdsAiPayload.test.ts passed');
