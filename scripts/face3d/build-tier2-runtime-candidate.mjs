#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  CANDIDATE_SCHEMA_VERSION,
  TIER2_BILATERAL_GROUP_PAIRS,
  TIER2_SEMANTIC_GROUPS,
  validateBilateralSymmetryPolicy,
  validateCandidateGroups,
} from './semantic-candidate-core.mjs';

export const TIER2_RUNTIME_CANDIDATE_ID = 'face3d-g2-product-approved-v1-candidate';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
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

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function arraysEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function buildTier2RuntimeCandidate({
  baseCandidate,
  baseCandidateFile,
  primaryApproval,
  primaryApprovalFile,
  referenceCapture,
}) {
  requireCondition(baseCandidate?.schemaVersion === CANDIDATE_SCHEMA_VERSION, 'G1 base candidate schemaVersion이 잘못됐습니다.');
  requireCondition(baseCandidate?.groups && typeof baseCandidate.groups === 'object', 'G1 base candidate groups가 없습니다.');
  requireCondition(
    primaryApproval?.schemaVersion === 'aura.face3d-tier2-seed-authoring.v1'
      && primaryApproval.reviewStatus === 'primary_anatomical_coverage_approved'
      && primaryApproval.reviewerId === 'product-owner',
    'Tier-2 primary product-owner 승인이 유효하지 않습니다.',
  );
  requireCondition(
    topologyEquals(baseCandidate.topologyFingerprint, primaryApproval.topologyFingerprint),
    'Tier-2 primary approval topology가 G1 base candidate와 다릅니다.',
  );
  requireCondition(
    topologyEquals(
      baseCandidate.topologyFingerprint,
      referenceCapture?.face3dCalibration?.topologyFingerprint,
    ),
    'reference capture topology가 G1 base candidate와 다릅니다.',
  );
  requireCondition(
    Array.isArray(referenceCapture?.uvs)
      && referenceCapture.uvs.length === baseCandidate.topologyFingerprint.vertexCount,
    'reference capture UV가 없거나 vertexCount와 다릅니다.',
  );

  for (const definition of TIER2_SEMANTIC_GROUPS) {
    requireCondition(
      arraysEqual(primaryApproval.groups?.[definition.key], definition.fixedIndices),
      `${definition.key}가 제품 승인 고정 patch와 다릅니다.`,
    );
  }

  const candidate = structuredClone(baseCandidate);
  candidate.candidateId = TIER2_RUNTIME_CANDIDATE_ID;
  candidate.createdAtUtc = '2026-07-15T00:00:00.000Z';
  candidate.reviewStatus = 'candidate_edited_not_runtime_approved';
  candidate.generationMethod = 'g1_approved_base_plus_product_approved_tier2_fixed_patch_v1';
  candidate.groups.chinIndices = [34, 35, 975];
  for (const definition of TIER2_SEMANTIC_GROUPS) {
    candidate.groups[definition.key] = [...primaryApproval.groups[definition.key]];
  }

  candidate.groupDefinitions = candidate.groupDefinitions ?? {};
  candidate.groupDefinitions.chinIndices = {
    color: '#007aff',
    label: '턱 전방 후보 패치(Pogonion/E-line)',
    minimumCount: 3,
    selectionMethod: 'product_owner_reviewed_topology_patch_v2',
  };
  for (const definition of TIER2_SEMANTIC_GROUPS) {
    candidate.groupDefinitions[definition.key] = {
      label: definition.label,
      minimumCount: definition.minimumCount,
      selectionMethod: 'product_owner_reviewed_fixed_topology_patch_v1',
    };
  }

  const tier2PairKeys = new Set(TIER2_BILATERAL_GROUP_PAIRS.map(
    ({leftGroupKey, rightGroupKey}) => `${leftGroupKey}:${rightGroupKey}`,
  ));
  requireCondition(
    candidate.bilateralSymmetryPolicy
      && Array.isArray(candidate.bilateralSymmetryPolicy.groupPairs),
    'G1 base candidate bilateral symmetry policy가 없습니다.',
  );
  candidate.bilateralSymmetryPolicy.groupPairs = [
    ...candidate.bilateralSymmetryPolicy.groupPairs.filter(entry =>
      !tier2PairKeys.has(`${entry.leftGroupKey}:${entry.rightGroupKey}`)),
    ...TIER2_BILATERAL_GROUP_PAIRS.map(({leftGroupKey, rightGroupKey}) => ({
      leftGroupKey,
      rightGroupKey,
      pairs: candidate.groups[leftGroupKey].map((leftIndex, index) => [
        leftIndex,
        candidate.groups[rightGroupKey][index],
      ]),
    })),
  ];

  candidate.tier2Approval = {
    approvalFile: path.basename(primaryApprovalFile),
    approvalSha256: sha256File(primaryApprovalFile),
    approvedAtUtc: primaryApproval.reviewedAtUtc,
    approvalScope: primaryApproval.approvalProvenance?.scope ?? null,
    reviewerId: primaryApproval.reviewerId,
    sourceCapturePairId: primaryApproval.capturePairId,
  };
  candidate.baseCandidate = {
    candidateFile: path.basename(baseCandidateFile),
    candidateId: baseCandidate.candidateId,
    candidateSha256: sha256File(baseCandidateFile),
  };
  candidate.warnings = [
    ...(candidate.warnings ?? []),
    'Tier-2 여섯 그룹은 product-owner가 primary board에서 승인한 고정 topology patch다.',
    '실제 지표는 faceScale 정규화 상대값이며 절대 mm 또는 임상 진단값이 아니다.',
    '새로운 3명×3회 neutral 실기기 반복성 검증은 product-owner 결정으로 이번 승격에서 면제됐다.',
  ];

  const groupErrors = validateCandidateGroups(
    candidate.groups,
    candidate.topologyFingerprint.vertexCount,
  );
  const symmetryErrors = validateBilateralSymmetryPolicy(
    candidate,
    referenceCapture.uvs,
  );
  requireCondition(
    groupErrors.length === 0 && symmetryErrors.length === 0,
    [...groupErrors, ...symmetryErrors].join('\n'),
  );
  return candidate;
}

function parseArguments(argv) {
  const force = argv.includes('--force');
  const filtered = argv.filter(value => value !== '--force');
  requireCondition(
    filtered.length === 5 && filtered[3] === '--output',
    '사용법: node build-tier2-runtime-candidate.mjs <g1-candidate.json> <primary-approved-patch.json> <reference-capture-dir> --output <g2-candidate.json> [--force]',
  );
  return {
    baseCandidatePath: path.resolve(filtered[0]),
    primaryApprovalPath: path.resolve(filtered[1]),
    referenceCapturePath: path.resolve(filtered[2], 'arface_export.json'),
    outputPath: path.resolve(filtered[4]),
    force,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const paths = parseArguments(argv);
  requireCondition(paths.force || !fs.existsSync(paths.outputPath), `출력 파일이 이미 있습니다: ${paths.outputPath}`);
  const candidate = buildTier2RuntimeCandidate({
    baseCandidate: readJson(paths.baseCandidatePath, 'G1 base candidate'),
    baseCandidateFile: paths.baseCandidatePath,
    primaryApproval: readJson(paths.primaryApprovalPath, 'Tier-2 primary approval'),
    primaryApprovalFile: paths.primaryApprovalPath,
    referenceCapture: readJson(paths.referenceCapturePath, 'reference capture'),
  });
  fs.mkdirSync(path.dirname(paths.outputPath), {recursive: true});
  fs.writeFileSync(paths.outputPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  console.log(`Face3D G2 runtime candidate 생성 완료: ${paths.outputPath}`);
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(`Face3D G2 runtime candidate 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
