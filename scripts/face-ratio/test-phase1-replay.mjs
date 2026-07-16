import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

import {validatePhase1ReplayArtifact} from './phase1-replay-core.mjs';
import {PHASE1_REPLAY_SHOTS} from './phase1-replay-shot-plan.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const tempRoot = mkdtempSync(join(tmpdir(), 'aura-face-ratio-phase1-test-'));
const artifactPath = join(tempRoot, 'cohort.json');
const reportPath = join(tempRoot, 'report.json');

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(script, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  expect(
    result.status === expectedStatus,
    `${script} status=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`,
  );
  return result;
}

function conditionTuple(condition) {
  return [
    condition.distanceLabel,
    condition.isReference,
    condition.poseLabel,
    condition.repeatGroup,
    condition.repeatIndex,
  ].join('|');
}

const expectedPhase1ConditionTuples = [
  'standard|true|frontal|frontal-standard|1',
  'standard|false|yaw-subject-left-6deg|yaw-subject-left-6deg-standard|1',
  'standard|false|yaw-subject-right-6deg|yaw-subject-right-6deg-standard|1',
  'standard|false|pitch-chin-up-8deg|pitch-chin-up-8deg-standard|1',
  'standard|false|pitch-chin-down-8deg|pitch-chin-down-8deg-standard|1',
  'standard|false|roll-subject-left-3deg|roll-subject-left-3deg-standard|1',
  'standard|false|roll-subject-right-3deg|roll-subject-right-3deg-standard|1',
  'near-within-existing-greenlight|false|frontal|frontal-near-within-existing-greenlight|1',
  'far-within-existing-greenlight|false|frontal|frontal-far-within-existing-greenlight|1',
  'standard|true|frontal|frontal-standard|2',
];
expect(
  PHASE1_REPLAY_SHOTS.map(shot => conditionTuple(shot.condition)).join('\n') ===
    expectedPhase1ConditionTuples.join('\n'),
  'Canonical Phase 1 plan must retain the exact ordered v3 condition tuples.',
);

function rotationMatrix({pitchDeg, rollDeg, yawDeg}) {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  return {
    layout: 'row-major',
    values: [
      cz * cy,
      cz * sy * sx - sz * cx,
      cz * sy * cx + sz * sx,
      0,
      sz * cy,
      sz * sy * sx + cz * cx,
      sz * sy * cx - cz * sx,
      0,
      -sy,
      cy * sx,
      cy * cx,
      0,
      0,
      0,
      0,
      1,
    ],
  };
}

function canonicalLandmarks() {
  const points = Array.from({length: 478}, (_, i) => ({
    i,
    x: 0.5 + ((i % 19) - 9) * 0.001,
    y: 0.5 + ((Math.floor(i / 19) % 25) - 12) * 0.001,
    z: ((i % 13) - 6) * 0.001,
  }));
  const set = (i, x, y, z) => {
    points[i] = {i, x, y, z};
  };
  set(10, 0.5, 0.2, -0.04);
  set(9, 0.495, 0.32, -0.03);
  set(151, 0.505, 0.32, -0.03);
  set(107, 0.47, 0.32, -0.025);
  set(55, 0.48, 0.32, -0.025);
  set(65, 0.49, 0.32, -0.025);
  set(336, 0.51, 0.32, -0.025);
  set(285, 0.52, 0.32, -0.025);
  set(295, 0.53, 0.32, -0.025);
  set(2, 0.5, 0.58, -0.08);
  set(97, 0.495, 0.58, -0.08);
  set(326, 0.505, 0.58, -0.08);
  set(148, 0.49, 0.85, 0.015);
  set(152, 0.5, 0.86, 0.02);
  set(176, 0.48, 0.855, 0.02);
  set(377, 0.51, 0.85, 0.015);
  set(400, 0.52, 0.855, 0.02);
  set(234, 0.25, 0.55, 0.04);
  set(454, 0.75, 0.55, 0.04);
  return points;
}

function poseSample(frontal, matrix, imageWidth, imageHeight) {
  const values = matrix.values;
  const center = frontal.reduce(
    (sum, point) => ({
      x: sum.x + point.x * imageWidth,
      y: sum.y + point.y * imageHeight,
      z: sum.z + point.z * imageWidth,
    }),
    {x: 0, y: 0, z: 0},
  );
  center.x /= frontal.length;
  center.y /= frontal.length;
  center.z /= frontal.length;

  const posePoint = point => {
    const x = point.x * imageWidth - center.x;
    const y = -(point.y * imageHeight - center.y);
    const z = point.z * imageWidth - center.z;
    const px = values[0] * x + values[1] * y + values[2] * z;
    const py = values[4] * x + values[5] * y + values[6] * z;
    const pz = values[8] * x + values[9] * y + values[10] * z;
    return {
      ...point,
      x: (center.x + px) / imageWidth,
      y: (center.y - py) / imageHeight,
      z: (center.z + pz) / imageWidth,
    };
  };

  return {landmarks: frontal.map(posePoint), posePoint};
}

const imageWidth = 1080;
const imageHeight = 1440;
const frontal = canonicalLandmarks();
const canonicalHairline = {i: -10, x: 0.5, y: 0.16, z: -0.04};
const captureFixtures = [
  {
    captureId: 'cap_reference_001',
    matrix: rotationMatrix({pitchDeg: 0, yawDeg: 0, rollDeg: 0}),
  },
  {
    captureId: 'cap_yaw_left_001',
    matrix: rotationMatrix({pitchDeg: 1, yawDeg: 7, rollDeg: 0.5}),
  },
  {
    captureId: 'cap_yaw_right_001',
    matrix: rotationMatrix({pitchDeg: -1, yawDeg: -7, rollDeg: -0.5}),
  },
  {
    captureId: 'cap_pitch_up_001',
    matrix: rotationMatrix({pitchDeg: 10, yawDeg: 1, rollDeg: 0.5}),
  },
  {
    captureId: 'cap_pitch_down_001',
    matrix: rotationMatrix({pitchDeg: -8, yawDeg: -1, rollDeg: -0.5}),
  },
  {
    captureId: 'cap_roll_left_001',
    matrix: rotationMatrix({pitchDeg: 1, yawDeg: 1, rollDeg: 4}),
  },
  {
    captureId: 'cap_roll_right_001',
    matrix: rotationMatrix({pitchDeg: -1, yawDeg: -1, rollDeg: -4}),
  },
  {
    captureId: 'cap_frontal_near_001',
    matrix: rotationMatrix({pitchDeg: 0.5, yawDeg: 0.5, rollDeg: 0.2}),
  },
  {
    captureId: 'cap_frontal_far_001',
    matrix: rotationMatrix({pitchDeg: -0.5, yawDeg: -0.5, rollDeg: -0.2}),
  },
  {
    captureId: 'cap_reference_002',
    matrix: rotationMatrix({pitchDeg: 0.8, yawDeg: -0.5, rollDeg: 0.3}),
  },
];
const samples = captureFixtures.map((fixture, index) => ({
  ...fixture,
  condition: PHASE1_REPLAY_SHOTS[index].condition,
}));

for (const sample of samples) {
  const posed = poseSample(frontal, sample.matrix, imageWidth, imageHeight);
  const hairline = posed.posePoint(canonicalHairline);
  const responsePath = join(tempRoot, `${sample.captureId}-response.json`);
  const metadataPath = join(tempRoot, `${sample.captureId}-metadata.json`);
  writeFileSync(
    responsePath,
    JSON.stringify({
      type: 'faceLandmarks',
      status: 'ok',
      faceCount: 1,
      imageWidth,
      imageHeight,
      landmarks: posed.landmarks,
      transformationMatrix: sample.matrix,
    }),
  );
  writeFileSync(
    metadataPath,
    JSON.stringify({
      artifactCreatedAtUtc: '2026-07-17T00:00:00.000Z',
      capturedAtUtc: new Date(
        Date.parse('2026-07-17T00:00:00.000Z') +
          samples.indexOf(sample) * 60_000,
      ).toISOString(),
      cohortId: 'cohort_synthetic_phase1',
      captureId: sample.captureId,
      sessionId: 'session_synthetic_phase1',
      subjectId: 'subj_synthetic_001',
      condition: sample.condition,
      hairline: {
        confidence: 0.9,
        provider: 'synthetic-test',
        x: hairline.x,
        y: hairline.y,
        zProxy: hairline.z,
      },
    }),
  );
  run('scripts/face-ratio/prepare-phase1-replay-artifact.mjs', [
    '--response',
    responsePath,
    '--metadata',
    metadataPath,
    '--output',
    artifactPath,
  ]);
}

run('scripts/face-ratio/replay-phase1-pose-normalization.mjs', [
  '--input',
  artifactPath,
  '--output',
  reportPath,
]);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
expect(report.gate.status === 'GO', 'Synthetic rigid-pose replay must pass both MAD and MAE.');
expect(
  report.aggregateMetrics.faceLengthRatio.normalizedMad <
    report.aggregateMetrics.faceLengthRatio.rawMad &&
    report.aggregateMetrics.faceLengthRatio.normalizedMaeToReference <
      report.aggregateMetrics.faceLengthRatio.rawMaeToReference,
  'Face-length replay must converge to the subject reference.',
);
expect(
  report.aggregateMetrics.faceLengthRatio
    .normalizedReferencePairDrift <
    report.aggregateMetrics.faceLengthRatio.rawReferencePairDrift,
  'Reference A/B drift must be reported and decrease after normalization.',
);
expect(
  report.gate.rule.includes('median-of-own-frontal-reference-A/B') &&
    report.gate.rule.includes('both references are included in the MAE denominator'),
  'Replay gate must use the median of reference A/B and include both references in MAE.',
);
expect(
  report.subjectSummaries[0].jitter.evaluatedAnchorGroups > 0 &&
    report.subjectSummaries[0].jitter.normalizedAnchorMadPx <
      report.subjectSummaries[0].jitter.rawAnchorMadPx,
  'Repeat-group anchor jitter must remain diagnostic and decrease in the synthetic pose series.',
);
expect(
  report.productPayloadIncluded === false &&
    !JSON.stringify(report).includes('"landmarks"'),
  'Aggregate report must not contain raw landmarks or product payload data.',
);

function cloneArtifact() {
  return JSON.parse(readFileSync(artifactPath, 'utf8'));
}

function expectReplayReadyRejection(artifact, expectedMessage, label) {
  let rejection = null;
  try {
    validatePhase1ReplayArtifact(artifact, {requireReplayReady: true});
  } catch (error) {
    rejection = error;
  }
  expect(
    rejection instanceof Error && rejection.message.includes(expectedMessage),
    `${label}: expected "${expectedMessage}", received "${
      rejection instanceof Error ? rejection.message : 'no rejection'
    }"`,
  );
}

const allFrontal = cloneArtifact();
for (let index = 1; index <= 8; index += 1) {
  allFrontal.captures[index].condition = {
    distanceLabel: 'standard',
    isReference: false,
    poseLabel: 'frontal',
    repeatGroup: 'frontal-non-reference',
    repeatIndex: 1,
  };
}
expectReplayReadyRejection(
  allFrontal,
  'capture 2 condition must match canonical Phase 1 shot p1-02-yaw-left-moderate',
  'All-frontal shots 2-9 must be rejected',
);

const misordered = cloneArtifact();
misordered.captures = [
  misordered.captures[0],
  ...misordered.captures.slice(1, 9).reverse(),
  misordered.captures[9],
];
expectReplayReadyRejection(
  misordered,
  'capture 2 condition must match canonical Phase 1 shot p1-02-yaw-left-moderate',
  'Misordered shots 2-9 must be rejected',
);

for (let index = 1; index <= 8; index += 1) {
  const mislabeled = cloneArtifact();
  mislabeled.captures[index].condition.poseLabel =
    `mislabeled-shot-${index + 1}`;
  expectReplayReadyRejection(
    mislabeled,
    `capture ${index + 1} condition must match canonical Phase 1 shot ${
      PHASE1_REPLAY_SHOTS[index].collection.shotId
    }`,
    `Mislabeled shot ${index + 1} must be rejected`,
  );
}

const invalidPath = join(tempRoot, 'invalid-privacy.json');
const invalid = JSON.parse(readFileSync(artifactPath, 'utf8'));
invalid.privacy.productPayloadIncluded = true;
writeFileSync(invalidPath, JSON.stringify(invalid));
const invalidRun = spawnSync(
  process.execPath,
  [
    'scripts/face-ratio/replay-phase1-pose-normalization.mjs',
    '--input',
    invalidPath,
  ],
  {cwd: repoRoot, encoding: 'utf8'},
);
expect(
  invalidRun.status !== 0 &&
    invalidRun.stderr.includes('productPayloadIncluded must be false'),
  'Replay must reject artifacts that claim product-payload inclusion.',
);

const singleReferencePath = join(tempRoot, 'invalid-single-reference.json');
const singleReference = JSON.parse(readFileSync(artifactPath, 'utf8'));
singleReference.captures.find(
  capture => capture.captureId === 'cap_reference_002',
).condition.isReference = false;
writeFileSync(singleReferencePath, JSON.stringify(singleReference));
const singleReferenceRun = spawnSync(
  process.execPath,
  [
    'scripts/face-ratio/replay-phase1-pose-normalization.mjs',
    '--input',
    singleReferencePath,
  ],
  {cwd: repoRoot, encoding: 'utf8'},
);
expect(
  singleReferenceRun.status !== 0 &&
    singleReferenceRun.stderr.includes(
      'capture 10 condition must match canonical Phase 1 shot p1-10-frontal-standard-reference-b',
    ),
  'Replay-ready input must require the exact canonical reference B tuple.',
);

const incompletePath = join(tempRoot, 'invalid-incomplete-session.json');
const incomplete = JSON.parse(readFileSync(artifactPath, 'utf8'));
incomplete.captures = incomplete.captures.slice(0, 9);
writeFileSync(incompletePath, JSON.stringify(incomplete));
const incompleteRun = spawnSync(
  process.execPath,
  [
    'scripts/face-ratio/replay-phase1-pose-normalization.mjs',
    '--input',
    incompletePath,
  ],
  {cwd: repoRoot, encoding: 'utf8'},
);
expect(
  incompleteRun.status !== 0 &&
    incompleteRun.stderr.includes(
      'requires exactly 10 ordered Phase 1 captures',
    ),
  'Replay-ready input must reject an incomplete Phase 1 session.',
);

const unitySource = readFileSync(
  join(
    repoRoot,
    'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/StillFaceLandmarkService.cs',
  ),
  'utf8',
);
expect(
  unitySource.includes('\\"transformationMatrix\\"') &&
    unitySource.includes('\\"layout\\":\\"row-major\\"') &&
    [
      'Num(m.m00)',
      'Num(m.m01)',
      'Num(m.m02)',
      'Num(m.m03)',
      'Num(m.m10)',
      'Num(m.m11)',
      'Num(m.m12)',
      'Num(m.m13)',
      'Num(m.m20)',
      'Num(m.m21)',
      'Num(m.m22)',
      'Num(m.m23)',
      'Num(m.m30)',
      'Num(m.m31)',
      'Num(m.m32)',
      'Num(m.m33)',
    ].every(token => unitySource.includes(token)),
  'Unity still-landmark wire must retain the full row-major 4x4 matrix.',
);

const nativeAnalyzerSource = readFileSync(
  join(repoRoot, 'apps/mobile/ios/AURA/AURAFaceRatioAnalyzer.m'),
  'utf8',
);
expect(
  !nativeAnalyzerSource.includes('keypoints[@"hApprox"]') &&
    nativeAnalyzerSource.includes('보정 전 좌표만 방출'),
  'Native payload must remove hApprox and keep overlay/bbox points in the original frame.',
);

const serviceSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-ratio/services/faceVerticalThirdsService.ts',
  ),
  'utf8',
);
expect(
  serviceSource.includes('keypoints: displayKeypoints') &&
    serviceSource.includes('measurementGeometry.debugPoints') &&
    serviceSource.includes('pose_normalization_confidence_unvalidated') &&
    serviceSource.includes('saveFaceRatioPhase1ReplayArtifact') &&
    serviceSource.includes('pose_normalization_replay_metadata_missing'),
  'Runtime integration must store original-frame keypoints while measuring on the normalized frame.',
);
const qualityGateIndex = serviceSource.indexOf(
  'const qualityGate = evaluateFaceVerticalThirdsQuality',
);
const faceLengthIndex = serviceSource.indexOf('const faceLength = computeFaceLength');
const replayAppendIndex = serviceSource.indexOf(
  'await saveFaceRatioPhase1ReplayArtifact',
  faceLengthIndex,
);
const replayAppendGuard = serviceSource.slice(
  serviceSource.lastIndexOf('if (', replayAppendIndex),
  replayAppendIndex,
);
expect(
  qualityGateIndex >= 0 &&
    faceLengthIndex > qualityGateIndex &&
    replayAppendIndex > faceLengthIndex &&
    replayAppendGuard.includes('qualityGate.quality.usable') &&
    replayAppendGuard.includes("measurementMode === 'full_vertical_thirds'") &&
    replayAppendGuard.includes('faceLength') &&
    serviceSource.includes('\n      faceLength,\n'),
  'Raw replay append must occur only after a usable full measurement has one shared faceLength result.',
);
expect(
  serviceSource.includes(
    'debugArtifacts: input.validationReplay ? false : input.debugArtifacts',
  ),
  'Validation replay must disable native tmp matte/debug artifact generation.',
);

const screenSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-ratio/screens/FaceVerticalThirdsScreen.tsx',
  ),
  'utf8',
);
expect(
  screenSource.includes(
    'onAnalysisResult?: (result: FaceVerticalThirdsResult) => void',
  ) &&
    screenSource.includes('reportedAnalysisResultKeyRef.current !== analysisResultKey') &&
    screenSource.includes('onAnalysisResultRef.current?.(nextResult)'),
  'Lab screen contract must report one terminal analysis result per capture.',
);

const labSource = readFileSync(
  join(repoRoot, 'apps/mobile/src/app/experiments/FaceCaptureLabApp.tsx'),
  'utf8',
);
expect(
  labSource.includes(
    "type FaceCaptureLabMode = UnifiedFaceCaptureLabMode | 'phase1-replay-10'",
  ) &&
    labSource.includes('isFaceRatioPoseNormalizationEnabled()') &&
    labSource.includes("if (labMode === 'phase1-replay-10')") &&
    labSource.includes('<Phase1ShotGuide shotIndex={phase1Sequence.shotIndex} />'),
  'The validation-only Phase 1 mode must be explicitly selectable and show shot guidance before capture.',
);
expect(
  labSource.includes('if (phase1RawSaved)') &&
    labSource.includes(
      'setPhase1RawSaved(isFaceRatioPhase1ReplayShotComplete(result))',
    ) &&
    labSource.includes('setPhase1Completed(true)') &&
    labSource.includes(
      'Phase 1의 10개 raw replay 저장이 끝났습니다. 다음 순서는 Exact 30',
    ),
  'The Phase 1 lab must advance only after raw replay storage and hand off explicitly to Exact 30.',
);
expect(
  labSource.includes(
    "import phase1ReplayShotPlan from '../../features/face-ratio/phase1ReplayShotPlan.json'",
  ) && labSource.includes('phase1ReplayShotPlan.shots.map'),
  'The in-app Phase 1 sequence must read the canonical shot-plan JSON.',
);

const replayCoreSource = readFileSync(
  join(repoRoot, 'scripts/face-ratio/phase1-replay-core.mjs'),
  'utf8',
);
const collectionPlanSource = readFileSync(
  join(repoRoot, 'scripts/face3d/prepare-face-measurement-collection.mjs'),
  'utf8',
);
expect(
  replayCoreSource.includes(
    "from './phase1-replay-shot-plan.mjs'",
  ) &&
    replayCoreSource.includes('phase1ReplayConditionsMatch') &&
    collectionPlanSource.includes(
      "from '../face-ratio/phase1-replay-shot-plan.mjs'",
    ) &&
    collectionPlanSource.includes('PHASE1_REPLAY_SHOTS.map'),
  'Replay validation and collection preparation must share the canonical Phase 1 shot plan.',
);

const artifactSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-ratio/services/faceVerticalThirdsArtifacts.ts',
  ),
  'utf8',
);
const artifactContractSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-ratio/services/faceRatioPhase1ReplayArtifact.ts',
  ),
  'utf8',
);
expect(
  artifactSource.includes('isFaceRatioPhase1ReplayShotComplete') &&
    artifactSource.includes("result.status === 'full_success'") &&
    artifactSource.includes(
      "result.measurementMode === 'full_vertical_thirds'",
    ) &&
    artifactSource.includes('result.quality.usable') &&
    artifactSource.includes('result.verticalThirds') &&
    artifactSource.includes('result.faceLength'),
  'A blocked or incomplete measurement must not consume a Phase 1 shot.',
);
expect(
  artifactSource.includes('face-ratio-phase1-validation/') &&
    artifactSource.includes('source image URI나 제품 payload는 저장하지 않는다') &&
    artifactSource.includes('pruneExpiredFaceRatioPhase1ReplayArtifacts') &&
    artifactContractSource.includes('rawFaceDataIncluded: true') &&
    artifactContractSource.includes('productPayloadIncluded: false') &&
    artifactContractSource.includes('sourceImagesIncluded: false') &&
    !artifactContractSource.includes('imageUri'),
  'Runtime writer must use a dedicated local path, omit product/source payloads, and prune expired artifacts.',
);
expect(
  artifactSource.includes('deleteFaceRatioPhase1LocalCapture') &&
    artifactContractSource.includes('isFaceRatioPhase1LocalCaptureUri') &&
    artifactContractSource.includes('PHASE1_LOCAL_CAPTURE_FILE_PATTERN') &&
    labSource.includes('releasePhase1LocalCapture(captureToRelease)') &&
    labSource.includes(
      'void deleteFaceRatioPhase1LocalCapture(captureToRelease.imageUri)',
    ),
  'Phase 1 retake/advance/change-mode must best-effort delete only the native local tmp capture.',
);
expect(
  serviceSource.includes('input.validationReplay') &&
    serviceSource.includes(': await saveSourceImage(input.sessionId, input.imageUri)') &&
    serviceSource.includes('if (!input.validationReplay)') &&
    screenSource.includes('validationReplay ||') &&
    screenSource.includes(
      '[imageLoaded, result, stageLaidOut, validationReplay]',
    ),
  'Validation replay must not copy source/debug/overlay images outside the retention root.',
);

console.log('Phase 1 face-ratio replay contract tests passed');
