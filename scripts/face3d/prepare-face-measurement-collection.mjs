#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {PHASE1_REPLAY_SHOTS} from '../face-ratio/phase1-replay-shot-plan.mjs';

export const FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION =
  'aura.face-measurement-collection-plan.v1';

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
    shotId: `p2-${String(index + 1).padStart(2, '0')}-exact30-frontal-neutral`,
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
