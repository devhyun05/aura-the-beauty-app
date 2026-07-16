#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  FACE3D_EXACT_POLICY_IDS,
  FACE3D_GATE_VERSION_V2,
  FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION,
  computeProfileBindingSha256,
  isRecord,
  sha256Canonical,
  sha256Text,
  validateExactDiagnosticProfile,
} from './face3d-calibration-contract.mjs';
import {
  FACE3D_ALL_METRIC_KEYS,
  FACE3D_METRIC_KEYS,
  validateRepeatabilityManifest,
} from './analyze-repeatability.mjs';

export const FACE3D_REPEATABILITY_SOURCE_INDEX_SCHEMA_VERSION =
  'aura.face3d-repeatability-source-index.v1';

const LEGACY_POLICY_ID = 'legacy-face3d-v1-20of30';
const PROFILE_ALLOWED_KEYS = new Set([
  'schemaVersion',
  'source',
  'collectionPolicyId',
  'sampleMode',
  'aggregation',
  'gateVersion',
  'validFrameCount',
  'targetFrameCount',
  'completionRatio',
  'confidenceCalibrationStatus',
  'captureNonce',
  'captureWindowMs',
  'sensorProvenance',
  'topologyFingerprint',
  'warnings',
  'metrics',
]);
const METRIC_ALLOWED_KEYS = new Set([
  'value',
  'valueMm',
  'valueMmConfidence',
  'valueMmValidFrameCount',
  'valueMmMad',
  'confidence',
  'unit',
  'validFrameCount',
  'mad',
]);

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(filePath, label) {
  requireCondition(fs.existsSync(filePath), `${label} 파일이 없습니다: ${filePath}`);
  requireCondition(fs.statSync(filePath).isFile(), `${label}는 파일이어야 합니다: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function parseJson(text, label) {
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw new Error(
      `${label} JSON을 읽을 수 없습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function readJson(filePath, label) {
  return parseJson(readText(filePath, label), label);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeProfile(profile, {requireSensorProvenance = false} = {}) {
  requireCondition(isRecord(profile), 'Face3D profile이 JSON object가 아닙니다.');
  const sanitized = {};
  for (const [key, value] of Object.entries(profile)) {
    if (PROFILE_ALLOWED_KEYS.has(key)) {
      sanitized[key] = cloneJson(value);
    }
  }
  const sourceMetrics = sanitized.metrics;
  requireCondition(isRecord(sourceMetrics), 'Face3D profile metrics가 없습니다.');
  const sanitizedMetrics = {};
  for (const key of FACE3D_ALL_METRIC_KEYS) {
    const metric = sourceMetrics[key];
    if (metric === undefined || metric === null) {
      continue;
    }
    requireCondition(isRecord(metric), `${key} metric이 JSON object가 아닙니다.`);
    requireCondition(
      metric.value === null || (typeof metric.value === 'number' && Number.isFinite(metric.value)),
      `${key}.value가 finite number 또는 null이 아닙니다.`,
    );
    sanitizedMetrics[key] = Object.fromEntries(
      Object.entries(metric)
        .filter(([metricKey]) => METRIC_ALLOWED_KEYS.has(metricKey))
        .map(([metricKey, metricValue]) => [metricKey, cloneJson(metricValue)]),
    );
  }
  sanitized.metrics = sanitizedMetrics;
  for (const key of FACE3D_METRIC_KEYS) {
    requireCondition(
      typeof sanitized.metrics[key]?.value === 'number'
        && Number.isFinite(sanitized.metrics[key].value),
      `required metric ${key}.value가 없습니다.`,
    );
  }
  if (requireSensorProvenance) {
    requireCondition(
      sanitized.sensorProvenance !== undefined,
      'exact diagnostics profile sensorProvenance가 없습니다.',
    );
  }
  if (sanitized.sensorProvenance !== undefined) {
    requireCondition(
      isRecord(sanitized.sensorProvenance),
      'sensorProvenance는 JSON object여야 합니다.',
    );
    sanitized.sensorProvenance = Object.fromEntries(
      [
        'trueDepthHardware',
        'depthDataObservedRatio',
        'faceTrackingSupported',
        'deviceModel',
      ]
        .filter(key => Object.hasOwn(sanitized.sensorProvenance, key))
        .map(key => [key, cloneJson(sanitized.sensorProvenance[key])]),
    );
  }
  if (sanitized.warnings !== undefined) {
    requireCondition(
      Array.isArray(sanitized.warnings)
        && sanitized.warnings.every(warning => typeof warning === 'string'),
      'profile warnings는 string 배열이어야 합니다.',
    );
  }
  return sanitized;
}

function parseJsonLines(text, label) {
  const entries = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      entries.push(JSON.parse(trimmed));
    } catch (error) {
      throw new Error(
        `${label} ${index + 1}행 JSON을 읽을 수 없습니다: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return entries;
}

function collectProfileCandidates(sourcePath) {
  const text = readText(sourcePath, 'capture source');
  let entries;
  if (sourcePath.endsWith('.jsonl')) {
    entries = parseJsonLines(text, sourcePath);
  } else {
    const parsed = parseJson(text, sourcePath);
    entries = Array.isArray(parsed) ? parsed : [parsed];
  }

  const candidates = [];
  for (const entry of entries) {
    const event = isRecord(entry?.event) ? entry.event : entry;
    const unifiedCapture = isRecord(entry?.unifiedCapture)
      ? entry.unifiedCapture
      : null;
    if (!isRecord(event)) {
      continue;
    }
    if (event.type === 'unified_face_capture_completed' && isRecord(event.face3d)) {
      candidates.push({
        captureId: typeof event.captureId === 'string' ? event.captureId : null,
        eventType: 'unified_face_capture_completed',
        profile: event.face3d,
        requestId: typeof event.requestId === 'string' ? event.requestId : null,
      });
      continue;
    }
    if (
      (event.type === 'face3d_analyzed' || event.type === 'face3DAnalyzed')
      && isRecord(event.profile)
    ) {
      const wasAdaptedFromUnified =
        unifiedCapture?.sourceEventType === 'unified_face_capture_completed'
        && typeof unifiedCapture.captureId === 'string';
      candidates.push({
        captureId: wasAdaptedFromUnified ? unifiedCapture.captureId : null,
        eventType: wasAdaptedFromUnified
          ? 'unified_face_capture_completed'
          : 'face3d_analyzed',
        profile: event.profile,
        requestId: typeof event.requestId === 'string' ? event.requestId : null,
      });
      continue;
    }
    if (isRecord(event.metrics)) {
      candidates.push({
        captureId: null,
        eventType: 'bare_profile',
        profile: event,
        requestId: null,
      });
    }
  }
  return candidates;
}

function selectProfileCandidate(candidates, entry) {
  const expectedEventType =
    typeof entry.sourceEventType === 'string' ? entry.sourceEventType : null;
  let filtered = expectedEventType
    ? candidates.filter(candidate => candidate.eventType === expectedEventType)
    : candidates;
  if (typeof entry.captureId === 'string') {
    const candidatesWithCaptureId = filtered.filter(candidate =>
      typeof candidate.captureId === 'string');
    const exactCaptureMatches = filtered.filter(candidate =>
      candidate.captureId === entry.captureId);
    if (candidatesWithCaptureId.length > 0) {
      requireCondition(
        exactCaptureMatches.length > 0,
        `capture source에 요청한 captureId가 없습니다: ${entry.captureId}`,
      );
      filtered = exactCaptureMatches;
    }
  }
  requireCondition(
    filtered.length === 1,
    `capture source에서 대상 profile을 하나로 고를 수 없습니다. 후보 수=${filtered.length}`,
  );
  return filtered[0];
}

function safeToken(value, label) {
  requireCondition(
    typeof value === 'string'
      && value.length >= 3
      && value.length <= 128
      && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value),
    `${label}는 이름·이메일이 아닌 ASCII 가명 token이어야 합니다.`,
  );
  return value;
}

function localSubjectId(value, label) {
  const token = safeToken(value, label);
  requireCondition(
    token.startsWith('subj_') && !token.startsWith('subj_user_'),
    `${label}는 제품 사용자 문맥과 분리된 subj_ 로컬 가명이어야 합니다.`,
  );
  return token;
}

function localSessionId(value, label) {
  const token = safeToken(value, label);
  requireCondition(
    token.startsWith('session_'),
    `${label}는 session_ 로컬 가명이어야 합니다.`,
  );
  return token;
}

function resolveSourcePath(indexPath, sourcePath) {
  requireCondition(
    typeof sourcePath === 'string' && sourcePath.trim().length > 0,
    'success attempt의 sourcePath가 없습니다.',
  );
  requireCondition(!path.isAbsolute(sourcePath), 'sourcePath는 index 기준 상대 경로여야 합니다.');
  const indexDirectory = path.dirname(path.resolve(indexPath));
  const resolved = path.resolve(indexDirectory, sourcePath);
  const relative = path.relative(indexDirectory, resolved);
  requireCondition(
    relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative),
    'sourcePath는 source index directory 밖을 가리킬 수 없습니다.',
  );
  requireCondition(fs.existsSync(resolved), `capture source 파일이 없습니다: ${sourcePath}`);
  const realIndexDirectory = fs.realpathSync(indexDirectory);
  const realResolved = fs.realpathSync(resolved);
  const realRelative = path.relative(realIndexDirectory, realResolved);
  requireCondition(
    realRelative !== '..'
      && !realRelative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(realRelative),
    'capture source symlink는 source index directory 밖을 가리킬 수 없습니다.',
  );
  return realResolved;
}

function validateLegacyProfile(profile) {
  requireCondition(
    profile.schemaVersion === 'aura.face3d-profile.v1',
    'legacy source는 aura.face3d-profile.v1이어야 합니다.',
  );
  requireCondition(
    Number.isInteger(profile.validFrameCount) && profile.validFrameCount >= 20,
    'legacy source는 validFrameCount >= 20이어야 합니다.',
  );
  requireCondition(
    profile.targetFrameCount === 30,
    'legacy source는 targetFrameCount가 30이어야 합니다.',
  );
}

function validateIndexContract(index) {
  requireCondition(
    index?.schemaVersion === FACE3D_REPEATABILITY_SOURCE_INDEX_SCHEMA_VERSION,
    'repeatability source index schemaVersion이 잘못됐습니다.',
  );
  requireCondition(index.cohortRole === 'calibration', 'source index cohortRole은 calibration이어야 합니다.');
  requireCondition(
    Number.isInteger(index.frameCount) && index.frameCount > 0,
    'source index frameCount가 유효하지 않습니다.',
  );
  requireCondition(
    typeof index.collectionPolicyId === 'string' && index.collectionPolicyId.length > 0,
    'source index collectionPolicyId가 없습니다.',
  );
  requireCondition(
    typeof index.appBuild === 'string' && index.appBuild.length >= 8,
    'source index appBuild가 없습니다.',
  );
  requireCondition(Array.isArray(index.attempts), 'source index attempts가 배열이 아닙니다.');
}

export function adaptRepeatabilitySourceIndex({index, indexPath}) {
  validateIndexContract(index);
  const exactPolicyId = FACE3D_EXACT_POLICY_IDS[index.frameCount];
  const isExactDiagnostics = index.collectionPolicyId === exactPolicyId;
  const isLegacy = index.collectionPolicyId === LEGACY_POLICY_ID && index.frameCount === 30;
  requireCondition(
    isExactDiagnostics || isLegacy,
    'collectionPolicyId와 frameCount 조합이 exact diagnostics 또는 legacy 20/30 계약이 아닙니다.',
  );
  if (isExactDiagnostics) {
    requireCondition(
      index.gateVersion === FACE3D_GATE_VERSION_V2,
      'exact diagnostics source index gateVersion은 face3d-gate-v2여야 합니다.',
    );
  }

  const captures = [];
  const attemptIds = new Set();
  const captureIds = new Set();
  let failedAttemptCount = 0;

  for (const [attemptIndex, attempt] of index.attempts.entries()) {
    requireCondition(isRecord(attempt), `attempts[${attemptIndex}]가 object가 아닙니다.`);
    const attemptId = safeToken(attempt.attemptId, `attempts[${attemptIndex}].attemptId`);
    requireCondition(!attemptIds.has(attemptId), `중복 attemptId입니다: ${attemptId}`);
    attemptIds.add(attemptId);
    const subjectId = localSubjectId(
      attempt.subjectId,
      `attempts[${attemptIndex}].subjectId`,
    );
    const sessionId = localSessionId(
      attempt.sessionId,
      `attempts[${attemptIndex}].sessionId`,
    );
    const pairId = isExactDiagnostics
      ? safeToken(attempt.pairId, `attempts[${attemptIndex}].pairId`)
      : (typeof attempt.pairId === 'string'
          ? safeToken(attempt.pairId, `attempts[${attemptIndex}].pairId`)
          : null);
    requireCondition(
      attempt.shotKind === 'neutral',
      `attempts[${attemptIndex}].shotKind는 neutral이어야 합니다.`,
    );
    requireCondition(
      attempt.status === 'success' || attempt.status === 'failed',
      `attempts[${attemptIndex}].status는 success 또는 failed여야 합니다.`,
    );

    if (attempt.status === 'failed') {
      requireCondition(
        typeof attempt.failureReason === 'string' && attempt.failureReason.length > 0,
        `failed attempt ${attemptId}의 failureReason이 없습니다.`,
      );
      failedAttemptCount += 1;
      continue;
    }

    const sourcePath = resolveSourcePath(indexPath, attempt.sourcePath);
    const candidates = collectProfileCandidates(sourcePath);
    const candidate = selectProfileCandidate(candidates, attempt);
    const profile = sanitizeProfile(candidate.profile, {
      requireSensorProvenance: isExactDiagnostics,
    });
    const captureId = safeToken(
      candidate.captureId ?? attempt.captureId,
      `success attempt ${attemptId} captureId`,
    );
    requireCondition(!captureIds.has(captureId), `중복 captureId입니다: ${captureId}`);
    captureIds.add(captureId);

    if (isExactDiagnostics) {
      requireCondition(
        candidate.eventType === 'unified_face_capture_completed',
        'exact diagnostics evidence는 unified_face_capture_completed 이벤트여야 합니다.',
      );
      requireCondition(
        typeof candidate.captureId === 'string'
          && (typeof attempt.captureId !== 'string'
            || candidate.captureId === attempt.captureId),
        'exact diagnostics evidence의 captureId가 unified 완료 이벤트와 일치해야 합니다.',
      );
      validateExactDiagnosticProfile(profile, index.frameCount);
    } else {
      requireCondition(
        candidate.eventType === 'face3d_analyzed' || candidate.eventType === 'bare_profile',
        'legacy evidence는 face3d_analyzed 또는 bare profile이어야 합니다.',
      );
      validateLegacyProfile(profile);
    }

    captures.push({
      attemptId,
      subjectId,
      sessionId,
      pairId,
      shotKind: 'neutral',
      captureId,
      requestId: candidate.requestId,
      sourceEventType: candidate.eventType,
      sourceFile: path.basename(sourcePath),
      sourceSha256: sha256Text(fs.readFileSync(sourcePath)),
      profileBindingSha256: computeProfileBindingSha256(profile),
      profile,
    });
  }

  const manifestValidation = validateRepeatabilityManifest(captures);
  requireCondition(
    manifestValidation.ok,
    `repeatability 3x3 manifest gate 실패:\n${manifestValidation.reasons.join('\n')}`,
  );
  const attemptCount = index.attempts.length;
  const successAttemptCount = captures.length;
  requireCondition(
    attemptCount === successAttemptCount + failedAttemptCount,
    'attempt count 합계가 일치하지 않습니다.',
  );

  return {
    schemaVersion: FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    cohortRole: 'calibration',
    frameCount: index.frameCount,
    collectionPolicyId: index.collectionPolicyId,
    gateVersion: index.gateVersion,
    appBuild: index.appBuild,
    rawFaceDataIncluded: false,
    sourceIndexSha256: sha256Canonical(index),
    attempts: {
      total: attemptCount,
      succeeded: successAttemptCount,
      failed: failedAttemptCount,
      failureRate: attemptCount > 0 ? failedAttemptCount / attemptCount : 1,
    },
    manifestValidation: {
      ok: true,
      requiredSubjects: 3,
      requiredCapturesPerSubject: 3,
    },
    captures,
  };
}

function parseArguments(argv) {
  const indexFlag = argv.indexOf('--index');
  const outputFlag = argv.indexOf('--output');
  requireCondition(
    indexFlag !== -1
      && typeof argv[indexFlag + 1] === 'string'
      && outputFlag !== -1
      && typeof argv[outputFlag + 1] === 'string',
    '사용법: node adapt-repeatability-manifest.mjs --index <source-index.json> --output <repeatability-N.json>',
  );
  return {
    indexPath: path.resolve(argv[indexFlag + 1]),
    outputPath: path.resolve(argv[outputFlag + 1]),
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const {indexPath, outputPath} = parseArguments(argv);
  requireCondition(!fs.existsSync(outputPath), `output이 이미 있습니다: ${outputPath}`);
  const index = readJson(indexPath, 'repeatability source index');
  const manifest = adaptRepeatabilitySourceIndex({index, indexPath});
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Face3D repeatability 공통 manifest 생성: ${outputPath}`);
  console.log(
    `${manifest.collectionPolicyId}: ${manifest.captures.length} successes / `
      + `${manifest.attempts.failed} failures; rawFaceDataIncluded=false`,
  );
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `Face3D repeatability adapter 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
