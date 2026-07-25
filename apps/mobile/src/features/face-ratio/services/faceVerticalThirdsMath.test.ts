import {
  buildInterpretation,
  calculateVerticalThirdsRatio,
  deriveDominantPart,
} from './faceVerticalThirdsMath';
import type {VerticalThirdsRatio} from '../types';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRatio(upper: number | null, lower: number): VerticalThirdsRatio {
  return {
    confidence: 0.9,
    displayRatio: {lower, middle: 1.0, upper},
    lowerNormalized: null,
    lowerPx: 100 * lower,
    middleNormalized: null,
    middlePx: 100,
    totalPx: null,
    upperNormalized: null,
    upperPx: upper === null ? null : 100 * upper,
    warnings: [],
  };
}

export function runFaceVerticalThirdsMathTests() {
  expect(
    deriveDominantPart(undefined) === 'unknown',
    'Missing ratio must map to unknown dominant part.',
  );
  // 자기내부 비교(Phase 0-3): 각 부위를 중안부(1.0)와 직접 비교한다.
  // 종전 0.8 앵커(성형광고 관행값) 기준 기대값을 전면 갱신했다.
  expect(
    deriveDominantPart(buildRatio(1.0, 1.0)) === 'balanced',
    'Parts equal to the midface must map to balanced (self-relative).',
  );
  expect(
    deriveDominantPart(buildRatio(1.2, 1.0)) === 'upper',
    'Upper third longer than midface must map to upper.',
  );
  expect(
    deriveDominantPart(buildRatio(1.0, 1.15)) === 'lower',
    'Lower third longer than midface must map to lower.',
  );
  expect(
    deriveDominantPart(buildRatio(0.8, 1.0)) === 'middle',
    'Upper third shorter than midface must map to relatively long middle.',
  );
  expect(
    deriveDominantPart(buildRatio(1.0, 0.8)) === 'middle',
    'Lower third shorter than midface must map to relatively long middle (was balanced under the 0.8 anchor).',
  );
  expect(
    deriveDominantPart(buildRatio(1.15, 1.2)) === 'lower',
    'Largest absolute delta must win (lower +0.20 over upper +0.15).',
  );
  expect(
    deriveDominantPart(buildRatio(1.05, 0.95)) === 'balanced',
    'Deltas inside the 0.08 threshold must stay balanced.',
  );
  // 부동소수점 경계(1차 리뷰 M4): 1.08−1.0 = 0.08000000000000007,
  // |0.92−1.0| = 0.07999999999999996 — epsilon 없이는 방향별 비대칭.
  expect(
    deriveDominantPart(buildRatio(1.08, 1.0)) === 'balanced' &&
      deriveDominantPart(buildRatio(0.92, 1.0)) === 'balanced' &&
      deriveDominantPart(buildRatio(1.0, 1.08)) === 'balanced' &&
      deriveDominantPart(buildRatio(1.0, 0.92)) === 'balanced',
    'Exact ±0.08 boundary must be symmetric and non-significant in both directions.',
  );
  expect(
    deriveDominantPart(buildRatio(1.081, 1.0)) === 'upper' &&
      deriveDominantPart(buildRatio(0.919, 1.0)) === 'middle',
    'Just beyond the ±0.08 boundary must become significant.',
  );
  expect(
    deriveDominantPart(buildRatio(1.07, 0.93)) === 'balanced',
    'Opposite-direction deltas inside the threshold (1.07:1:0.93) must stay balanced.',
  );
  expect(
    deriveDominantPart(buildRatio(null, 1.0)) === 'balanced',
    'Without hairline equal middle/lower segments must map to balanced.',
  );
  expect(
    deriveDominantPart(buildRatio(null, 0.82)) === 'middle',
    'Without hairline a shorter lower segment must map to relatively long middle.',
  );

  const balanced = buildInterpretation('full_success', buildRatio(1.0, 1.0));
  const longUpper = buildInterpretation('full_success', buildRatio(1.2, 1.0));
  const longLower = buildInterpretation('full_success', buildRatio(1.0, 1.2));
  const shortUpper = buildInterpretation('full_success', buildRatio(0.8, 1.0));
  const noHairline = buildInterpretation('partial_success', buildRatio(null, 1.0));

  expect(
    balanced.summary !== longUpper.summary &&
      longUpper.summary !== longLower.summary &&
      longLower.summary !== shortUpper.summary,
    'Different ratio profiles must produce different summaries.',
  );
  expect(
    longUpper.summary.includes('상안부'),
    'Long upper summary must mention 상안부.',
  );
  expect(
    noHairline.summary.includes('중안부') &&
      noHairline.summary.includes('하안부') &&
      noHairline.summary.includes('상안부는 반영하지 않았어요'),
    'Missing hairline must use an explicit middle/lower-only summary.',
  );
  expect(
    !noHairline.summary.includes('상·중·하안부 길이가 서로'),
    'Missing hairline must not use a three-part balance summary.',
  );
  expect(
    buildInterpretation('blocked', buildRatio(1.0, 1.0)).dominantPart === 'unknown',
    'Blocked status must not claim a dominant part.',
  );
  expect(
    !balanced.summary.includes('평균') &&
      !longUpper.summary.includes('평균') &&
      !longLower.summary.includes('평균') &&
      !shortUpper.summary.includes('평균'),
    'Self-relative summaries must not reference a population average (Phase 0-3).',
  );
  expect(
    longLower.summary.includes('중안부보다'),
    'Dominant-part summary must compare against the midface, not an external norm.',
  );

  const middleLowerRatio = calculateVerticalThirdsRatio({
    G: {confidence: 0.91, method: 'g', provider: 'mediapipe', x: 0, y: 100},
    H: null,
    Me: {confidence: 0.89, method: 'me', provider: 'mediapipe', x: 0, y: 300},
    Sn: {confidence: 0.93, method: 'sn', provider: 'mediapipe', x: 0, y: 200},
  });
  expect(
    middleLowerRatio.confidence === 0.89,
    'Middle/lower-only confidence must come from G/Sn/Me without a synthetic H fallback.',
  );
  expect(
    middleLowerRatio.displayRatio.upper === null &&
      middleLowerRatio.totalPx === null &&
      middleLowerRatio.upperNormalized === null,
    'Middle/lower-only math must not synthesize H-dependent values.',
  );
}

runFaceVerticalThirdsMathTests();
console.log('faceVerticalThirdsMath.test.ts passed');
