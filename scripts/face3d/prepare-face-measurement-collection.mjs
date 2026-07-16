#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  PHASE1_REPLAY_SHOTS,
  phase1ReplayConditionsMatch,
} from '../face-ratio/phase1-replay-shot-plan.mjs';

export const FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION =
  'aura.face-measurement-collection-plan.v2';
export const FACE_MEASUREMENT_PHASE1_ACQUISITION = Object.freeze({
  cameraFacing: 'front',
  captureImplementation: 'native',
  source: 'camera',
});

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requirePseudonymousId(value, label, prefix) {
  requireCondition(
    typeof value === 'string'
      && value.startsWith(prefix)
      && value.length >= prefix.length + 8
      && value.length <= 128
      && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value),
    `${label}는 ${prefix} prefix의 가명 ASCII ID여야 합니다.`,
  );
  if (prefix === 'subj_') {
    requireCondition(
      !value.startsWith('subj_user_'),
      `${label}는 제품 user UUID 문맥이 아닌 로컬 전용 subj_ 가명이어야 합니다.`,
    );
  }
}

function pathsOverlap(left, right) {
  const leftRelative = path.relative(left, right);
  const rightRelative = path.relative(right, left);
  return (
    left === right
    || leftRelative === ''
    || rightRelative === ''
    || (!leftRelative.startsWith(`..${path.sep}`) && leftRelative !== '..')
    || (!rightRelative.startsWith(`..${path.sep}`) && rightRelative !== '..')
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function phase1CaptureId({
  cohortId,
  index,
  sessionId,
  subjectContextId,
}) {
  const digest = crypto
    .createHash('sha256')
    .update(`${cohortId}\0${subjectContextId}\0${sessionId}\0${index + 1}`)
    .digest('hex')
    .slice(0, 16);
  return `cap_p1_${String(index + 1).padStart(2, '0')}_${digest}`;
}

function phase2ShotId({
  cohortId,
  index,
  sessionId,
  subjectContextId,
}) {
  const digest = crypto
    .createHash('sha256')
    .update(
      `${cohortId}\0${subjectContextId}\0${sessionId}\0phase2\0${index + 1}`,
    )
    .digest('hex')
    .slice(0, 16);
  return (
    `p2-${String(index + 1).padStart(2, '0')}-exact30-frontal-neutral-` +
    digest
  );
}

export function buildFaceMeasurementCollectionPlan({
  cohortId,
  subjectContextId,
  sessionId,
  exact30Repeats,
  rawLandmarkDirectory,
  evidenceDirectory,
  retentionDays,
  now = new Date(),
}) {
  requirePseudonymousId(cohortId, 'cohortId', 'cohort_');
  requirePseudonymousId(subjectContextId, 'subjectContextId', 'subj_');
  requirePseudonymousId(sessionId, 'sessionId', 'session_');
  requireCondition(
    Number.isInteger(exact30Repeats) && exact30Repeats >= 3 && exact30Repeats <= 12,
    'exact30Repeats는 명시적인 3~12 정수여야 합니다.',
  );
  requireCondition(
    Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 30,
    'retentionDays는 명시적인 1~30 정수여야 합니다.',
  );
  requireCondition(now instanceof Date && Number.isFinite(now.getTime()), 'now가 유효하지 않습니다.');
  const resolvedRawDirectory = path.resolve(rawLandmarkDirectory);
  const resolvedEvidenceDirectory = path.resolve(evidenceDirectory);
  requireCondition(
    !pathsOverlap(resolvedRawDirectory, resolvedEvidenceDirectory),
    '원시 랜드마크 디렉터리와 repeatability evidence 디렉터리는 중첩되면 안 됩니다.',
  );

  const deleteBy = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  const phase1 = PHASE1_REPLAY_SHOTS.map((shot, index) => {
    return {
      order: index + 1,
      phase: 'phase1_pose_distance',
      mode: 'native_face_ratio_capture',
      subjectContextId,
      sessionId,
      rawLandmarkReplayRequired: true,
      productPayloadAllowed: false,
      uploadAllowed: false,
      ...shot.collection,
      phase1ReplayValidation: {
        acquisition: {...FACE_MEASUREMENT_PHASE1_ACQUISITION},
        captureId: phase1CaptureId({
          cohortId,
          index,
          sessionId,
          subjectContextId,
        }),
        cohortId,
        condition: {...shot.condition},
        retentionDays,
        sessionId,
        subjectId: subjectContextId,
      },
    };
  });
  requireCondition(
    phase1.filter(shot => shot.phase1ReplayValidation.condition.isReference).length === 2,
    'Phase 1 replay-ready 계획은 reference A/B를 정확히 두 개 가져야 합니다.',
  );
  const exact30 = Array.from({length: exact30Repeats}, (_unused, index) => ({
    order: PHASE1_REPLAY_SHOTS.length + index + 1,
    phase: 'phase2_exact30_baseline',
    mode: 'unified_face_capture_lab',
    subjectContextId,
    sessionId,
    shotId: phase2ShotId({
      cohortId,
      index,
      sessionId,
      subjectContextId,
    }),
    pose: 'frontal',
    distance: 'standard',
    shotKind: 'neutral',
    collectionPolicyId: 'diagnostics-exact-30-v1',
    expectedEventType: 'unified_face_capture_completed',
    requiredValidFrameCount: 30,
    requiredTargetFrameCount: 30,
    rawLandmarkReplayRequired: false,
    productPromotionAllowed: false,
    uploadAllowed: false,
  }));

  return {
    schemaVersion: FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION,
    generatedAtUtc: now.toISOString(),
    executionMode: 'dry_run_only',
    cohortId,
    subjectContextId,
    sessionId,
    orderingContract:
      'Phase 1 ten pose/distance captures first; diagnostics-exact-30-v1 frontal repeats second',
    privacy: {
      subjectIdentity: 'pseudonymous_only',
      rawLandmarks: {
        localOnly: true,
        separatedFromProductPayload: true,
        directory: resolvedRawDirectory,
        createdAtUtc: now.toISOString(),
        retentionDays,
        deleteByUtc: deleteBy.toISOString(),
        uploadAllowed: false,
      },
      repeatabilityEvidence: {
        rawFaceDataIncluded: false,
        directory: resolvedEvidenceDirectory,
      },
      deletionVerificationRequired: true,
    },
    phase1: {
      shotCount: phase1.length,
      gatePurpose: 'paired before/after replay for MAD reduction and frontal convergence MAE',
      replayArtifactWriteContract: {
        artifactCreatedAtUtc: now.toISOString(),
        captureTimestampField: 'capturedAtUtc',
        captureTimestampSource: 'runtime_at_capture',
        cohortId,
        deleteByUtc: deleteBy.toISOString(),
        referenceCaptureCount: 2,
        retentionDays,
        sessionId,
      },
      shots: phase1,
    },
    phase2: {
      exact30RepeatCount: exact30Repeats,
      collectionPolicyId: 'diagnostics-exact-30-v1',
      productPromotionAllowed: false,
      shots: exact30,
    },
    sequence: [...phase1, ...exact30],
    deviceActionsExecuted: false,
  };
}

export function validateFaceMeasurementCollectionPlan(plan) {
  requireCondition(isRecord(plan), 'collection plan은 object여야 합니다.');
  requireCondition(
    plan.schemaVersion === FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION,
    `collection plan schemaVersion은 ${FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION}이어야 합니다.`,
  );
  requireCondition(
    plan.executionMode === 'dry_run_only',
    'collection plan executionMode는 dry_run_only여야 합니다.',
  );
  requirePseudonymousId(plan.cohortId, 'cohortId', 'cohort_');
  requirePseudonymousId(
    plan.subjectContextId,
    'subjectContextId',
    'subj_',
  );
  requirePseudonymousId(plan.sessionId, 'sessionId', 'session_');
  requireCondition(
    isRecord(plan.phase1) &&
      plan.phase1.shotCount === PHASE1_REPLAY_SHOTS.length &&
      Array.isArray(plan.phase1.shots) &&
      plan.phase1.shots.length === PHASE1_REPLAY_SHOTS.length,
    'collection plan Phase 1은 canonical 10-shot이어야 합니다.',
  );
  requireCondition(
    isRecord(plan.privacy) &&
      isRecord(plan.privacy.rawLandmarks) &&
      Number.isInteger(plan.privacy.rawLandmarks.retentionDays) &&
      plan.privacy.rawLandmarks.retentionDays >= 1 &&
      plan.privacy.rawLandmarks.retentionDays <= 30 &&
      typeof plan.privacy.rawLandmarks.deleteByUtc === 'string' &&
      Number.isFinite(Date.parse(plan.privacy.rawLandmarks.deleteByUtc)),
    'collection plan raw-landmark retention이 유효하지 않습니다.',
  );
  requireCondition(
    isRecord(plan.phase2) &&
      Number.isInteger(plan.phase2.exact30RepeatCount) &&
      plan.phase2.exact30RepeatCount >= 3 &&
      plan.phase2.exact30RepeatCount <= 12 &&
      Array.isArray(plan.phase2.shots) &&
      plan.phase2.shots.length === plan.phase2.exact30RepeatCount &&
      Array.isArray(plan.sequence) &&
      plan.sequence.length ===
        PHASE1_REPLAY_SHOTS.length + plan.phase2.exact30RepeatCount,
    'collection plan sequence 길이가 Phase 1/2와 일치하지 않습니다.',
  );

  const captureIds = new Set();
  plan.phase1.shots.forEach((shot, index) => {
    const expected = PHASE1_REPLAY_SHOTS[index];
    const validation = shot?.phase1ReplayValidation;
    requireCondition(
      shot?.order === index + 1 &&
        shot?.phase === 'phase1_pose_distance' &&
        shot?.mode === 'native_face_ratio_capture' &&
        shot?.shotId === expected.collection.shotId,
      `collection plan Phase 1 shot ${index + 1} order/mode/shotId가 canonical plan과 다릅니다.`,
    );
    requireCondition(
      isRecord(validation) &&
        canonicalJson(validation.acquisition) ===
          canonicalJson(FACE_MEASUREMENT_PHASE1_ACQUISITION) &&
        typeof validation.captureId === 'string' &&
        /^cap_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(
          validation.captureId,
        ) &&
        validation.cohortId === plan.cohortId &&
        validation.subjectId === plan.subjectContextId &&
        validation.sessionId === plan.sessionId &&
        validation.retentionDays ===
          plan.privacy.rawLandmarks.retentionDays &&
        phase1ReplayConditionsMatch(
          validation.condition,
          expected.condition,
        ),
      `collection plan Phase 1 shot ${index + 1} validation tuple이 유효하지 않습니다.`,
    );
    requireCondition(
      !captureIds.has(validation.captureId),
      `collection plan captureId가 중복됩니다: ${validation.captureId}`,
    );
    captureIds.add(validation.captureId);
    requireCondition(
      canonicalJson(plan.sequence[index]) === canonicalJson(shot),
      `collection plan sequence[${index}]가 Phase 1 shot과 일치하지 않습니다.`,
    );
  });

  requireCondition(
    plan.phase1.shots.filter(
      shot => shot.phase1ReplayValidation.condition.isReference,
    ).length === 2,
    'collection plan Phase 1 reference A/B는 정확히 두 개여야 합니다.',
  );
  plan.phase2.shots.forEach((shot, index) => {
    const sequenceIndex = PHASE1_REPLAY_SHOTS.length + index;
    requireCondition(
      shot?.order === sequenceIndex + 1 &&
        shot?.phase === 'phase2_exact30_baseline' &&
        shot?.mode === 'unified_face_capture_lab' &&
        shot?.subjectContextId === plan.subjectContextId &&
        shot?.sessionId === plan.sessionId &&
        shot?.shotId === phase2ShotId({
          cohortId: plan.cohortId,
          index,
          sessionId: plan.sessionId,
          subjectContextId: plan.subjectContextId,
        }) &&
        shot?.collectionPolicyId === 'diagnostics-exact-30-v1' &&
        shot?.expectedEventType === 'unified_face_capture_completed' &&
        shot?.requiredValidFrameCount === 30 &&
        shot?.requiredTargetFrameCount === 30 &&
        shot?.uploadAllowed === false &&
        canonicalJson(plan.sequence[sequenceIndex]) ===
          canonicalJson(shot),
      `collection plan Phase 2 shot ${index + 1} exact-30 sequence가 유효하지 않습니다.`,
    );
  });

  return plan;
}

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  requireCondition(index !== -1 && typeof argv[index + 1] === 'string', `${flag} 값이 없습니다.`);
  return argv[index + 1];
}

function parseArguments(argv) {
  requireCondition(argv.includes('--dry-run'), '--dry-run이 없으면 실행하지 않습니다.');
  return {
    cohortId: readFlag(argv, '--cohort-id'),
    subjectContextId: readFlag(argv, '--subject-id'),
    sessionId: readFlag(argv, '--session-id'),
    exact30Repeats: Number(readFlag(argv, '--exact30-repeats')),
    rawLandmarkDirectory: readFlag(argv, '--raw-landmark-dir'),
    evidenceDirectory: readFlag(argv, '--evidence-dir'),
    retentionDays: Number(readFlag(argv, '--retention-days')),
    outputPath: path.resolve(readFlag(argv, '--output')),
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  requireCondition(!fs.existsSync(options.outputPath), `output이 이미 있습니다: ${options.outputPath}`);
  const plan = buildFaceMeasurementCollectionPlan(options);
  validateFaceMeasurementCollectionPlan(plan);
  fs.mkdirSync(path.dirname(options.outputPath), {recursive: true});
  fs.writeFileSync(options.outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(`얼굴 측정 Phase 1→exact-30 로컬 수집 dry-run 계획 생성: ${options.outputPath}`);
  console.log(
    `device actions=0; Phase 1=${plan.phase1.shotCount} shots; `
      + `exact-30=${plan.phase2.exact30RepeatCount} repeats`,
  );
  console.log(
    '실기기 수집 전 별도 fail-closed 검사: '
      + 'npm run face3d:collection:preflight (자동 Unity 빌드/기기 동작 없음)',
  );
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `얼굴 측정 수집 계획 생성 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
