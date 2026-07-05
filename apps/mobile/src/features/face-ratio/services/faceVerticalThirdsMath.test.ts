import {buildInterpretation, deriveDominantPart} from './faceVerticalThirdsMath';
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
    deriveDominantPart(buildRatio(null, 1.0)) === 'lower',
    'Without hairline the lower delta alone must still classify.',
  );
  expect(
    deriveDominantPart(buildRatio(null, 0.82)) === 'balanced',
    'Without hairline a near-average lower third must stay balanced.',
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
    noHairline.summary.includes('상안부는 판정에서 제외'),
    'Missing hairline must be called out in the summary.',
  );
  expect(
    buildInterpretation('blocked', buildRatio(1.0, 0.8)).dominantPart === 'unknown',
    'Blocked status must not claim a dominant part.',
  );
}
