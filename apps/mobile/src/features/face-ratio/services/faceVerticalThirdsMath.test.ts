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
  expect(
    deriveDominantPart(buildRatio(1.0, 0.8)) === 'balanced',
    'Average ratios must map to balanced.',
  );
  expect(
    deriveDominantPart(buildRatio(1.2, 0.8)) === 'upper',
    'Long upper third must map to upper.',
  );
  expect(
    deriveDominantPart(buildRatio(1.0, 1.0)) === 'lower',
    'Long lower third must map to lower.',
  );
  expect(
    deriveDominantPart(buildRatio(0.8, 0.8)) === 'middle',
    'Short upper third must map to relatively long middle.',
  );
  expect(
    deriveDominantPart(buildRatio(1.0, 0.6)) === 'middle',
    'Short lower third must map to relatively long middle.',
  );
  expect(
    deriveDominantPart(buildRatio(1.15, 1.0)) === 'lower',
    'Largest absolute delta must win (lower +0.2 over upper +0.15).',
  );
  expect(
    deriveDominantPart(buildRatio(null, 1.0)) === 'unknown',
    'Without hairline a two-segment result must not claim a three-part dominant region.',
  );
  expect(
    deriveDominantPart(buildRatio(null, 0.82)) === 'unknown',
    'Without hairline a two-segment result must not claim three-part balance.',
  );

  const balanced = buildInterpretation('full_success', buildRatio(1.0, 0.8));
  const longUpper = buildInterpretation('full_success', buildRatio(1.2, 0.8));
  const longLower = buildInterpretation('full_success', buildRatio(1.0, 1.0));
  const shortUpper = buildInterpretation('full_success', buildRatio(0.8, 0.8));
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
    !noHairline.summary.includes('상·중·하안 비율'),
    'Missing hairline must not use a three-part balance summary.',
  );
  expect(
    buildInterpretation('blocked', buildRatio(1.0, 0.8)).dominantPart === 'unknown',
    'Blocked status must not claim a dominant part.',
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
