#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  CANDIDATE_SCHEMA_VERSION,
  RUNTIME_SCHEMA_VERSION,
  TIER2_SEMANTIC_GROUPS,
  buildApprovedRuntimeMap,
  validateBilateralSymmetryPolicy,
  validateCandidateGroups,
} from './semantic-candidate-core.mjs';
import {
  computeBilateralSymmetryPolicySha256,
  computeCandidateSemanticContentSha256,
} from './build-semantic-validation.mjs';
import {TIER2_RUNTIME_CANDIDATE_ID} from './build-tier2-runtime-candidate.mjs';
import {TIER2_METRIC_KEYS} from './evaluate-semantic-candidate.mjs';

export const TIER2_PROMOTION_MANIFEST_SCHEMA_VERSION = 'aura.face3d-tier2-promotion.v1';
export const TIER2_PROMOTION_RECEIPT_SCHEMA_VERSION = 'aura.face3d-tier2-promotion-receipt.v1';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const ALL_METRIC_KEYS = Object.freeze([
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
  ...TIER2_METRIC_KEYS,
]);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function topologyEquals(left, right) {
  return [
    'algorithm',
    'vertexCount',
    'indexCount',
    'uvCount',
    'indicesHash',
    'uvHash',
    'fingerprint',
  ].every(key => left?.[key] === right?.[key]);
}

function resolveEvidence(manifestPath, relativePath, label) {
  requireCondition(typeof relativePath === 'string' && relativePath.trim(), `${label} 경로가 없습니다.`);
  requireCondition(!path.isAbsolute(relativePath), `${label}는 manifest 기준 상대 경로여야 합니다.`);
  const manifestDirectory = path.dirname(path.resolve(manifestPath));
  const resolved = path.resolve(manifestDirectory, relativePath);
  const repositoryRelativePath = path.relative(REPOSITORY_ROOT, resolved);
  requireCondition(
    repositoryRelativePath !== '..'
      && !repositoryRelativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(repositoryRelativePath),
    `${label}는 repository 밖을 가리킬 수 없습니다.`,
  );
  requireCondition(fs.existsSync(resolved) && fs.statSync(resolved).isFile(), `${label} 파일이 없습니다: ${relativePath}`);
  const realRepositoryRoot = fs.realpathSync(REPOSITORY_ROOT);
  const realResolved = fs.realpathSync(resolved);
  const realRepositoryRelativePath = path.relative(realRepositoryRoot, realResolved);
  requireCondition(
    realRepositoryRelativePath !== '..'
      && !realRepositoryRelativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(realRepositoryRelativePath),
    `${label} symlink는 repository 밖을 가리킬 수 없습니다.`,
  );
  return realResolved;
}

function verifyTier2Groups(candidate, primaryApproval) {
  requireCondition(
    primaryApproval?.schemaVersion === 'aura.face3d-tier2-seed-authoring.v1'
      && primaryApproval.reviewStatus === 'primary_anatomical_coverage_approved'
      && primaryApproval.reviewerId === 'product-owner',
    'Tier-2 primary approval이 유효하지 않습니다.',
  );
  for (const {fixedIndices, key} of TIER2_SEMANTIC_GROUPS) {
    requireCondition(
      JSON.stringify(candidate.groups[key]) === JSON.stringify(fixedIndices)
        && JSON.stringify(primaryApproval.groups[key]) === JSON.stringify(fixedIndices),
      `${key}가 제품 승인 고정 patch와 다릅니다.`,
    );
  }
}

export function verifyTier2Diagnostics(diagnostics, candidate) {
  requireCondition(
    diagnostics?.schemaVersion === 'aura.face3d-semantic-candidate-diagnostics.v1'
      && diagnostics.status === 'provisional_candidate_diagnostics',
    '17-capture offline diagnostics 스키마/상태가 잘못됐습니다.',
  );
  requireCondition(diagnostics.candidate?.candidateId === candidate.candidateId, 'diagnostics candidateId가 G2 candidate와 다릅니다.');
  requireCondition(
    topologyEquals(diagnostics.candidate?.topologyFingerprint, candidate.topologyFingerprint),
    'diagnostics topology가 G2 candidate와 다릅니다.',
  );
  requireCondition(
    diagnostics.validation?.captureCount === 17
      && diagnostics.validation?.allCaptureTopologiesMatchCandidate === true
      && diagnostics.validation?.allLocalVerticesFinite === true
      && diagnostics.validation?.tier2RuntimeFormulaParity === true,
    '17-capture topology/finite/Tier-2 formula parity 검증이 통과하지 않았습니다.',
  );
  requireCondition(
    JSON.stringify(diagnostics.validation?.evaluatedMetricKeys) === JSON.stringify(ALL_METRIC_KEYS),
    'diagnostics가 11개 지표를 정확히 계산하지 않았습니다.',
  );
  requireCondition(
    Array.isArray(diagnostics.captures)
      && diagnostics.captures.length === 17
      && diagnostics.captures.every(capture =>
        typeof capture?.capturePairId === 'string' && capture.capturePairId.trim().length > 0)
      && new Set(diagnostics.captures.map(capture => capture.capturePairId)).size === 17,
    'diagnostics에는 서로 다른 17개 capture가 정확히 있어야 합니다.',
  );
  requireCondition(
    diagnostics.captures.every(capture =>
      ALL_METRIC_KEYS.every(key => Number.isFinite(capture.metrics?.[key]))),
    '17-capture 중 유한하지 않은 지표가 있습니다.',
  );
  requireCondition(
    ALL_METRIC_KEYS.every(key => diagnostics.metricSummary?.[key]?.sampleCount === 17),
    '11개 지표 summary sampleCount가 17이 아닙니다.',
  );
}

export function promoteTier2SemanticMap({candidate, manifest, manifestPath}) {
  requireCondition(candidate?.schemaVersion === CANDIDATE_SCHEMA_VERSION, 'G2 candidate schemaVersion이 잘못됐습니다.');
  requireCondition(candidate.candidateId === TIER2_RUNTIME_CANDIDATE_ID, '승격 대상 G2 candidateId가 잘못됐습니다.');
  requireCondition(
    candidate.reviewStatus === 'candidate_edited_not_runtime_approved',
    '승인 전 G2 candidate만 승격할 수 있습니다.',
  );
  requireCondition(manifest?.schemaVersion === TIER2_PROMOTION_MANIFEST_SCHEMA_VERSION, 'Tier-2 promotion manifest schemaVersion이 잘못됐습니다.');
  requireCondition(manifest.approved === true && manifest.reviewer === 'product-owner', 'product-owner의 Tier-2 승인이 필요합니다.');
  requireCondition(manifest.candidateId === candidate.candidateId, 'manifest candidateId가 G2 candidate와 다릅니다.');
  requireCondition(typeof manifest.mapId === 'string' && manifest.mapId.startsWith('arkit-face3d-g2-'), 'G2 mapId가 잘못됐습니다.');
  requireCondition(
    typeof manifest.reviewedAtUtc === 'string'
      && manifest.reviewedAtUtc.trim().length > 0
      && Number.isFinite(Date.parse(manifest.reviewedAtUtc)),
    'product-owner 승인 시각 reviewedAtUtc가 유효하지 않습니다.',
  );
  requireCondition(
    manifest.deviceRepeatability?.status === 'waived_by_product_owner'
      && typeof manifest.deviceRepeatability?.decision === 'string'
      && manifest.deviceRepeatability.decision.trim().length > 0,
    '실기기 반복성 면제 결정이 명시되지 않았습니다.',
  );
  requireCondition(
    JSON.stringify(candidate.groups.chinIndices) === JSON.stringify([34, 35, 975]),
    'Pogonion patch는 [34,35,975]여야 합니다.',
  );

  const groupErrors = validateCandidateGroups(candidate.groups, candidate.topologyFingerprint.vertexCount);
  const symmetryErrors = validateBilateralSymmetryPolicy(candidate);
  requireCondition(groupErrors.length === 0 && symmetryErrors.length === 0, [...groupErrors, ...symmetryErrors].join('\n'));

  const g1ReceiptPath = resolveEvidence(manifestPath, manifest.evidence?.baseG1ApprovalReceipt, 'G1 approval receipt');
  const primaryApprovalPath = resolveEvidence(manifestPath, manifest.evidence?.tier2PrimaryApproval, 'Tier-2 primary approval');
  const diagnosticsPath = resolveEvidence(manifestPath, manifest.evidence?.offlineDiagnostics17, '17-capture diagnostics');
  const pogonionDecisionPath = resolveEvidence(manifestPath, manifest.evidence?.pogonionDecision, 'Pogonion decision');
  const g1Receipt = readJson(g1ReceiptPath, 'G1 approval receipt');
  const primaryApproval = readJson(primaryApprovalPath, 'Tier-2 primary approval');
  const diagnostics = readJson(diagnosticsPath, '17-capture diagnostics');
  requireCondition(
    g1Receipt?.schemaVersion === 'aura.face3d-semantic-approval-receipt.v1'
      && g1Receipt.approval?.approved === true
      && topologyEquals(g1Receipt.runtimeMap?.topologyFingerprint, candidate.topologyFingerprint),
    '상속할 G1 approval receipt가 유효하지 않습니다.',
  );
  requireCondition(
    topologyEquals(primaryApproval.topologyFingerprint, candidate.topologyFingerprint),
    'Tier-2 primary approval topology가 G2 candidate와 다릅니다.',
  );
  verifyTier2Groups(candidate, primaryApproval);
  verifyTier2Diagnostics(diagnostics, candidate);

  const approvedCandidate = {...candidate, reviewStatus: 'human_overlay_approved'};
  const runtimeMap = buildApprovedRuntimeMap(approvedCandidate, manifest.mapId);
  const runtimeMapText = serializeJson(runtimeMap);
  const receipt = {
    schemaVersion: TIER2_PROMOTION_RECEIPT_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    approval: {
      approved: true,
      reviewer: manifest.reviewer,
      reviewedAtUtc: manifest.reviewedAtUtc,
      scope: 'G1 runtime map + Pogonion v2 + six Tier-2 fixed topology groups',
    },
    candidate: {
      candidateId: candidate.candidateId,
      semanticContentSha256: computeCandidateSemanticContentSha256(candidate),
      bilateralSymmetryPolicySha256: computeBilateralSymmetryPolicySha256(candidate),
      groupVertexCounts: Object.fromEntries(
        Object.entries(candidate.groups).map(([key, indices]) => [key, indices.length]),
      ),
    },
    runtimeMap: {
      mapId: runtimeMap.mapId,
      runtimeMapSha256: sha256Text(runtimeMapText),
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      topologyFingerprint: {...candidate.topologyFingerprint},
    },
    evidence: {
      baseG1ApprovalReceipt: {file: path.basename(g1ReceiptPath), sha256: sha256File(g1ReceiptPath)},
      pogonionDecision: {file: path.basename(pogonionDecisionPath), sha256: sha256File(pogonionDecisionPath)},
      tier2PrimaryApproval: {file: path.basename(primaryApprovalPath), sha256: sha256File(primaryApprovalPath)},
      offlineDiagnostics17: {
        file: path.basename(diagnosticsPath),
        sha256: sha256File(diagnosticsPath),
        captureCount: 17,
        finiteMetricCount: 11,
        topologyExact: true,
      },
      deviceRepeatability: {...manifest.deviceRepeatability},
    },
  };
  return {receipt, runtimeMap, runtimeMapText};
}

function parseArguments(argv) {
  const force = argv.includes('--force');
  const filtered = argv.filter(value => value !== '--force');
  requireCondition(
    filtered.length === 6 && filtered[2] === '--output' && filtered[4] === '--receipt',
    '사용법: node promote-tier2-semantic-map.mjs <g2-candidate.json> <promotion-manifest.json> --output <runtime-map.json> --receipt <receipt.json> [--force]',
  );
  return {
    candidatePath: path.resolve(filtered[0]),
    manifestPath: path.resolve(filtered[1]),
    outputPath: path.resolve(filtered[3]),
    receiptPath: path.resolve(filtered[5]),
    force,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const paths = parseArguments(argv);
  requireCondition(paths.outputPath !== paths.receiptPath, 'runtime map과 receipt 출력은 달라야 합니다.');
  requireCondition(paths.force || !fs.existsSync(paths.outputPath), `runtime map 출력이 이미 있습니다: ${paths.outputPath}`);
  requireCondition(paths.force || !fs.existsSync(paths.receiptPath), `receipt 출력이 이미 있습니다: ${paths.receiptPath}`);
  const result = promoteTier2SemanticMap({
    candidate: readJson(paths.candidatePath, 'G2 candidate'),
    manifest: readJson(paths.manifestPath, 'promotion manifest'),
    manifestPath: paths.manifestPath,
  });
  fs.mkdirSync(path.dirname(paths.outputPath), {recursive: true});
  fs.mkdirSync(path.dirname(paths.receiptPath), {recursive: true});
  fs.writeFileSync(paths.outputPath, result.runtimeMapText, 'utf8');
  fs.writeFileSync(paths.receiptPath, serializeJson(result.receipt), 'utf8');
  console.log(`Face3D G2 runtime map 승격 완료: ${paths.outputPath}`);
  console.log(`G2 promotion receipt: ${paths.receiptPath}`);
  console.log('검증 범위: 17 captures × 11 finite metrics; new device repeatability waived by product-owner');
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(`Face3D G2 runtime map 승격 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
