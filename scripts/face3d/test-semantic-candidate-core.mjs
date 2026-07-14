#!/usr/bin/env node

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BILATERAL_REFERENCE_GROUP_PAIRS,
  BILATERAL_SYMMETRY_POLICY_VERSION,
  CANDIDATE_SCHEMA_VERSION,
  FORBIDDEN_GROUP_OVERLAPS,
  GROUP_OVERLAP_POLICY_VERSION,
  MEASUREMENT_LANDMARK_GROUP_KEYS,
  REFERENCE_PLANE_GROUP_KEYS,
  SEMANTIC_GROUPS,
  buildApprovedRuntimeMap,
  buildReviewHtml,
  buildSemanticCandidate,
  buildSemanticConsensusCandidate,
  validateBilateralSymmetryPolicy,
  validateCandidateGroups,
} from './semantic-candidate-core.mjs';

function createGridExport(columns = 35, rows = 35) {
  const localVertices = [];
  const screenVertices = [];
  const uvs = [];
  const indices = [];
  const width = 750;
  const height = 950;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u = column / (columns - 1);
      const v = row / (rows - 1);
      const centerDistance = Math.hypot(u - 0.5, v - 0.52);
      const depth = 0.42 + (centerDistance * 0.04) - (Math.exp(-centerDistance * 18) * 0.018);
      localVertices.push([(u - 0.5) * 0.14, (0.5 - v) * 0.2, 0.5 - depth]);
      screenVertices.push([u * width, v * height, depth, 1]);
      uvs.push([u, v]);
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const topLeft = (row * columns) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  const hash = 'a'.repeat(64);
  return {
    capturePairId: 'synthetic-grid',
    captureShotKind: 'neutral',
    display: {isMirrored: false, videoFrameSize: [width, height]},
    face3dCalibration: {
      candidateSchemaVersion: CANDIDATE_SCHEMA_VERSION,
      fingerprintSource: 'unity_exact_native_arrays',
      status: 'ready_for_candidate_generation',
      topologyFingerprint: {
        algorithm: 'sha256-le-v1',
        fingerprint: 'c'.repeat(64),
        indexCount: indices.length,
        indicesHash: hash,
        uvCount: uvs.length,
        uvHash: 'b'.repeat(64),
        vertexCount: localVertices.length,
      },
    },
    framePath: 'frame.png',
    indices,
    localVertices,
    screenVertices,
    uvs,
  };
}

function assertConnected(indices, triangles, vertexCount) {
  const selected = new Set(indices);
  const adjacency = Array.from({length: vertexCount}, () => new Set());
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const tri = [triangles[offset], triangles[offset + 1], triangles[offset + 2]];
    for (const from of tri) {
      for (const to of tri) {
        if (from !== to) adjacency[from].add(to);
      }
    }
  }
  const visited = new Set([indices[0]]);
  const queue = [indices[0]];
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of adjacency[current]) {
      if (selected.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  assert.equal(visited.size, selected.size, 'candidate patch must be mesh-connected');
}

function assertNoForbiddenGroupOverlaps(groups, label) {
  for (const {landmarkGroupKey, referencePlaneGroupKey} of FORBIDDEN_GROUP_OVERLAPS) {
    const referenceIndices = new Set(groups[referencePlaneGroupKey]);
    const overlap = groups[landmarkGroupKey].filter(index => referenceIndices.has(index));
    assert.deepEqual(
      overlap,
      [],
      `${label}: ${landmarkGroupKey} must not overlap ${referencePlaneGroupKey}`,
    );
  }
}

function assertBilateralSymmetry(candidateValue, payloadValue, label) {
  assert.deepEqual(
    validateBilateralSymmetryPolicy(candidateValue, payloadValue.uvs),
    [],
    `${label}: bilateral policy and topology UV pairs must match`,
  );
  assert.equal(
    candidateValue.bilateralSymmetryPolicy.policyVersion,
    BILATERAL_SYMMETRY_POLICY_VERSION,
  );
  for (const {leftGroupKey, rightGroupKey} of BILATERAL_REFERENCE_GROUP_PAIRS) {
    const entry = candidateValue.bilateralSymmetryPolicy.groupPairs.find(value =>
      value.leftGroupKey === leftGroupKey && value.rightGroupKey === rightGroupKey,
    );
    assert.ok(entry, `${label}: ${leftGroupKey} pair metadata`);
    assert.equal(entry.pairs.length, candidateValue.groups[leftGroupKey].length);
    assert.deepEqual(
      entry.pairs.map(pair => pair[0]).sort((left, right) => left - right),
      candidateValue.groups[leftGroupKey],
    );
    assert.deepEqual(
      entry.pairs.map(pair => pair[1]).sort((left, right) => left - right),
      candidateValue.groups[rightGroupKey],
    );
    assertConnected(
      candidateValue.groups[leftGroupKey],
      payloadValue.indices,
      payloadValue.localVertices.length,
    );
    assertConnected(
      candidateValue.groups[rightGroupKey],
      payloadValue.indices,
      payloadValue.localVertices.length,
    );
  }
}

assert.deepEqual(MEASUREMENT_LANDMARK_GROUP_KEYS, [
  'noseTipIndices',
  'chinIndices',
  'chinBottomIndices',
  'upperLipIndices',
  'lowerLipIndices',
]);
assert.deepEqual(REFERENCE_PLANE_GROUP_KEYS, [
  'midfaceReferenceLeftIndices',
  'midfaceReferenceRightIndices',
  'midfaceReferenceUpperIndices',
  'chinReferenceLeftIndices',
  'chinReferenceRightIndices',
  'chinReferenceUpperIndices',
]);
assert.equal(FORBIDDEN_GROUP_OVERLAPS.length, 30);

const payload = createGridExport();
const candidate = buildSemanticCandidate(payload, {
  candidateId: 'face3d-synthetic-candidate-v1',
  createdAtUtc: '2026-07-12T00:00:00.000Z',
});

const shiftedPayload = createGridExport();
shiftedPayload.capturePairId = 'synthetic-grid-shifted';
shiftedPayload.screenVertices = shiftedPayload.screenVertices.map(([x, y, depth, clipW]) => [
  (x * 0.9) + 32,
  (y * 0.9) + 24,
  depth + 0.002,
  clipW,
]);
const consensusCandidate = buildSemanticConsensusCandidate([payload, shiftedPayload], {
  candidateId: 'face3d-synthetic-consensus-v1',
  createdAtUtc: '2026-07-12T00:00:00.000Z',
});
const reversedConsensusCandidate = buildSemanticConsensusCandidate(
  [shiftedPayload, payload],
  {
    candidateId: 'face3d-synthetic-consensus-reversed-v1',
    createdAtUtc: '2026-07-12T00:00:00.000Z',
  },
);
assert.equal(
  consensusCandidate.generationMethod,
  'multi_capture_hybrid_reviewed_seed_bilateral_uv_paired_patch_v2',
);
assert.equal(consensusCandidate.sourceCaptureCount, 2);
assert.deepEqual(consensusCandidate.sourceCapturePairIds, ['synthetic-grid', 'synthetic-grid-shifted']);
assert.deepEqual(consensusCandidate.sourceCaptureShotKinds, ['neutral', 'neutral']);
assert.deepEqual(validateCandidateGroups(consensusCandidate.groups, payload.localVertices.length), []);
assert.equal(
  consensusCandidate.groupOverlapPolicy.policyVersion,
  GROUP_OVERLAP_POLICY_VERSION,
);
assertNoForbiddenGroupOverlaps(consensusCandidate.groups, 'consensus candidate');
assertBilateralSymmetry(consensusCandidate, payload, 'consensus candidate');
assert.deepEqual(
  reversedConsensusCandidate.groups,
  consensusCandidate.groups,
  'consensus group selection must be independent of capture input order',
);
assert.deepEqual(
  reversedConsensusCandidate.bilateralSymmetryPolicy,
  consensusCandidate.bilateralSymmetryPolicy,
  'consensus bilateral pairing must be independent of capture input order',
);

const yawPayload = {...shiftedPayload, captureShotKind: 'yawLeft'};
assert.throws(
  () => buildSemanticConsensusCandidate([payload, yawPayload]),
  /정면 neutral 캡처만/,
);

const mirroredDisplayPayload = createGridExport();
mirroredDisplayPayload.display.isMirrored = true;
assert.throws(
  () => buildSemanticCandidate(mirroredDisplayPayload),
  /display\.isMirrored=false/,
);

assert.equal(candidate.schemaVersion, CANDIDATE_SCHEMA_VERSION);
assert.equal(candidate.reviewStatus, 'candidate_only_not_runtime_approved');
assert.equal(candidate.groupOverlapPolicy.policyVersion, GROUP_OVERLAP_POLICY_VERSION);
assert.deepEqual(
  candidate.groupOverlapPolicy.measurementLandmarkGroupKeys,
  MEASUREMENT_LANDMARK_GROUP_KEYS,
);
assert.deepEqual(
  candidate.groupOverlapPolicy.referencePlaneGroupKeys,
  REFERENCE_PLANE_GROUP_KEYS,
);
assert.deepEqual(
  validateCandidateGroups(candidate.groups, payload.localVertices.length),
  [],
);
assertNoForbiddenGroupOverlaps(candidate.groups, 'single-frame candidate');
assertBilateralSymmetry(candidate, payload, 'single-frame candidate');

for (const definition of SEMANTIC_GROUPS) {
  const group = candidate.groups[definition.key];
  assert.equal(group.length, definition.targetCount, `${definition.key} target count`);
  assert.equal(new Set(group).size, group.length, `${definition.key} contains unique indices`);
  if (definition.fixedIndices) {
    assert.deepEqual(group, definition.fixedIndices, `${definition.key} uses reviewed topology seed`);
  } else {
    assertConnected(group, payload.indices, payload.localVertices.length);
  }
}

assert.throws(
  () => buildApprovedRuntimeMap(candidate, 'not-approved'),
  /사람의 오버레이 승인/,
);

const approvedCandidate = {...candidate, reviewStatus: 'human_overlay_approved'};
const runtimeMap = buildApprovedRuntimeMap(approvedCandidate, 'arkit-face3d-reviewed-v1');
assert.equal(runtimeMap.schemaVersion, 'aura.face3d-semantic-map.v1');
assert.equal(runtimeMap.mapId, 'arkit-face3d-reviewed-v1');
assert.deepEqual(runtimeMap.noseTipIndices, candidate.groups.noseTipIndices);
assert.equal(runtimeMap.topologyFingerprint.fingerprint, 'c'.repeat(64));

const asymmetricGroupsCandidate = structuredClone(approvedCandidate);
asymmetricGroupsCandidate.groups.midfaceReferenceRightIndices[0] =
  asymmetricGroupsCandidate.groups.centralRegionIndices.at(-1);
assert.equal(
  validateBilateralSymmetryPolicy(asymmetricGroupsCandidate).some(error =>
    error.includes('midfaceReferenceRightIndices') && error.includes('오른쪽 집합')),
  true,
  'changing only one side must invalidate the bilateral pair contract',
);
assert.throws(
  () => buildApprovedRuntimeMap(asymmetricGroupsCandidate, 'asymmetric-map-v1'),
  /UV mirror pair 오른쪽 집합/,
);

const duplicatePairCandidate = structuredClone(approvedCandidate);
duplicatePairCandidate.bilateralSymmetryPolicy.groupPairs[0].pairs[1] =
  [...duplicatePairCandidate.bilateralSymmetryPolicy.groupPairs[0].pairs[0]];
assert.equal(
  validateBilateralSymmetryPolicy(duplicatePairCandidate, payload.uvs).some(error =>
    error.includes('중복 UV mirror pair')
      || error.includes('같은 왼쪽 정점')
      || error.includes('같은 오른쪽 정점')),
  true,
  'duplicate bilateral pairs must be rejected',
);

const selfPairCandidate = structuredClone(approvedCandidate);
selfPairCandidate.bilateralSymmetryPolicy.groupPairs[0].pairs[0][1] =
  selfPairCandidate.bilateralSymmetryPolicy.groupPairs[0].pairs[0][0];
assert.equal(
  validateBilateralSymmetryPolicy(selfPairCandidate, payload.uvs).some(error =>
    error.includes('centerline self-pair')),
  true,
  'self-pairs must be rejected from bilateral reference groups',
);

const invalidOverlapGroups = structuredClone(candidate.groups);
invalidOverlapGroups.chinReferenceUpperIndices = [...new Set([
  31,
  32,
  28,
  ...invalidOverlapGroups.chinReferenceUpperIndices,
])].slice(0, 13);
const invalidOverlapErrors = validateCandidateGroups(
  invalidOverlapGroups,
  payload.localVertices.length,
);
assert.equal(
  invalidOverlapErrors.some(error =>
    error.includes('chinIndices ↔ chinReferenceUpperIndices')
      && error.includes('31, 32')),
  true,
  'Pogonion vertices must be rejected from the chin reference plane',
);
assert.equal(
  invalidOverlapErrors.some(error =>
    error.includes('lowerLipIndices ↔ chinReferenceUpperIndices')
      && error.includes('28')),
  true,
  'lower-lip vertices must be rejected from the chin reference plane',
);
assert.throws(
  () => buildApprovedRuntimeMap(
    {...approvedCandidate, groups: invalidOverlapGroups},
    'arkit-face3d-overlap-invalid-v1',
  ),
  /측정 landmark와 reference plane 정점이 겹칩니다/,
);

const invalidMentonOverlapGroups = structuredClone(candidate.groups);
invalidMentonOverlapGroups.chinReferenceLeftIndices = [...new Set([
  candidate.groups.chinBottomIndices[0],
  ...invalidMentonOverlapGroups.chinReferenceLeftIndices,
])].slice(0, 15);
assert.equal(
  validateCandidateGroups(
    invalidMentonOverlapGroups,
    payload.localVertices.length,
  ).some(error => error.includes('chinBottomIndices ↔ chinReferenceLeftIndices')),
  true,
  'Menton vertices must be rejected from reference-plane groups',
);

const allowedCentralNoseOverlapGroups = structuredClone(candidate.groups);
allowedCentralNoseOverlapGroups.centralRegionIndices = [...new Set([
  ...allowedCentralNoseOverlapGroups.centralRegionIndices,
  candidate.groups.noseTipIndices[0],
])];
assert.deepEqual(
  validateCandidateGroups(allowedCentralNoseOverlapGroups, payload.localVertices.length),
  [],
  'centralRegionIndices and noseTipIndices are intentionally allowed to overlap',
);

const reviewHtml = buildReviewHtml({
  candidate,
  frameDataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
  framePath: '../frame.png',
  payload,
});
assert.match(reviewHtml, /UV쌍 잠금/);
assert.match(reviewHtml, /좌우 UV mirror 쌍 기준군 — 읽기 전용/);
assert.match(reviewHtml, /Face3D 시맨틱 맵 검수/);
assert.match(reviewHtml, /이 한 장짜리 편집 화면에서는 런타임 맵을 승인할 수 없습니다/);
assert.doesNotMatch(reviewHtml, /downloadApproved/);
assert.match(reviewHtml, /noseTipIndices/);
assert.match(reviewHtml, /data:image\/svg\+xml;base64,PHN2Zy8\+/);

const legacyPayload = {...payload};
delete legacyPayload.face3dCalibration;
assert.throws(
  () => buildSemanticCandidate(legacyPayload),
  /topology fingerprint가 없습니다/,
);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-face3d-semantic-'));
const captureDirectory = path.join(temporaryRoot, 'pair_face3d_semantic_test');
fs.mkdirSync(captureDirectory, {recursive: true});
fs.writeFileSync(
  path.join(captureDirectory, 'frame.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" width="750" height="950"><rect width="100%" height="100%" fill="#222"/></svg>',
  'utf8',
);
fs.writeFileSync(
  path.join(captureDirectory, 'arface_export.json'),
  `\ufeff${JSON.stringify({...payload, framePath: 'frame.svg'})}`,
  'utf8',
);
const cliResult = spawnSync(
  process.execPath,
  [new URL('./build-semantic-candidates.mjs', import.meta.url).pathname, captureDirectory],
  {encoding: 'utf8'},
);
assert.equal(cliResult.status, 0, cliResult.stderr);
const reviewDirectory = path.join(captureDirectory, 'face3d-semantic-review');
assert.equal(fs.existsSync(path.join(reviewDirectory, 'ARKitFaceSemanticMapV1.candidate.json')), true);
assert.equal(fs.existsSync(path.join(reviewDirectory, 'semantic_candidate_overlay.svg')), true);
assert.equal(fs.existsSync(path.join(reviewDirectory, 'semantic_candidate_review.html')), true);
if (process.env.KEEP_FACE3D_FIXTURE === '1') {
  console.log(`Face3D synthetic review fixture: ${reviewDirectory}`);
} else {
  fs.rmSync(temporaryRoot, {force: true, recursive: true});
}

console.log('Face3D semantic candidate core tests passed.');
