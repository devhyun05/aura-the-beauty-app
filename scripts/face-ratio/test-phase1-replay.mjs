import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';

import {
  appendPhase1ReplayCapture,
  isPhase1ReplayArtifactExpired,
  validatePhase1ReplayArtifact,
} from './phase1-replay-core.mjs';
import {
  PHASE1_REPLAY_LOCK_SUFFIX,
  PHASE1_REPLAY_TEMP_MARKER,
} from './phase1-replay-file-store.mjs';
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

function run(script, args, expectedStatus = 0, environment = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AURA_PHASE1_REPLAY_TEST_NOW_UTC: '2026-07-17T12:00:00.000Z',
      ...environment,
    },
  });
  expect(
    result.status === expectedStatus,
    `${script} status=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`,
  );
  return result;
}

function runAsync(script, args, environment = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AURA_PHASE1_REPLAY_TEST_NOW_UTC:
          '2026-07-17T12:00:00.000Z',
        ...environment,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', rejectPromise);
    child.on('close', status => {
      resolvePromise({status, stderr, stdout});
    });
  });
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
      acquisition: {
        cameraFacing: 'front',
        captureImplementation: 'native',
        source: 'camera',
      },
      artifactCreatedAtUtc: '2026-07-17T00:00:00.000Z',
      capturedAtUtc: new Date(
        Date.parse('2026-07-17T00:00:00.000Z') +
          samples.indexOf(sample) * 60_000,
      ).toISOString(),
      cohortId: 'cohort_synthetic_phase1',
      captureId: sample.captureId,
      deleteAfterDays: 7,
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

const replayArtifact = cloneArtifact();
const firstCapture = replayArtifact.captures[0];
const reorderedFirstCapture = {
  transformationMatrix: firstCapture.transformationMatrix,
  subjectId: firstCapture.subjectId,
  landmarks: firstCapture.landmarks,
  imageWidth: firstCapture.imageWidth,
  imageHeight: firstCapture.imageHeight,
  hairline: firstCapture.hairline,
  condition: firstCapture.condition,
  capturedAtUtc: firstCapture.capturedAtUtc,
  captureId: firstCapture.captureId,
  acquisition: {
    source: 'camera',
    captureImplementation: 'native',
    cameraFacing: 'front',
  },
};
expect(
  appendPhase1ReplayCapture(replayArtifact, reorderedFirstCapture) ===
    replayArtifact,
  'Canonically identical captureId payload must be an idempotent no-op.',
);
let conflictingCaptureError = null;
try {
  appendPhase1ReplayCapture(replayArtifact, {
    ...firstCapture,
    imageWidth: firstCapture.imageWidth + 1,
  });
} catch (error) {
  conflictingCaptureError = error;
}
expect(
  conflictingCaptureError instanceof Error &&
    conflictingCaptureError.message.includes(
      'already exists with a different payload',
    ),
  'Conflicting payload for an existing captureId must fail closed.',
);

const prepareScript =
  'scripts/face-ratio/prepare-phase1-replay-artifact.mjs';
const cleanupScript =
  'scripts/face-ratio/prune-phase1-replay-artifacts.mjs';
const firstResponsePath = join(
  tempRoot,
  `${samples[0].captureId}-response.json`,
);
const firstMetadataPath = join(
  tempRoot,
  `${samples[0].captureId}-metadata.json`,
);
const secondResponsePath = join(
  tempRoot,
  `${samples[1].captureId}-response.json`,
);
const secondMetadataPath = join(
  tempRoot,
  `${samples[1].captureId}-metadata.json`,
);

const implicitRetentionMetadataPath = join(
  tempRoot,
  'implicit-retention-metadata.json',
);
const implicitRetentionMetadata = JSON.parse(
  readFileSync(firstMetadataPath, 'utf8'),
);
delete implicitRetentionMetadata.deleteAfterDays;
writeFileSync(
  implicitRetentionMetadataPath,
  JSON.stringify(implicitRetentionMetadata),
);
const implicitRetentionRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    implicitRetentionMetadataPath,
    '--output',
    join(tempRoot, 'implicit-retention', 'phase1-replay.json'),
  ],
  1,
);
expect(
  implicitRetentionRun.stderr.includes(
    'explicit deleteAfterDays in [1, 30]',
  ),
  'The official writer must reject an implicit retention default.',
);

const productUserMetadataPath = join(
  tempRoot,
  'product-user-context-metadata.json',
);
writeFileSync(
  productUserMetadataPath,
  JSON.stringify({
    ...JSON.parse(readFileSync(firstMetadataPath, 'utf8')),
    subjectId: 'subj_user_12345678',
  }),
);
const productUserRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    productUserMetadataPath,
    '--output',
    join(tempRoot, 'product-user-context', 'phase1-replay.json'),
  ],
  1,
);
expect(
  productUserRun.stderr.includes('must not use subj_user_*'),
  'The official writer must reject product-account subject identifiers.',
);

const repoLocalReplayRoot = join(
  repoRoot,
  'local-face-measurement',
);
const repoLocalSymlinkPath = join(
  repoLocalReplayRoot,
  `phase1-test-link-${basename(tempRoot)}`,
);
const symlinkEscapeTarget = join(tempRoot, 'writer-symlink-escape-target');
mkdirSync(repoLocalReplayRoot, {recursive: true});
mkdirSync(symlinkEscapeTarget, {recursive: true});
symlinkSync(symlinkEscapeTarget, repoLocalSymlinkPath, 'dir');
const symlinkEscapeOutput = join(
  repoLocalSymlinkPath,
  'phase1-replay.json',
);
const symlinkEscapeRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    firstMetadataPath,
    '--output',
    symlinkEscapeOutput,
  ],
  1,
);
expect(
  symlinkEscapeRun.stderr.includes('must not traverse a symlink') &&
    !existsSync(join(symlinkEscapeTarget, 'phase1-replay.json')),
  'The official writer must reject an intermediate symlink under an allowed repo-local root.',
);
unlinkSync(repoLocalSymlinkPath);

const idempotentBytesBefore = readFileSync(artifactPath, 'utf8');
const idempotentRun = run(prepareScript, [
  '--response',
  firstResponsePath,
  '--metadata',
  firstMetadataPath,
  '--output',
  artifactPath,
]);
expect(
  idempotentRun.stdout.includes('idempotent unchanged') &&
    readFileSync(artifactPath, 'utf8') === idempotentBytesBefore,
  'The official CLI writer must skip an identical capture without rewriting the artifact.',
);
expect(
  !existsSync(`${artifactPath}${PHASE1_REPLAY_LOCK_SUFFIX}`),
  'The official CLI writer must release its owned lock after an idempotent write.',
);

const conflictingResponsePath = join(
  tempRoot,
  'conflicting-existing-response.json',
);
const conflictingResponse = JSON.parse(
  readFileSync(firstResponsePath, 'utf8'),
);
conflictingResponse.imageWidth += 1;
writeFileSync(conflictingResponsePath, JSON.stringify(conflictingResponse));
const conflictBytesBefore = readFileSync(artifactPath, 'utf8');
const conflictingWriterRun = run(
  prepareScript,
  [
    '--response',
    conflictingResponsePath,
    '--metadata',
    firstMetadataPath,
    '--output',
    artifactPath,
  ],
  1,
);
expect(
  conflictingWriterRun.stderr.includes(
    'already exists with a different payload',
  ) &&
    readFileSync(artifactPath, 'utf8') === conflictBytesBefore &&
    !existsSync(`${artifactPath}${PHASE1_REPLAY_LOCK_SUFFIX}`),
  'The official CLI writer must reject a conflicting capture and release its lock without changing prior bytes.',
);

const interruptedMetadataPath = join(
  tempRoot,
  'interrupted-new-capture-metadata.json',
);
writeFileSync(
  interruptedMetadataPath,
  JSON.stringify({
    ...JSON.parse(readFileSync(firstMetadataPath, 'utf8')),
    captureId: 'cap_interrupted_write_001',
    capturedAtUtc: '2026-07-17T01:00:00.000Z',
  }),
);
const interruptedBytesBefore = readFileSync(artifactPath, 'utf8');
const interruptedRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    interruptedMetadataPath,
    '--output',
    artifactPath,
  ],
  1,
  {AURA_PHASE1_REPLAY_TEST_FAIL_BEFORE_RENAME: '1'},
);
const interruptedTempPrefix =
  `.${basename(artifactPath)}${PHASE1_REPLAY_TEMP_MARKER}`;
expect(
  interruptedRun.stderr.includes(
    'Injected Phase 1 replay failure before atomic rename',
  ) &&
    readFileSync(artifactPath, 'utf8') === interruptedBytesBefore &&
    !existsSync(`${artifactPath}${PHASE1_REPLAY_LOCK_SUFFIX}`) &&
    !readdirSync(dirname(artifactPath)).some(name =>
      name.startsWith(interruptedTempPrefix),
    ),
  'A failure after temp fsync but before rename must preserve the prior artifact and clean temp/lock state.',
);

const concurrentArtifactPath = join(
  tempRoot,
  'concurrent',
  'phase1-replay.json',
);
const concurrentArgs = (responsePath, metadataPath) => [
  '--response',
  responsePath,
  '--metadata',
  metadataPath,
  '--output',
  concurrentArtifactPath,
];
const [concurrentFirst, concurrentSecond] = await Promise.all([
  runAsync(
    prepareScript,
    concurrentArgs(firstResponsePath, firstMetadataPath),
  ),
  runAsync(
    prepareScript,
    concurrentArgs(secondResponsePath, secondMetadataPath),
  ),
]);
expect(
  concurrentFirst.status === 0 && concurrentSecond.status === 0,
  `Concurrent writers must both finish successfully.\n` +
    `first=${concurrentFirst.stderr}\nsecond=${concurrentSecond.stderr}`,
);
const concurrentArtifact = validatePhase1ReplayArtifact(
  JSON.parse(readFileSync(concurrentArtifactPath, 'utf8')),
);
expect(
  concurrentArtifact.captures.length === 2 &&
    new Set(concurrentArtifact.captures.map(capture => capture.captureId))
      .size === 2 &&
    concurrentArtifact.captures.some(
      capture => capture.captureId === samples[0].captureId,
    ) &&
    concurrentArtifact.captures.some(
      capture => capture.captureId === samples[1].captureId,
    ) &&
    !existsSync(
      `${concurrentArtifactPath}${PHASE1_REPLAY_LOCK_SUFFIX}`,
    ),
  'Cross-process serialization must retain both concurrent captures without lost updates or leftover locks.',
);

function createSyntheticLock(outputPath, acquiredAtUtc) {
  const lockPath = `${outputPath}${PHASE1_REPLAY_LOCK_SUFFIX}`;
  mkdirSync(dirname(outputPath), {recursive: true});
  mkdirSync(lockPath);
  writeFileSync(
    join(lockPath, 'owner.json'),
    JSON.stringify({
      acquiredAtUtc,
      hostname: 'synthetic-test',
      pid: 999_999,
      token: 'synthetic-owner-token',
    }),
  );
  return lockPath;
}

function removeSyntheticLock(lockPath) {
  unlinkSync(join(lockPath, 'owner.json'));
  rmdirSync(lockPath);
}

const staleOutputPath = join(tempRoot, 'stale-lock', 'phase1-replay.json');
const staleLockPath = createSyntheticLock(
  staleOutputPath,
  '2026-01-01T00:00:00.000Z',
);
const staleLockRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    firstMetadataPath,
    '--output',
    staleOutputPath,
  ],
  1,
  {
    AURA_PHASE1_REPLAY_LOCK_TIMEOUT_MS: '100',
    AURA_PHASE1_REPLAY_STALE_LOCK_MS: '10',
  },
);
expect(
  staleLockRun.stderr.includes('Stale Phase 1 replay lock detected') &&
    existsSync(staleLockPath) &&
    !existsSync(staleOutputPath),
  'A stale lock must fail closed without stealing the lock or writing an artifact.',
);
removeSyntheticLock(staleLockPath);

const timeoutOutputPath = join(
  tempRoot,
  'bounded-lock-timeout',
  'phase1-replay.json',
);
const timeoutLockPath = createSyntheticLock(
  timeoutOutputPath,
  new Date().toISOString(),
);
const timeoutRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    firstMetadataPath,
    '--output',
    timeoutOutputPath,
  ],
  1,
  {
    AURA_PHASE1_REPLAY_LOCK_TIMEOUT_MS: '50',
    AURA_PHASE1_REPLAY_STALE_LOCK_MS: '60000',
  },
);
expect(
  timeoutRun.stderr.includes('Timed out after 50ms') &&
    existsSync(timeoutLockPath) &&
    !existsSync(timeoutOutputPath),
  'A live lock must stop after the bounded timeout without stealing it.',
);
removeSyntheticLock(timeoutLockPath);

const expiryBoundaryArtifact = cloneArtifact();
expect(
  !isPhase1ReplayArtifactExpired(
    expiryBoundaryArtifact,
    new Date(
      Date.parse(
        expiryBoundaryArtifact.privacy.retention.deleteByUtc,
      ) - 1,
    ).toISOString(),
  ) &&
    isPhase1ReplayArtifactExpired(
      expiryBoundaryArtifact,
      expiryBoundaryArtifact.privacy.retention.deleteByUtc,
    ),
  'Retention must expire exactly at deleteByUtc.',
);

function artifactWithRetention(createdAtUtc, deleteAfterDays = 30) {
  const artifact = cloneArtifact();
  artifact.privacy.retention = {
    createdAtUtc,
    deleteAfterDays,
    deleteByUtc: new Date(
      Date.parse(createdAtUtc) +
        deleteAfterDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    deletionRequired: true,
  };
  return validatePhase1ReplayArtifact(artifact);
}

const expiredWriterPath = join(
  tempRoot,
  'expired-writer',
  'phase1-replay.json',
);
mkdirSync(dirname(expiredWriterPath), {recursive: true});
writeFileSync(
  expiredWriterPath,
  JSON.stringify(artifactWithRetention('2025-01-01T00:00:00.000Z')),
);
const expiredWriterBytes = readFileSync(expiredWriterPath, 'utf8');
const expiredWriterRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    firstMetadataPath,
    '--output',
    expiredWriterPath,
  ],
  1,
);
expect(
  expiredWriterRun.stderr.includes('reached deleteByUtc') &&
    readFileSync(expiredWriterPath, 'utf8') === expiredWriterBytes &&
    !existsSync(`${expiredWriterPath}${PHASE1_REPLAY_LOCK_SUFFIX}`),
  'The official writer must enforce deleteByUtc on its next execution without mutating expired data.',
);

const retentionMismatchWriterPath = join(
  tempRoot,
  'retention-mismatch-writer',
  'phase1-replay.json',
);
mkdirSync(dirname(retentionMismatchWriterPath), {recursive: true});
writeFileSync(
  retentionMismatchWriterPath,
  JSON.stringify(
    artifactWithRetention('2026-07-17T00:00:00.000Z', 6),
  ),
);
const retentionMismatchBytes = readFileSync(
  retentionMismatchWriterPath,
  'utf8',
);
const retentionMismatchRun = run(
  prepareScript,
  [
    '--response',
    firstResponsePath,
    '--metadata',
    firstMetadataPath,
    '--output',
    retentionMismatchWriterPath,
  ],
  1,
);
expect(
  retentionMismatchRun.stderr.includes(
    'metadata retention does not match',
  ) &&
    readFileSync(retentionMismatchWriterPath, 'utf8') ===
      retentionMismatchBytes &&
    !existsSync(
      `${retentionMismatchWriterPath}${PHASE1_REPLAY_LOCK_SUFFIX}`,
    ),
  'The official writer must reject retention metadata conflicts without rewriting.',
);

const cleanupRoot = join(tempRoot, 'cleanup');
const expiredCleanupPath = join(
  cleanupRoot,
  'expired',
  'phase1-replay.json',
);
const corruptCleanupPath = join(
  cleanupRoot,
  'corrupt',
  'phase1-replay.json',
);
const unexpiredCleanupPath = join(
  cleanupRoot,
  'unexpired',
  'phase1-replay.json',
);
const unrelatedCleanupPath = join(cleanupRoot, 'session-plan.json');
const unrelatedEmptyDirectory = join(cleanupRoot, 'unrelated-empty');
for (const path of [
  expiredCleanupPath,
  corruptCleanupPath,
  unexpiredCleanupPath,
]) {
  mkdirSync(dirname(path), {recursive: true});
}
writeFileSync(
  expiredCleanupPath,
  JSON.stringify(artifactWithRetention('2026-07-01T00:00:00.000Z')),
);
writeFileSync(corruptCleanupPath, '{"schemaVersion":');
writeFileSync(
  unexpiredCleanupPath,
  JSON.stringify(artifactWithRetention('2026-08-01T00:00:00.000Z')),
);
writeFileSync(unrelatedCleanupPath, '{"not":"a replay artifact"}');
mkdirSync(unrelatedEmptyDirectory);

const cleanupNow = '2026-08-15T00:00:00.000Z';
const dryRunCleanup = run(cleanupScript, [
  '--root',
  cleanupRoot,
  '--now',
  cleanupNow,
  '--dry-run',
]);
const dryRunSummary = JSON.parse(dryRunCleanup.stdout);
expect(
  dryRunSummary.wouldDelete.length === 2 &&
    existsSync(expiredCleanupPath) &&
    existsSync(corruptCleanupPath) &&
    existsSync(unexpiredCleanupPath),
  'Cleanup dry-run must report expired/corrupt candidates without deleting them.',
);

const defaultCleanup = run(cleanupScript, [
  '--root',
  cleanupRoot,
  '--now',
  cleanupNow,
]);
const defaultCleanupSummary = JSON.parse(defaultCleanup.stdout);
expect(
  defaultCleanupSummary.deleted.some(
    entry => entry.reason === 'expired',
  ) &&
    defaultCleanupSummary.deleted.some(
      entry => entry.reason === 'corrupt',
    ) &&
    !existsSync(expiredCleanupPath) &&
    !existsSync(corruptCleanupPath) &&
    existsSync(unexpiredCleanupPath) &&
    existsSync(unrelatedCleanupPath) &&
    existsSync(unrelatedEmptyDirectory),
  'Default cleanup must delete expired/corrupt replay data while retaining unexpired and unrelated files.',
);

const symlinkCleanupRoot = join(tempRoot, 'cleanup-symlink-rejected');
const symlinkCandidatePath = join(
  symlinkCleanupRoot,
  'phase1-replay.json',
);
mkdirSync(symlinkCleanupRoot, {recursive: true});
writeFileSync(
  symlinkCandidatePath,
  JSON.stringify(artifactWithRetention('2026-07-01T00:00:00.000Z')),
);
const symlinkPath = join(symlinkCleanupRoot, 'escape-link');
symlinkSync(unrelatedCleanupPath, symlinkPath);
const symlinkCleanupRun = run(
  cleanupScript,
  ['--root', symlinkCleanupRoot, '--now', cleanupNow],
  1,
);
expect(
  symlinkCleanupRun.stderr.includes(
    'cleanup tree must not contain symlinks',
  ) && existsSync(symlinkCandidatePath),
  'Cleanup must reject a tree containing a symlink before deleting any replay artifact.',
);
unlinkSync(symlinkPath);

const unsafeRepoCleanupRun = run(
  cleanupScript,
  ['--root', repoRoot, '--now', cleanupNow],
  1,
);
expect(
  unsafeRepoCleanupRun.stderr.includes(
    'repo-local cleanup root must stay under',
  ),
  'Cleanup must reject unsafe repo-local roots before scanning them.',
);

const completionCleanup = run(cleanupScript, [
  '--root',
  cleanupRoot,
  '--now',
  cleanupNow,
  '--all',
]);
const completionCleanupSummary = JSON.parse(completionCleanup.stdout);
expect(
  completionCleanupSummary.deleted.some(
    entry => entry.reason === 'completion',
  ) &&
    !existsSync(unexpiredCleanupPath) &&
    existsSync(unrelatedCleanupPath) &&
    existsSync(unrelatedEmptyDirectory),
  'Completion cleanup --all must delete valid unexpired replay artifacts while preserving unrelated files.',
);

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

for (const [field, invalidValue, expectedMessage] of [
  ['source', 'gallery', 'source must be camera'],
  ['captureImplementation', 'expo', 'captureImplementation must be native'],
  ['cameraFacing', 'back', 'cameraFacing must be front'],
]) {
  const invalidAcquisition = cloneArtifact();
  invalidAcquisition.captures[0].acquisition[field] = invalidValue;
  expectReplayReadyRejection(
    invalidAcquisition,
    expectedMessage,
    `Invalid acquisition ${field} must be rejected`,
  );
}

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

const artifactStoreSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-ratio/services/faceVerticalThirdsArtifacts.ts',
  ),
  'utf8',
);
expect(
  artifactStoreSource.includes(
    'let phase1ReplayStoreTail: Promise<void> = Promise.resolve()',
  ) &&
    artifactStoreSource.includes('withPhase1ReplayStoreLock') &&
    artifactStoreSource.includes(
      'pruneExpiredFaceRatioPhase1ReplayArtifactsUnlocked',
    ) &&
    artifactStoreSource.includes('writePhase1ReplayArtifactAtomically') &&
    artifactStoreSource.includes('if (next !== artifact || !fileInfo.exists)'),
  'Phase 1 replay save must serialize prune/read/append/write and skip identical re-writes.',
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
    screenSource.includes('onAnalysisResultRef.current?.(nextResult)') &&
    screenSource.includes(
      'function LoadingReport({onRetake}: {onRetake?: () => void})',
    ) &&
    screenSource.includes(
      'onRetake={validationReplay ? undefined : onRetake}',
    ),
  'Phase 1 must suppress in-flight retake without regressing the ordinary ratio flow.',
);

const cameraScreenSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/face-capture/screens/CameraFaceCaptureScreen.tsx',
  ),
  'utf8',
);
expect(
  cameraScreenSource.includes(
    "captureImplementation: realtimeCaptureAvailable ? 'native' : 'expo'",
  ) &&
    cameraScreenSource.includes('cameraFacing: cameraDirection') &&
    cameraScreenSource.includes("captureImplementation: 'media-library'"),
  'Camera callback must report the actual facing and capture implementation.',
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
  labSource.includes(
    "allowCameraToggle={labMode !== 'phase1-replay-10'}",
  ) &&
    labSource.includes("allowGallery={labMode !== 'phase1-replay-10'}") &&
    labSource.includes("result.source !== 'camera'") &&
    labSource.includes(
      "runtimeProvenance?.captureImplementation !== 'native'",
    ) &&
    labSource.includes("runtimeProvenance.cameraFacing !== 'front'") &&
    labSource.includes(
      'greenlightReport.nativeCameraMetadata?.captureLockedAtMs',
    ) &&
    labSource.includes('!isRealtimeFaceCaptureAvailable()') &&
    labSource.includes('<Phase1NativeCaptureUnavailable') &&
    labSource.includes(
      'captureImplementation: runtimeProvenance.captureImplementation',
    ) &&
    labSource.includes('cameraFacing: runtimeProvenance.cameraFacing'),
  'Phase 1 must disable alternate acquisition paths and require camera/native/front provenance.',
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
    labSource.includes('releaseLabLocalCapture(captureToRelease)') &&
    labSource.includes('void deleteFaceRatioPhase1LocalCapture(') &&
    labSource.includes('captureToRelease.imageUri'),
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
