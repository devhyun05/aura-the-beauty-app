#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  FACE3D_METRIC_KEYS,
  analyzeRepeatability,
  extractMetricsFromProfile,
  median,
  validateRepeatabilityManifest,
} from './analyze-repeatability.mjs';
import {
  FACE3D_CALIBRATION_FRAME_COUNTS,
  FACE3D_CALIBRATION_RECEIPT_SCHEMA_VERSION,
  FACE3D_CALIBRATION_SIGNATURE_ALGORITHM,
  FACE3D_EXACT_POLICY_IDS,
  FACE3D_GATE_VERSION_V2,
  FACE3D_PRODUCT_POLICY_TUPLES,
  FACE3D_PROFILE_SCHEMA_V3,
  FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS,
  FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION,
  FACE3D_VALIDATION_COHORT_SCHEMA_VERSION,
  assertNoRawFaceData,
  buildUnsignedCalibrationReceipt,
  computeProfileBindingSha256,
  isRecord,
  percentileNearestRank,
  sha256Canonical,
  sha256Text,
  validateExactDiagnosticProfile,
  validateProductFace3DProfile,
} from './face3d-calibration-contract.mjs';

export const FACE3D_CALIBRATION_PROMOTION_MANIFEST_SCHEMA_VERSION =
  'aura.face3d-confidence-calibration-promotion.v1';
export const FACE3D_CALIBRATION_MODEL_SCHEMA_VERSION =
  'aura.face3d-confidence-calibration-model.v1';
export const FACE3D_CALIBRATION_APPROVAL_SCHEMA_VERSION =
  'aura.face3d-confidence-calibration-approval.v1';
export const FACE3D_CALIBRATED_PROFILE_ENVELOPE_SCHEMA_VERSION =
  'aura.face3d-calibrated-profile-envelope.v1';

const REQUIRED_CALIBRATION_SIGNALS = Object.freeze([
  'pose',
  'neutralExpression',
  'tracking',
  'nativeSync',
  'independentRepeatability',
]);
const MINIMUM_VALIDATION_SUBJECTS = 60;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath, label) {
  requireCondition(fs.existsSync(filePath), `${label} 파일이 없습니다: ${filePath}`);
  requireCondition(fs.statSync(filePath).isFile(), `${label}는 파일이어야 합니다: ${filePath}`);
  const source = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
  } catch (error) {
    throw new Error(
      `${label} JSON을 읽을 수 없습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}

function resolveBundleEvidence(manifestPath, relativePath, label) {
  requireCondition(
    typeof relativePath === 'string' && relativePath.trim().length > 0,
    `${label} 경로가 없습니다.`,
  );
  requireCondition(!path.isAbsolute(relativePath), `${label}는 bundle 기준 상대 경로여야 합니다.`);
  const bundleDirectory = path.dirname(path.resolve(manifestPath));
  const resolved = path.resolve(bundleDirectory, relativePath);
  const relative = path.relative(bundleDirectory, resolved);
  requireCondition(
    relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative),
    `${label}는 calibration bundle 밖을 가리킬 수 없습니다.`,
  );
  requireCondition(fs.existsSync(resolved), `${label} 파일이 없습니다: ${relativePath}`);
  const realBundleDirectory = fs.realpathSync(bundleDirectory);
  const realResolved = fs.realpathSync(resolved);
  const realRelative = path.relative(realBundleDirectory, realResolved);
  requireCondition(
    realRelative !== '..'
      && !realRelative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(realRelative),
    `${label} symlink는 calibration bundle 밖을 가리킬 수 없습니다.`,
  );
  return realResolved;
}

function requireUtc(value, label) {
  requireCondition(
    typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value)),
    `${label}는 UTC ISO-8601 시각이어야 합니다.`,
  );
}

function requireSafeId(value, label) {
  requireCondition(
    typeof value === 'string'
      && value.length >= 3
      && value.length <= 128
      && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value),
    `${label}는 ASCII 가명 ID여야 합니다.`,
  );
}

function requireLocalSubjectId(value, label) {
  requireSafeId(value, label);
  requireCondition(
    value.startsWith('subj_') && !value.startsWith('subj_user_'),
    `${label}는 제품 사용자 문맥과 분리된 subj_ 로컬 가명이어야 합니다.`,
  );
}

function requireLocalSessionId(value, label) {
  requireSafeId(value, label);
  requireCondition(
    value.startsWith('session_'),
    `${label}는 session_ 로컬 가명이어야 합니다.`,
  );
}

function validateAttemptSummary(summary, successCount, label) {
  requireCondition(isRecord(summary), `${label} attempt summary가 없습니다.`);
  requireCondition(
    Number.isInteger(summary.total)
      && Number.isInteger(summary.succeeded)
      && Number.isInteger(summary.failed)
      && summary.total > 0
      && summary.succeeded === successCount
      && summary.failed >= 0
      && summary.total === summary.succeeded + summary.failed,
    `${label} attempt count가 capture 증거와 일치하지 않습니다.`,
  );
  const expectedFailureRate = summary.failed / summary.total;
  requireCondition(
    Number.isFinite(summary.failureRate)
      && Math.abs(summary.failureRate - expectedFailureRate) <= 1e-12,
    `${label} failureRate가 count에서 파생된 값과 다릅니다.`,
  );
}

function validateRepeatabilityEvidence(manifest, frameCount) {
  requireCondition(
    manifest?.schemaVersion === FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION,
    `repeatability-${frameCount}.json schemaVersion이 잘못됐습니다.`,
  );
  requireCondition(
    manifest.cohortRole === 'calibration',
    `repeatability-${frameCount}.json cohortRole은 calibration이어야 합니다.`,
  );
  requireCondition(
    manifest.frameCount === frameCount
      && manifest.collectionPolicyId === FACE3D_EXACT_POLICY_IDS[frameCount]
      && manifest.gateVersion === FACE3D_GATE_VERSION_V2,
    `repeatability-${frameCount}.json exact policy/gate 계약이 잘못됐습니다.`,
  );
  requireCondition(
    manifest.rawFaceDataIncluded === false,
    `repeatability-${frameCount}.json은 raw face data를 포함하면 안 됩니다.`,
  );
  requireCondition(
    Array.isArray(manifest.captures),
    `repeatability-${frameCount}.json captures가 배열이 아닙니다.`,
  );
  const composition = validateRepeatabilityManifest(manifest.captures);
  requireCondition(
    composition.ok,
    `repeatability-${frameCount}.json 3x3 gate 실패:\n${composition.reasons.join('\n')}`,
  );
  validateAttemptSummary(
    manifest.attempts,
    manifest.captures.length,
    `repeatability-${frameCount}.json`,
  );

  const captureIds = new Set();
  const pairContexts = new Map();
  const subjectIds = new Set();
  const sessionIds = new Set();
  const captures = manifest.captures.map((capture, index) => {
    requireCondition(
      capture?.sourceEventType === 'unified_face_capture_completed',
      `repeatability-${frameCount}.captures[${index}]는 unified 완료 이벤트가 아닙니다.`,
    );
    requireSafeId(capture.captureId, `repeatability-${frameCount}.captures[${index}].captureId`);
    requireSafeId(capture.pairId, `repeatability-${frameCount}.captures[${index}].pairId`);
    requireLocalSubjectId(
      capture.subjectId,
      `repeatability-${frameCount}.captures[${index}].subjectId`,
    );
    requireLocalSessionId(
      capture.sessionId,
      `repeatability-${frameCount}.captures[${index}].sessionId`,
    );
    requireCondition(
      !captureIds.has(capture.captureId),
      `repeatability-${frameCount}.json에 중복 captureId가 있습니다.`,
    );
    requireCondition(
      !pairContexts.has(capture.pairId),
      `repeatability-${frameCount}.json에 중복 pairId가 있습니다.`,
    );
    captureIds.add(capture.captureId);
    pairContexts.set(capture.pairId, {
      subjectId: capture.subjectId,
      sessionId: capture.sessionId,
    });
    subjectIds.add(capture.subjectId);
    sessionIds.add(capture.sessionId);
    validateExactDiagnosticProfile(capture.profile, frameCount);
    requireCondition(
      capture.profile.confidenceCalibrationStatus === 'uncalibrated',
      `repeatability-${frameCount}.json은 승격 전 uncalibrated evidence여야 합니다.`,
    );
    return {
      subjectId: capture.subjectId,
      metrics: extractMetricsFromProfile(capture.profile),
    };
  });

  const analysis = analyzeRepeatability(captures);
  return {
    analysis,
    failureRate: manifest.attempts.failureRate,
    subjectIds,
    sessionIds,
    pairContexts,
  };
}

function validateValidationCohort({
  cohort,
  calibrationSubjectIds,
  calibrationSessionIds,
}) {
  requireCondition(
    cohort?.schemaVersion === FACE3D_VALIDATION_COHORT_SCHEMA_VERSION,
    'independent validation cohort schemaVersion이 잘못됐습니다.',
  );
  requireCondition(
    cohort.cohortRole === 'validation'
      && cohort.independentFromCalibration === true,
    'validation cohort는 calibration과 독립으로 선언돼야 합니다.',
  );
  requireCondition(
    cohort.rawFaceDataIncluded === false,
    'validation cohort에는 raw face data를 포함할 수 없습니다.',
  );
  requireCondition(
    cohort.phaseMinusOnePreregistration?.status === 'approved_before_collection'
      && cohort.phaseMinusOnePreregistration.requiredValidationSubjects
        >= MINIMUM_VALIDATION_SUBJECTS,
    'Phase -1 validation cohort 사전 등록 승인이 없습니다.',
  );
  requireUtc(cohort.phaseMinusOnePreregistration.approvedAtUtc, 'preregistration.approvedAtUtc');
  requireUtc(cohort.collectionStartedAtUtc, 'collectionStartedAtUtc');
  requireCondition(
    Date.parse(cohort.phaseMinusOnePreregistration.approvedAtUtc)
      < Date.parse(cohort.collectionStartedAtUtc),
    'validation 수집 전에 Phase -1 기준이 승인돼야 합니다.',
  );
  requireCondition(Array.isArray(cohort.pairs), 'validation cohort pairs가 배열이 아닙니다.');
  requireCondition(
    cohort.pairs.length >= cohort.phaseMinusOnePreregistration.requiredValidationSubjects,
    `validation cohort는 최소 ${
      cohort.phaseMinusOnePreregistration.requiredValidationSubjects
    }개 독립 subject pair가 필요합니다.`,
  );

  const subjectIds = new Set();
  const sessionIds = new Set();
  const pairIds = new Set();
  const metricBiases = Object.fromEntries(
    FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS.map(frameCount => [
      frameCount,
      Object.fromEntries(FACE3D_METRIC_KEYS.map(key => [key, []])),
    ]),
  );
  const captureWindows = Object.fromEntries(
    FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS.map(frameCount => [frameCount, []]),
  );

  for (const [pairIndex, pair] of cohort.pairs.entries()) {
    requireLocalSubjectId(pair?.subjectId, `validation.pairs[${pairIndex}].subjectId`);
    requireLocalSessionId(pair?.sessionId, `validation.pairs[${pairIndex}].sessionId`);
    requireSafeId(pair?.pairId, `validation.pairs[${pairIndex}].pairId`);
    requireCondition(
      !subjectIds.has(pair.subjectId),
      `validation cohort subjectId는 pair마다 달라야 합니다: ${pair.subjectId}`,
    );
    requireCondition(
      !sessionIds.has(pair.sessionId),
      `validation cohort sessionId는 pair마다 달라야 합니다: ${pair.sessionId}`,
    );
    requireCondition(!pairIds.has(pair.pairId), `중복 validation pairId입니다: ${pair.pairId}`);
    requireCondition(
      !calibrationSubjectIds.has(pair.subjectId),
      `validation subject가 calibration cohort와 겹칩니다: ${pair.subjectId}`,
    );
    requireCondition(
      !calibrationSessionIds.has(pair.sessionId),
      `validation session이 calibration cohort와 겹칩니다: ${pair.sessionId}`,
    );
    subjectIds.add(pair.subjectId);
    sessionIds.add(pair.sessionId);
    pairIds.add(pair.pairId);
    requireCondition(isRecord(pair.profiles), `validation pair ${pair.pairId} profiles가 없습니다.`);

    const profiles = {};
    for (const frameCount of FACE3D_CALIBRATION_FRAME_COUNTS) {
      const entry = pair.profiles[String(frameCount)];
      requireCondition(isRecord(entry), `validation pair ${pair.pairId}의 ${frameCount}프레임이 없습니다.`);
      requireSafeId(entry.captureId, `validation pair ${pair.pairId} ${frameCount} captureId`);
      validateExactDiagnosticProfile(entry.profile, frameCount);
      requireCondition(
        entry.profile.confidenceCalibrationStatus === 'uncalibrated',
        `validation pair ${pair.pairId} ${frameCount}프레임은 uncalibrated evidence여야 합니다.`,
      );
      profiles[frameCount] = entry.profile;
    }

    const baselineMetrics = extractMetricsFromProfile(profiles[30]);
    for (const frameCount of FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS) {
      const candidateMetrics = extractMetricsFromProfile(profiles[frameCount]);
      captureWindows[frameCount].push(profiles[frameCount].captureWindowMs);
      for (const key of FACE3D_METRIC_KEYS) {
        requireCondition(
          Number.isFinite(candidateMetrics[key]) && Number.isFinite(baselineMetrics[key]),
          `validation pair ${pair.pairId} ${key}가 finite가 아닙니다.`,
        );
        metricBiases[frameCount][key].push(
          Math.abs(candidateMetrics[key] - baselineMetrics[key]),
        );
      }
    }
  }

  requireCondition(
    isRecord(cohort.attemptsByFrameCount),
    'validation cohort attemptsByFrameCount가 없습니다.',
  );
  const failureRates = {};
  for (const frameCount of FACE3D_CALIBRATION_FRAME_COUNTS) {
    const summary = cohort.attemptsByFrameCount[String(frameCount)];
    requireCondition(isRecord(summary), `validation ${frameCount}프레임 attempt summary가 없습니다.`);
    requireCondition(
      Number.isInteger(summary.total)
        && Number.isInteger(summary.succeeded)
        && Number.isInteger(summary.failed)
        && summary.total === summary.succeeded + summary.failed
        && summary.succeeded >= cohort.pairs.length,
      `validation ${frameCount}프레임 attempt count가 pair 증거와 맞지 않습니다.`,
    );
    const failureRate = summary.failed / summary.total;
    requireCondition(
      Number.isFinite(summary.failureRate)
        && Math.abs(summary.failureRate - failureRate) <= 1e-12,
      `validation ${frameCount}프레임 failureRate가 count와 다릅니다.`,
    );
    failureRates[frameCount] = failureRate;
  }

  return {
    subjectCount: subjectIds.size,
    metricBiases,
    captureWindows,
    failureRates,
  };
}

export function evaluateGate6B({repeatability, validation}) {
  const baseline = repeatability[30];
  const candidates = {};

  for (const frameCount of FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS) {
    const current = repeatability[frameCount];
    const metricResults = {};
    for (const key of FACE3D_METRIC_KEYS) {
      const shortMetric = current.analysis.metrics[key];
      const baselineMetric = baseline.analysis.metrics[key];
      const biases = validation.metricBiases[frameCount][key];
      const between = baselineMetric.between;
      const medianBias = median(biases);
      const p95Bias = percentileNearestRank(biases, 0.95);
      const withinRatio = baselineMetric.within > 0
        ? shortMetric.within / baselineMetric.within
        : Number.POSITIVE_INFINITY;
      const medianBiasRatio = between > 0
        ? medianBias / between
        : Number.POSITIVE_INFINITY;
      const p95BiasRatio = between > 0
        ? p95Bias / between
        : Number.POSITIVE_INFINITY;
      const shortSampleFloorPass =
        shortMetric.pass === true
        && Number.isInteger(shortMetric.subjectCount)
        && shortMetric.subjectCount >= current.analysis.minSubjects
        && Number.isInteger(shortMetric.repeatedSubjectCount)
        && shortMetric.repeatedSubjectCount >= current.analysis.minRepeatedSubjects;
      const baselineSampleFloorPass =
        baselineMetric.pass === true
        && Number.isInteger(baselineMetric.subjectCount)
        && baselineMetric.subjectCount >= baseline.analysis.minSubjects
        && Number.isInteger(baselineMetric.repeatedSubjectCount)
        && baselineMetric.repeatedSubjectCount >= baseline.analysis.minRepeatedSubjects;
      const pass =
        shortSampleFloorPass
        && baselineSampleFloorPass
        && shortMetric.discriminability >= 2.0
        && withinRatio <= 1.25
        && medianBiasRatio <= 0.10
        && p95BiasRatio <= 0.25;
      metricResults[key] = {
        discriminability: shortMetric.discriminability,
        subjectCount: shortMetric.subjectCount,
        repeatedSubjectCount: shortMetric.repeatedSubjectCount,
        sampleFloorPass: shortSampleFloorPass,
        exact30SampleFloorPass: baselineSampleFloorPass,
        withinRatioToExact30: withinRatio,
        pairedMedianBias: medianBias,
        pairedMedianBiasToExact30Between: medianBiasRatio,
        pairedP95Bias: p95Bias,
        pairedP95BiasToExact30Between: p95BiasRatio,
        pass,
      };
    }

    const failureRateDelta =
      validation.failureRates[frameCount] - validation.failureRates[30];
    const captureWindowP95Ms = percentileNearestRank(
      validation.captureWindows[frameCount],
      0.95,
    );
    const failureRatePass = failureRateDelta <= 0.05 + 1e-12;
    const captureWindowPass = captureWindowP95Ms <= 500;
    const metricsPass = FACE3D_METRIC_KEYS.every(key => metricResults[key].pass);
    candidates[frameCount] = {
      frameCount,
      metrics: metricResults,
      failureRate: validation.failureRates[frameCount],
      exact30FailureRate: validation.failureRates[30],
      failureRateDelta,
      failureRatePass,
      captureWindowP95Ms,
      captureWindowPass,
      pass: metricsPass && failureRatePass && captureWindowPass,
    };
  }

  const selectedFrameCount =
    FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS.find(frameCount =>
      candidates[frameCount].pass) ?? null;
  return {
    schemaVersion: 'aura.face3d-gate6b-evaluation.v1',
    criteria: {
      discriminabilityMinimum: 2.0,
      repeatabilityMinimumSubjects: baseline.analysis.minSubjects,
      repeatabilityMinimumRepeatedSubjects: baseline.analysis.minRepeatedSubjects,
      withinSpreadMaximumVsExact30: 1.25,
      pairedMedianBiasMaximumVsExact30Between: 0.10,
      pairedP95BiasMaximumVsExact30Between: 0.25,
      failureRateMaximumDelta: 0.05,
      candidateCaptureWindowP95MaximumMs: 500,
    },
    exactOneFrameAutoPromotionAllowed: false,
    candidates,
    selectedFrameCount,
    pass: selectedFrameCount !== null,
  };
}

function validateCalibrationModel(model) {
  requireCondition(
    model?.schemaVersion === FACE3D_CALIBRATION_MODEL_SCHEMA_VERSION,
    'confidence calibration model schemaVersion이 잘못됐습니다.',
  );
  requireCondition(
    model.status === 'candidate_flag_off'
      && model.featureFlagDefault === 'off',
    'calibration model은 기본 OFF candidate여야 합니다.',
  );
  requireCondition(
    model.coverageTreatment === 'removed_from_quality'
      || model.coverageTreatment === 'completion_separate_from_quality',
    'coverage를 quality로 재사용한 calibration model은 승격할 수 없습니다.',
  );
  requireCondition(
    Array.isArray(model.qualitySignals)
      && REQUIRED_CALIBRATION_SIGNALS.every(signal => model.qualitySignals.includes(signal)),
    'calibration model에 pose/neutral/tracking/native sync/독립 반복성 신호가 모두 필요합니다.',
  );
  requireCondition(
    model.validationCohortRole === 'independent',
    'calibration model validation cohort는 independent여야 합니다.',
  );
}

function validateApprovalArtifact({
  approval,
  evidenceBundleSha256,
  calibrationModelSha256,
  requestedFrameCount,
  requestedPolicyId,
}) {
  requireCondition(
    approval?.schemaVersion === FACE3D_CALIBRATION_APPROVAL_SCHEMA_VERSION,
    'calibration approval artifact schemaVersion이 잘못됐습니다.',
  );
  requireCondition(
    approval.decision === 'approved_for_receipt_signing'
      && approval.reviewerRole === 'product-owner',
    'product-owner의 receipt signing 승인이 없습니다.',
  );
  requireUtc(approval.reviewedAtUtc, 'approval.reviewedAtUtc');
  requireCondition(
    approval.selectedFrameCount === requestedFrameCount
      && approval.policyId === requestedPolicyId
      && approval.gateVersion === FACE3D_GATE_VERSION_V2,
    'approval artifact의 frame/policy/gate가 promotion 요청과 다릅니다.',
  );
  requireCondition(
    approval.evidenceBundleSha256 === evidenceBundleSha256
      && approval.calibrationModelSha256 === calibrationModelSha256,
    'approval artifact가 현재 evidence/model SHA에 binding되지 않았습니다.',
  );
}

export function evaluateFace3DCalibrationPromotion({manifest, manifestPath}) {
  requireCondition(
    manifest?.schemaVersion === FACE3D_CALIBRATION_PROMOTION_MANIFEST_SCHEMA_VERSION,
    'Face3D calibration promotion manifest schemaVersion이 잘못됐습니다.',
  );
  requireCondition(
    manifest.executionMode === 'dry_run_only',
    '이 도구는 dry_run_only manifest만 허용합니다.',
  );
  requireCondition(
    FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS.includes(manifest.requestedFrameCount),
    'requestedFrameCount는 5, 8, 12 중 하나여야 합니다.',
  );
  requireCondition(
    typeof manifest.requestedPolicyId === 'string'
      && Object.hasOwn(FACE3D_PRODUCT_POLICY_TUPLES, manifest.requestedPolicyId),
    'requestedPolicyId는 backend allowlist의 immutable product policy여야 합니다.',
  );
  requireCondition(
    FACE3D_PRODUCT_POLICY_TUPLES[manifest.requestedPolicyId].gateSelectedFrameCount
      === manifest.requestedFrameCount,
    'requestedFrameCount와 immutable product policy의 Gate 선택 frame binding이 다릅니다.',
  );
  requireCondition(isRecord(manifest.evidence), 'promotion evidence mapping이 없습니다.');

  const repeatability = {};
  const evidenceHashes = {repeatability: {}};
  const calibrationSubjectIds = new Set();
  const calibrationSessionIds = new Set();
  let calibrationPairContexts = null;
  for (const frameCount of FACE3D_CALIBRATION_FRAME_COUNTS) {
    const relativePath = manifest.evidence[`repeatability${frameCount}`];
    const evidencePath = resolveBundleEvidence(
      manifestPath,
      relativePath,
      `repeatability-${frameCount}.json`,
    );
    const evidence = readJson(evidencePath, `repeatability-${frameCount}.json`);
    repeatability[frameCount] = validateRepeatabilityEvidence(evidence, frameCount);
    if (calibrationPairContexts === null) {
      calibrationPairContexts = repeatability[frameCount].pairContexts;
    } else {
      requireCondition(
        repeatability[frameCount].pairContexts.size === calibrationPairContexts.size
          && [...calibrationPairContexts.entries()].every(([pairId, context]) => {
            const candidate = repeatability[frameCount].pairContexts.get(pairId);
            return candidate?.subjectId === context.subjectId
              && candidate?.sessionId === context.sessionId;
          }),
        `repeatability-${frameCount}.json은 다른 frame count와 같은 subject/session/pair 구성이어야 합니다.`,
      );
    }
    evidenceHashes.repeatability[frameCount] = {
      file: path.basename(evidencePath),
      sha256: sha256File(evidencePath),
    };
    for (const subjectId of repeatability[frameCount].subjectIds) {
      calibrationSubjectIds.add(subjectId);
    }
    for (const sessionId of repeatability[frameCount].sessionIds) {
      calibrationSessionIds.add(sessionId);
    }
  }

  const validationPath = resolveBundleEvidence(
    manifestPath,
    manifest.evidence.validationCohort,
    'independent validation cohort',
  );
  const validation = validateValidationCohort({
    cohort: readJson(validationPath, 'independent validation cohort'),
    calibrationSubjectIds,
    calibrationSessionIds,
  });
  evidenceHashes.validationCohort = {
    file: path.basename(validationPath),
    sha256: sha256File(validationPath),
  };

  const modelPath = resolveBundleEvidence(
    manifestPath,
    manifest.evidence.calibrationModel,
    'confidence calibration model',
  );
  const model = readJson(modelPath, 'confidence calibration model');
  validateCalibrationModel(model);
  const calibrationModelSha256 = sha256File(modelPath);
  evidenceHashes.calibrationModel = {
    file: path.basename(modelPath),
    sha256: calibrationModelSha256,
  };

  const gate6B = evaluateGate6B({repeatability, validation});
  requireCondition(gate6B.pass, 'Gate 6B를 통과한 5/8/12 후보가 없습니다.');
  requireCondition(
    manifest.requestedFrameCount === gate6B.selectedFrameCount,
    `가장 작은 통과 후보는 ${gate6B.selectedFrameCount}프레임입니다. `
      + `${manifest.requestedFrameCount}프레임 요청은 사전 등록 선택 규칙과 다릅니다.`,
  );

  const evidenceBundleSha256 = sha256Canonical(evidenceHashes);
  const approvalPath = resolveBundleEvidence(
    manifestPath,
    manifest.evidence.approvalArtifact,
    'calibration approval artifact',
  );
  const approval = readJson(approvalPath, 'calibration approval artifact');
  validateApprovalArtifact({
    approval,
    evidenceBundleSha256,
    calibrationModelSha256,
    requestedFrameCount: manifest.requestedFrameCount,
    requestedPolicyId: manifest.requestedPolicyId,
  });
  const approvalArtifactSha256 = sha256File(approvalPath);

  const profileEnvelopePath = resolveBundleEvidence(
    manifestPath,
    manifest.profileEnvelope,
    'calibrated profile envelope',
  );
  const profileEnvelope = readJson(profileEnvelopePath, 'calibrated profile envelope');
  requireCondition(
    profileEnvelope?.schemaVersion === FACE3D_CALIBRATED_PROFILE_ENVELOPE_SCHEMA_VERSION,
    'calibrated profile envelope schemaVersion이 잘못됐습니다.',
  );
  requireCondition(isRecord(profileEnvelope.profile), 'calibrated profile이 없습니다.');
  assertNoRawFaceData(profileEnvelope.profile);
  requireCondition(
    profileEnvelope.profile.schemaVersion === FACE3D_PROFILE_SCHEMA_V3
      && profileEnvelope.profile.collectionPolicyId === manifest.requestedPolicyId
      && profileEnvelope.profile.gateVersion === FACE3D_GATE_VERSION_V2
      && profileEnvelope.profile.confidenceCalibrationStatus === 'calibrated',
    'calibrated profile의 schema/policy/gate/status가 promotion 요청과 다릅니다.',
  );
  requireCondition(
    profileEnvelope.captureNonce === manifest.receiptContext?.captureNonce
      && profileEnvelope.profile.captureNonce === profileEnvelope.captureNonce
      && profileEnvelope.appBuild === manifest.receiptContext?.appBuild,
    'profile/profile envelope의 captureNonce 또는 appBuild가 receipt context와 다릅니다.',
  );
  validateProductFace3DProfile(
    profileEnvelope.profile,
    manifest.requestedPolicyId,
  );

  const profileBindingSha256 = computeProfileBindingSha256(profileEnvelope.profile);
  const unsignedReceipt = buildUnsignedCalibrationReceipt({
    ...manifest.receiptContext,
    profileBindingSha256,
    collectionPolicyId: manifest.requestedPolicyId,
    gateVersion: FACE3D_GATE_VERSION_V2,
    approvalArtifactSha256,
  });

  return {
    schemaVersion: 'aura.face3d-confidence-calibration-dry-run.v1',
    generatedAtUtc: new Date().toISOString(),
    status: 'evidence_validated_unsigned_not_promoted',
    gate6B,
    evidence: {
      ...evidenceHashes,
      evidenceBundleSha256,
      approvalArtifact: {
        file: path.basename(approvalPath),
        sha256: approvalArtifactSha256,
      },
      validationSubjectCount: validation.subjectCount,
    },
    unsignedReceipt,
    confidenceCalibrationRegistryPreview: {
      status: 'pending',
      validationStatus: 'evidence_validated_unsigned',
      profileSchemaVersion: FACE3D_PROFILE_SCHEMA_V3,
      policyId: manifest.requestedPolicyId,
      gateVersion: FACE3D_GATE_VERSION_V2,
      receiptSchemaVersion: FACE3D_CALIBRATION_RECEIPT_SCHEMA_VERSION,
      signatureAlgorithm: FACE3D_CALIBRATION_SIGNATURE_ALGORITHM,
      approvalArtifactPath: path.basename(approvalPath),
      approvalArtifactSha256,
      receiptPath: null,
      receiptSha256: null,
    },
    safeguards: {
      featureFlagDefault: 'off',
      actualSigningPerformed: false,
      liveGateStatusMutated: false,
      productPromotionPerformed: false,
      backendMustFailClosedUntilRegistryStatusApproved: true,
    },
  };
}

function parseArguments(argv) {
  const manifestFlag = argv.indexOf('--manifest');
  const outputFlag = argv.indexOf('--output');
  requireCondition(argv.includes('--dry-run'), '--dry-run이 없으면 실행하지 않습니다.');
  requireCondition(
    manifestFlag !== -1
      && typeof argv[manifestFlag + 1] === 'string'
      && outputFlag !== -1
      && typeof argv[outputFlag + 1] === 'string',
    '사용법: node promote-face3d-calibration.mjs --manifest <promotion.json> '
      + '--output <dry-run-result.json> --dry-run',
  );
  return {
    manifestPath: path.resolve(argv[manifestFlag + 1]),
    outputPath: path.resolve(argv[outputFlag + 1]),
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const {manifestPath, outputPath} = parseArguments(argv);
  requireCondition(!fs.existsSync(outputPath), `output이 이미 있습니다: ${outputPath}`);
  const result = evaluateFace3DCalibrationPromotion({
    manifest: readJson(manifestPath, 'calibration promotion manifest'),
    manifestPath,
  });
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Face3D calibration Gate 6B dry-run 검증 완료: ${outputPath}`);
  console.log(
    `선택 후보=${result.gate6B.selectedFrameCount}; `
      + '서명=false, live gate 변경=false, 제품 승격=false',
  );
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `Face3D calibration dry-run 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
