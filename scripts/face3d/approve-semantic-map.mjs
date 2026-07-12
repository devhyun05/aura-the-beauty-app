#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  CANDIDATE_SCHEMA_VERSION,
  RUNTIME_SCHEMA_VERSION,
  buildApprovedRuntimeMap,
  validateBilateralSymmetryPolicy,
} from './semantic-candidate-core.mjs';
import {
  VALIDATION_SCHEMA_VERSION,
  computeBilateralSymmetryPolicySha256,
  computeCandidateSemanticContentSha256,
  validateTopologyFingerprint,
} from './build-semantic-validation.mjs';

export const APPROVAL_MANIFEST_SCHEMA_VERSION = 'aura.face3d-semantic-approval.v1';
export const APPROVAL_RECEIPT_SCHEMA_VERSION = 'aura.face3d-semantic-approval-receipt.v1';
export {VALIDATION_SCHEMA_VERSION};

const REQUIRED_SHOT_KINDS = Object.freeze(['neutral', 'yawLeft', 'yawRight']);
const REQUIRED_SHOT_KIND_SET = new Set(REQUIRED_SHOT_KINDS);
const TOPOLOGY_FIELDS = Object.freeze([
  'algorithm',
  'vertexCount',
  'indexCount',
  'uvCount',
  'indicesHash',
  'uvHash',
  'fingerprint',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const PSEUDONYMOUS_SUBJECT_ID_PATTERN = /^subject-[a-z0-9][a-z0-9_-]{1,63}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNonEmptyString(value, label) {
  requireCondition(typeof value === 'string' && value.trim().length > 0, `${label}가 없습니다.`);
  return value.trim();
}

function readJson(filePath, label) {
  requireCondition(fs.existsSync(filePath), `${label} 파일이 없습니다: ${filePath}`);
  const source = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
  } catch (error) {
    throw new Error(`${label} JSON을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function requireMatchingTopology(expected, actual, label) {
  const mismatches = TOPOLOGY_FIELDS.filter(field => expected[field] !== actual[field]);
  requireCondition(
    mismatches.length === 0,
    `${label} topology fingerprint가 후보와 다릅니다: ${mismatches.join(', ')}`,
  );
}

function validateUtcTimestamp(value) {
  const reviewedAtUtc = validateNonEmptyString(value, 'reviewedAtUtc');
  requireCondition(
    UTC_TIMESTAMP_PATTERN.test(reviewedAtUtc) && Number.isFinite(Date.parse(reviewedAtUtc)),
    'reviewedAtUtc는 ISO 8601 UTC(Z) 시각이어야 합니다.',
  );
  return reviewedAtUtc;
}

function validateCandidate(candidate) {
  requireCondition(isObject(candidate), 'candidate JSON이 객체가 아닙니다.');
  requireCondition(
    candidate.schemaVersion === CANDIDATE_SCHEMA_VERSION,
    `승인 전 candidate JSON만 사용할 수 있습니다. 기대 schemaVersion: ${CANDIDATE_SCHEMA_VERSION}`,
  );
  const topology = validateTopologyFingerprint(candidate.topologyFingerprint, 'candidate');
  const symmetryErrors = validateBilateralSymmetryPolicy({
    ...candidate,
    topologyFingerprint: topology,
  });
  requireCondition(symmetryErrors.length === 0, symmetryErrors.join('\n'));
  return {
    bilateralSymmetry: {
      mirrorMapSha256: candidate.bilateralSymmetryPolicy.mirrorMapSha256,
      policySha256: computeBilateralSymmetryPolicySha256({
        ...candidate,
        topologyFingerprint: topology,
      }),
      policyVersion: candidate.bilateralSymmetryPolicy.policyVersion,
      selectedMirrorPairCount: candidate.bilateralSymmetryPolicy.groupPairs
        .reduce((sum, entry) => sum + entry.pairs.length, 0),
    },
    candidateId: validateNonEmptyString(candidate.candidateId, 'candidate.candidateId'),
    semanticContentSha256: computeCandidateSemanticContentSha256(candidate),
    topology,
  };
}

function validateSha256(value, label) {
  requireCondition(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    `${label}는 64자리 SHA-256이어야 합니다.`,
  );
  return value.toLowerCase();
}

function resolveAndVerifyArtifact(summaryPath, relativeValue, expectedHash, label) {
  const relativePath = validateNonEmptyString(relativeValue, `${label}.file`);
  requireCondition(!path.isAbsolute(relativePath), `${label}.file은 summary 기준 상대 경로여야 합니다.`);
  const summaryDirectory = path.dirname(summaryPath);
  const artifactPath = path.resolve(summaryDirectory, relativePath);
  const relative = path.relative(summaryDirectory, artifactPath);
  requireCondition(
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `${label}.file이 validation summary 폴더 밖을 가리킵니다.`,
  );
  requireCondition(
    fs.existsSync(artifactPath) && fs.statSync(artifactPath).isFile(),
    `${label} 파일이 없습니다: ${relativePath}`,
  );
  const normalizedExpectedHash = validateSha256(expectedHash, `${label}.sha256`);
  requireCondition(
    sha256File(artifactPath) === normalizedExpectedHash,
    `${label} 파일 hash가 validation summary와 다릅니다: ${relativePath}`,
  );
  return {file: relativePath, sha256: normalizedExpectedHash};
}

function requireExactShotKinds(values, label) {
  requireCondition(Array.isArray(values), `${label}가 배열이 아닙니다.`);
  requireCondition(values.length === REQUIRED_SHOT_KINDS.length, `${label}는 neutral/yawLeft/yawRight 3개여야 합니다.`);
  requireCondition(new Set(values).size === values.length, `${label}에 중복 shotKind가 있습니다.`);
  const missing = REQUIRED_SHOT_KINDS.filter(shotKind => !values.includes(shotKind));
  const unknown = values.filter(shotKind => !REQUIRED_SHOT_KIND_SET.has(shotKind));
  requireCondition(
    missing.length === 0 && unknown.length === 0,
    `${label}는 neutral/yawLeft/yawRight와 정확히 일치해야 합니다.`,
  );
}

function validateSummary({
  summary,
  summaryPath,
  summaryReference,
  subjectId,
  samePersonConfirmed,
  candidateId,
  candidateSemanticContentSha256,
  candidateBilateralSymmetry,
  candidateTopology,
  captureIds,
  captureSetSubjects,
}) {
  const label = `${subjectId} validation summary`;
  requireCondition(isObject(summary), `${label}가 객체가 아닙니다.`);
  requireCondition(
    summary.schemaVersion === VALIDATION_SCHEMA_VERSION,
    `${label} schemaVersion이 잘못됐습니다. 기대값: ${VALIDATION_SCHEMA_VERSION}`,
  );
  requireCondition(isObject(summary.candidate), `${label} candidate가 없습니다.`);
  requireCondition(
    summary.candidate.candidateId === candidateId,
    `${label} candidateId가 승인 후보와 다릅니다.`,
  );
  const summarySemanticContentSha256 = validateSha256(
    summary.candidate.semanticContentSha256,
    `${label} candidate.semanticContentSha256`,
  );
  requireCondition(
    summarySemanticContentSha256 === candidateSemanticContentSha256,
    `${label} candidate semantic content hash가 승인 후보와 다릅니다.`,
  );
  requireMatchingTopology(
    candidateTopology,
    validateTopologyFingerprint(summary.topologyFingerprint, label),
    label,
  );
  requireCondition(
    isObject(summary.bilateralSymmetryValidation),
    `${label} bilateralSymmetryValidation이 없습니다.`,
  );
  const summarySymmetry = summary.bilateralSymmetryValidation;
  requireCondition(
    summarySymmetry.status === 'passed',
    `${label} bilateralSymmetryValidation.status가 passed가 아닙니다.`,
  );
  requireCondition(
    summarySymmetry.policyVersion === candidateBilateralSymmetry.policyVersion,
    `${label} bilateral symmetry policyVersion이 승인 후보와 다릅니다.`,
  );
  requireCondition(
    validateSha256(summarySymmetry.policySha256, `${label} bilateral policySha256`)
      === candidateBilateralSymmetry.policySha256,
    `${label} bilateral symmetry policy SHA가 승인 후보와 다릅니다.`,
  );
  requireCondition(
    validateSha256(summarySymmetry.mirrorMapSha256, `${label} mirrorMapSha256`)
      === candidateBilateralSymmetry.mirrorMapSha256,
    `${label} UV mirror map SHA가 승인 후보와 다릅니다.`,
  );
  requireCondition(
    summarySymmetry.selectedMirrorPairCount
      === candidateBilateralSymmetry.selectedMirrorPairCount,
    `${label} 선택된 bilateral mirror pair 수가 승인 후보와 다릅니다.`,
  );
  requireCondition(
    summary.result === 'inputs_valid_human_overlay_review_required',
    `${label} result가 승인 가능한 재투영 검증 상태가 아닙니다.`,
  );
  requireCondition(summary.runtimeMapGenerated === false, `${label} runtimeMapGenerated는 false여야 합니다.`);
  requireCondition(isObject(summary.reviewMatrix), `${label} reviewMatrix가 없습니다.`);
  const reviewMatrix = resolveAndVerifyArtifact(
    summaryPath,
    summary.reviewMatrix.file,
    summary.reviewMatrix.sha256,
    `${label} reviewMatrix`,
  );

  requireExactShotKinds(summary.captureShotKinds, `${label} captureShotKinds`);
  requireCondition(Array.isArray(summary.captures), `${label} captures가 배열이 아닙니다.`);
  requireCondition(summary.captures.length === 3, `${label}는 정확히 3개 캡처가 필요합니다.`);
  requireCondition(
    summary.captureCount === summary.captures.length,
    `${label} captureCount가 captures 개수와 다릅니다.`,
  );

  const summaryCaptureIds = new Set();
  const summaryCaptureSetIds = new Set();
  const captureShotKinds = [];
  const evidenceCaptures = summary.captures.map((capture, index) => {
    requireCondition(isObject(capture), `${label} captures[${index}]가 객체가 아닙니다.`);
    const capturePairId = validateNonEmptyString(
      capture.capturePairId,
      `${label} captures[${index}].capturePairId`,
    );
    const captureShotKind = validateNonEmptyString(
      capture.captureShotKind,
      `${label} ${capturePairId}.captureShotKind`,
    );
    const captureSetId = validateNonEmptyString(
      capture.captureSetId,
      `${label} ${capturePairId}.captureSetId`,
    );
    requireCondition(
      REQUIRED_SHOT_KIND_SET.has(captureShotKind),
      `${label} ${capturePairId}의 captureShotKind가 잘못됐습니다: ${captureShotKind}`,
    );
    requireCondition(
      !summaryCaptureIds.has(capturePairId),
      `${label}에 중복 capturePairId가 있습니다: ${capturePairId}`,
    );
    requireCondition(
      !captureIds.has(capturePairId),
      `서로 다른 subject에 중복 capturePairId가 있습니다: ${capturePairId}`,
    );
    requireCondition(
      capture.topologyMatch === true,
      `${label} ${capturePairId}의 topologyMatch가 true가 아닙니다.`,
    );
    requireCondition(
      capture.fullMeshInFrame === true,
      `${label} ${capturePairId}의 fullMeshInFrame이 true가 아닙니다.`,
    );
    const overlay = resolveAndVerifyArtifact(
      summaryPath,
      capture.overlayFile,
      capture.overlaySha256,
      `${label} ${capturePairId} overlay`,
    );
    const previousCaptureSetSubject = captureSetSubjects.get(captureSetId);
    requireCondition(
      previousCaptureSetSubject === undefined || previousCaptureSetSubject === subjectId,
      `서로 다른 subject가 같은 captureSetId를 공유합니다: ${captureSetId}`,
    );
    captureSetSubjects.set(captureSetId, subjectId);
    summaryCaptureIds.add(capturePairId);
    summaryCaptureSetIds.add(captureSetId);
    captureIds.add(capturePairId);
    captureShotKinds.push(captureShotKind);
    return {capturePairId, captureSetId, captureShotKind, overlay};
  });
  requireExactShotKinds(captureShotKinds, `${label} captures의 shotKinds`);
  requireCondition(
    summary.captureShotKinds.every(shotKind => captureShotKinds.includes(shotKind)),
    `${label} captureShotKinds가 captures와 다릅니다.`,
  );
  const captureSetIds = [...summaryCaptureSetIds].sort();
  requireCondition(
    captureSetIds.length === 1 || samePersonConfirmed === true,
    `${label}의 세 캡처 captureSetId가 다릅니다. manifest subject.samePersonConfirmed=true가 필요합니다.`,
  );
  if (summary.captureSetIds !== undefined) {
    requireCondition(
      Array.isArray(summary.captureSetIds)
        && [...summary.captureSetIds].sort().join('\n') === captureSetIds.join('\n'),
      `${label} captureSetIds가 captures와 다릅니다.`,
    );
  }
  if (summary.sameCaptureSet !== undefined) {
    requireCondition(
      summary.sameCaptureSet === (captureSetIds.length === 1),
      `${label} sameCaptureSet가 captures와 다릅니다.`,
    );
  }

  return {
    captureSetIds,
    samePersonConfirmed: captureSetIds.length === 1 || samePersonConfirmed === true,
    subjectId,
    validationSummaryPath: summaryPath,
    validationSummaryReference: summaryReference,
    validationSummarySha256: sha256File(summaryPath),
    captures: evidenceCaptures,
    bilateralSymmetryValidation: {
      mirrorMapSha256: summarySymmetry.mirrorMapSha256,
      policySha256: summarySymmetry.policySha256,
      policyVersion: summarySymmetry.policyVersion,
      selectedMirrorPairCount: summarySymmetry.selectedMirrorPairCount,
      status: summarySymmetry.status,
    },
    reviewMatrix,
  };
}

export function validateApprovalInputs({candidate, manifest, manifestPath}) {
  const {
    bilateralSymmetry,
    candidateId,
    semanticContentSha256,
    topology,
  } = validateCandidate(candidate);
  requireCondition(isObject(manifest), 'approval manifest JSON이 객체가 아닙니다.');
  requireCondition(
    manifest.schemaVersion === APPROVAL_MANIFEST_SCHEMA_VERSION,
    `approval manifest schemaVersion이 잘못됐습니다. 기대값: ${APPROVAL_MANIFEST_SCHEMA_VERSION}`,
  );
  requireCondition(manifest.approved === true, 'approval manifest의 approved가 true여야 합니다.');
  requireCondition(
    manifest.distinctPeopleConfirmed === true,
    'approval manifest의 distinctPeopleConfirmed가 true여야 합니다.',
  );
  const reviewer = validateNonEmptyString(manifest.reviewer, 'reviewer');
  const reviewedAtUtc = validateUtcTimestamp(manifest.reviewedAtUtc);
  const manifestCandidateId = validateNonEmptyString(manifest.candidateId, 'manifest.candidateId');
  requireCondition(manifestCandidateId === candidateId, 'approval manifest candidateId가 승인 후보와 다릅니다.');
  const mapId = validateNonEmptyString(manifest.mapId, 'mapId');
  requireCondition(mapId.length >= 4, 'mapId를 4자 이상 입력하세요.');
  requireCondition(Array.isArray(manifest.subjects), 'approval manifest subjects가 배열이 아닙니다.');
  requireCondition(manifest.subjects.length >= 3, '서로 다른 pseudonymous subjectId가 최소 3개 필요합니다.');

  const manifestDirectory = path.dirname(manifestPath);
  const subjectIds = new Set();
  const summaryPaths = new Set();
  const captureIds = new Set();
  const captureSetSubjects = new Map();
  const evidence = manifest.subjects.map((subject, index) => {
    requireCondition(isObject(subject), `subjects[${index}]가 객체가 아닙니다.`);
    const subjectId = validateNonEmptyString(subject.subjectId, `subjects[${index}].subjectId`);
    requireCondition(
      PSEUDONYMOUS_SUBJECT_ID_PATTERN.test(subjectId),
      `${subjectId}는 pseudonymous subjectId 형식이 아닙니다. subject- 접두사의 소문자 식별자를 사용하세요.`,
    );
    requireCondition(!subjectIds.has(subjectId), `중복 subjectId가 있습니다: ${subjectId}`);
    subjectIds.add(subjectId);

    const summaryValue = validateNonEmptyString(
      subject.validationSummaryPath,
      `${subjectId}.validationSummaryPath`,
    );
    requireCondition(
      !path.isAbsolute(summaryValue),
      `${subjectId}.validationSummaryPath는 approval manifest 기준 상대 경로여야 합니다.`,
    );
    const summaryPath = path.resolve(manifestDirectory, summaryValue);
    requireCondition(!summaryPaths.has(summaryPath), `중복 validation summary 경로가 있습니다: ${summaryValue}`);
    summaryPaths.add(summaryPath);
    const summary = readJson(summaryPath, `${subjectId} validation summary`);
    return validateSummary({
      summary,
      summaryPath,
      summaryReference: summaryValue,
      subjectId,
      samePersonConfirmed: subject.samePersonConfirmed,
      candidateId,
      candidateBilateralSymmetry: bilateralSymmetry,
      candidateSemanticContentSha256: semanticContentSha256,
      candidateTopology: topology,
      captureIds,
      captureSetSubjects,
    });
  });

  return {
    approved: true,
    bilateralSymmetry,
    candidateId,
    distinctPeopleConfirmed: true,
    evidence,
    mapId,
    reviewedAtUtc,
    reviewer,
    semanticContentSha256,
    topology,
  };
}

export function buildApprovalReceipt({
  approval,
  candidatePath,
  manifestPath,
  runtimeMap,
  runtimeMapText,
}) {
  return {
    schemaVersion: APPROVAL_RECEIPT_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    approval: {
      approved: true,
      distinctPeopleConfirmed: approval.distinctPeopleConfirmed,
      reviewer: approval.reviewer,
      reviewedAtUtc: approval.reviewedAtUtc,
    },
    candidate: {
      candidateId: approval.candidateId,
      candidateFile: path.basename(candidatePath),
      candidateSha256: sha256File(candidatePath),
      semanticContentSha256: approval.semanticContentSha256,
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      bilateralSymmetry: {...approval.bilateralSymmetry},
    },
    runtimeMap: {
      mapId: runtimeMap.mapId,
      runtimeMapSha256: sha256Text(runtimeMapText),
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      topologyFingerprint: {...approval.topology},
    },
    evidence: {
      approvalManifestFile: path.basename(manifestPath),
      approvalManifestSha256: sha256File(manifestPath),
      requiredShotKinds: [...REQUIRED_SHOT_KINDS],
      subjectCount: approval.evidence.length,
      subjects: approval.evidence.map(item => ({
        bilateralSymmetryValidation: item.bilateralSymmetryValidation,
        captureSetIds: item.captureSetIds,
        samePersonConfirmed: item.samePersonConfirmed,
        subjectId: item.subjectId,
        validationSummaryReference: item.validationSummaryReference,
        validationSummarySha256: item.validationSummarySha256,
        captures: item.captures,
        reviewMatrix: item.reviewMatrix,
      })),
    },
  };
}

function defaultReceiptPath(outputPath) {
  const parsed = path.parse(outputPath);
  return path.resolve(
    'artifacts/face3d/semantic-approval',
    `${parsed.name}.approval-receipt.json`,
  );
}

function parseCliArguments(argv) {
  const positional = [];
  let outputValue;
  let receiptValue;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output' || value === '-o') {
      requireCondition(outputValue === undefined, '--output은 한 번만 지정할 수 있습니다.');
      outputValue = argv[index + 1];
      requireCondition(outputValue && !outputValue.startsWith('-'), '--output 뒤에 runtime map 경로가 필요합니다.');
      index += 1;
    } else if (value === '--receipt') {
      requireCondition(receiptValue === undefined, '--receipt는 한 번만 지정할 수 있습니다.');
      receiptValue = argv[index + 1];
      requireCondition(receiptValue && !receiptValue.startsWith('-'), '--receipt 뒤에 receipt 경로가 필요합니다.');
      index += 1;
    } else if (value.startsWith('-')) {
      throw new Error(`알 수 없는 옵션입니다: ${value}`);
    } else {
      positional.push(value);
    }
  }
  requireCondition(positional.length === 2, 'candidate JSON과 approval manifest JSON을 하나씩 지정해야 합니다.');
  requireCondition(outputValue !== undefined, '--output <runtime-map-json>을 지정해야 합니다.');
  return {
    candidatePath: path.resolve(positional[0]),
    manifestPath: path.resolve(positional[1]),
    outputPath: path.resolve(outputValue),
    receiptPath: receiptValue ? path.resolve(receiptValue) : defaultReceiptPath(path.resolve(outputValue)),
  };
}

function usage() {
  console.log(`Usage:
  node scripts/face3d/approve-semantic-map.mjs \\
    <ARKitFaceSemanticMapV1.candidate.json> \\
    <semantic-approval.json> \\
    --output <ARKitFaceSemanticMapV1.json> \\
    [--receipt <approval-receipt.json>]`);
}

export function runCli(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    return;
  }
  const {candidatePath, manifestPath, outputPath, receiptPath} = parseCliArguments(argv);
  const protectedPaths = new Set([candidatePath, manifestPath]);
  requireCondition(!protectedPaths.has(outputPath), 'runtime map 출력이 candidate/manifest 입력을 덮어쓸 수 없습니다.');
  requireCondition(!protectedPaths.has(receiptPath), 'approval receipt 출력이 candidate/manifest 입력을 덮어쓸 수 없습니다.');
  requireCondition(outputPath !== receiptPath, 'runtime map과 approval receipt는 서로 다른 경로여야 합니다.');

  const candidate = readJson(candidatePath, 'candidate');
  const manifest = readJson(manifestPath, 'approval manifest');
  const approval = validateApprovalInputs({candidate, manifest, manifestPath});
  for (const item of approval.evidence) {
    requireCondition(
      item.validationSummaryPath !== outputPath && item.validationSummaryPath !== receiptPath,
      '출력 경로가 validation summary 입력을 덮어쓸 수 없습니다.',
    );
  }

  const approvedCandidate = {...candidate, reviewStatus: 'human_overlay_approved'};
  const runtimeMap = buildApprovedRuntimeMap(approvedCandidate, approval.mapId);
  const runtimeMapText = serializeJson(runtimeMap);
  const receipt = buildApprovalReceipt({
    approval,
    candidatePath,
    manifestPath,
    runtimeMap,
    runtimeMapText,
  });

  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(outputPath, runtimeMapText, 'utf8');
  fs.writeFileSync(receiptPath, serializeJson(receipt), 'utf8');
  console.log(`Face3D semantic map 승인 완료: ${outputPath}`);
  console.log(`승인 receipt: ${receiptPath}`);
  console.log(`검증 범위: ${approval.evidence.length} subjects × ${REQUIRED_SHOT_KINDS.length} shotKinds`);
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(`Face3D semantic map 승인 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
