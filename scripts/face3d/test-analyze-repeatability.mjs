// Contract test for the G4 repeatability analyzer. Uses synthetic metric values only
// (no faces, no captures) to prove the within/between/discriminability math and verdicts.

import assert from 'node:assert/strict';

import {
  analyzeRepeatability,
  median,
  medianAbsoluteDeviation,
  FACE3D_METRIC_KEYS,
} from './analyze-repeatability.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function metrics(nose, chin, upper, lower, central) {
  return {
    noseTipProjection: nose,
    chinProjection: chin,
    upperLipToELine: upper,
    lowerLipToELine: lower,
    centralProjectionScore: central,
  };
}

test('median and MAD are robust to a stray value', () => {
  assert.equal(median([0.1, 0.2, 0.3]), 0.2);
  assert.equal(median([0.1, 0.2, 0.3, 0.4]), 0.25);
  // MAD ignores the 9.0 outlier: deviations from median 0.2 are [0.1,0,0.1,8.8] -> median 0.1
  assert.ok(Math.abs(medianAbsoluteDeviation([0.1, 0.2, 0.3, 9.0]) - 0.1) < 1e-9);
});

test('tight repeats + separated people -> high discriminability, pass', () => {
  // Three subjects, three repeats each; within-subject jitter ~0.002, people ~0.1 apart.
  const captures = [];
  const bases = {
    'subject-01': metrics(0.30, 0.06, 0.01, 0.03, 0.24),
    'subject-02': metrics(0.42, 0.14, 0.05, 0.08, 0.36),
    'subject-03': metrics(0.20, 0.02, 0.00, 0.01, 0.14),
  };
  for (const [subjectId, base] of Object.entries(bases)) {
    for (const delta of [-0.002, 0, 0.002]) {
      captures.push({
        subjectId,
        metrics: metrics(
          base.noseTipProjection + delta,
          base.chinProjection + delta,
          base.upperLipToELine + delta,
          base.lowerLipToELine + delta,
          base.centralProjectionScore + delta,
        ),
      });
    }
  }

  const result = analyzeRepeatability(captures, {minDiscriminability: 2.0});
  assert.equal(result.overallPass, true);
  for (const key of FACE3D_METRIC_KEYS) {
    assert.ok(
      result.metrics[key].discriminability >= 2.0,
      `${key} discriminability ${result.metrics[key].discriminability} should be >= 2`,
    );
    assert.equal(result.metrics[key].pass, true);
  }
});

test('identical people -> ~zero between-spread -> fail (not discriminable)', () => {
  const captures = [];
  for (const subjectId of ['subject-01', 'subject-02', 'subject-03']) {
    for (const delta of [-0.001, 0, 0.001]) {
      captures.push({subjectId, metrics: metrics(0.30 + delta, 0.06, 0.01, 0.03, 0.24)});
    }
  }
  const result = analyzeRepeatability(captures, {minDiscriminability: 2.0});
  assert.equal(result.metrics.chinProjection.pass, false);
  assert.equal(result.overallPass, false);
});

test('single capture per subject -> not evaluable -> overall pending', () => {
  const captures = [
    {subjectId: 'subject-01', metrics: metrics(0.30, 0.06, 0.01, 0.03, 0.24)},
    {subjectId: 'subject-02', metrics: metrics(0.42, 0.14, 0.05, 0.08, 0.36)},
  ];
  const result = analyzeRepeatability(captures, {minDiscriminability: 2.0});
  assert.equal(result.overallPass, false);
  assert.equal(result.evaluableMetricCount, 0);
  for (const key of FACE3D_METRIC_KEYS) {
    assert.equal(result.metrics[key].repeatedSubjectCount, 0);
  }
});

test('madFloor keeps discriminability finite for a noiseless subject', () => {
  const captures = [
    {subjectId: 'subject-01', metrics: metrics(0.30, 0.06, 0.01, 0.03, 0.24)},
    {subjectId: 'subject-01', metrics: metrics(0.30, 0.06, 0.01, 0.03, 0.24)},
    {subjectId: 'subject-02', metrics: metrics(0.50, 0.20, 0.09, 0.12, 0.40)},
    {subjectId: 'subject-02', metrics: metrics(0.50, 0.20, 0.09, 0.12, 0.40)},
  ];
  const result = analyzeRepeatability(captures, {minDiscriminability: 2.0, madFloor: 1e-4});
  for (const key of FACE3D_METRIC_KEYS) {
    assert.ok(Number.isFinite(result.metrics[key].discriminability));
    assert.ok(result.metrics[key].within >= 1e-4);
  }
});

console.log(`\nFace3D repeatability analyzer: ${passed} tests passed.`);
