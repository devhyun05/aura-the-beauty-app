#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createTopologyFingerprint,
  evaluateMetrics,
  evaluateSemanticCandidateData,
  Face3DCandidateDiagnosticsError,
  METRIC_KEYS,
  TIER2_METRIC_KEYS,
  runCli,
} from './evaluate-semantic-candidate.mjs';
import {
  SEMANTIC_GROUPS,
  TIER2_BILATERAL_GROUP_PAIRS,
} from './semantic-candidate-core.mjs';

// Same geometry as Face3DCoreTests.Evaluate_ComputesNormalizedProjectionMetricsFromMappedIndices,
// expanded to satisfy the production candidate minimum vertex counts.
const GROUP_CENTERS = Object.freeze({
  noseTipIndices: [0, 0.5, 1],
  chinIndices: [0, -1, 1],
  chinBottomIndices: [0, 0.5, 0.5],
  upperLipIndices: [0, 0, 0.8],
  lowerLipIndices: [0, -0.4, 0.7],
  midfaceReferenceLeftIndices: [-1, 0, 0],
  midfaceReferenceRightIndices: [1, 0, 0],
  midfaceReferenceUpperIndices: [0, 1, 0],
  chinReferenceLeftIndices: [-1, -0.5, 0.5],
  chinReferenceRightIndices: [1, -0.5, 0.5],
  chinReferenceUpperIndices: [0, 0.5, 0.5],
  centralRegionIndices: [0, -0.2, 0.75],
});

const BASE_VERTICES = [];
const GROUPS = {};
for (const {key, minimumCount} of SEMANTIC_GROUPS) {
  GROUPS[key] = [];
  for (let index = 0; index < minimumCount; index += 1) {
    GROUPS[key].push(BASE_VERTICES.length);
    BASE_VERTICES.push([...GROUP_CENTERS[key]]);
  }
}

const G2_GROUPS = {
  nasionIndices: [],
  noseBridgeMidlineIndices: [],
  alarLeftIndices: [],
  alarRightIndices: [],
  malarApexLeftIndices: [],
  malarApexRightIndices: [],
};
function appendTier2Vertex(key, point) {
  G2_GROUPS[key].push(BASE_VERTICES.length);
  BASE_VERTICES.push(point);
}
appendTier2Vertex('nasionIndices', [0, 0.8, 0.4]);
for (let step = 1; step <= 6; step += 1) {
  const t = step / 7;
  appendTier2Vertex('noseBridgeMidlineIndices', [
    0.2,
    0.8 - (0.3 * t),
    0.4 + (0.6 * t),
  ]);
}
for (const point of [
  [-0.30, 0.2, 0.6],
  [-0.40, 0.2, 0.6],
  [-0.25, 0.2, 0.6],
  [-0.40, 0.9, 0.9],
  [-0.20, 0.2, 0.6],
]) appendTier2Vertex('alarLeftIndices', point);
for (const point of [
  [0.30, 0.2, 0.6],
  [0.45, 0.2, 0.6],
  [0.20, 0.2, 0.6],
  [0.45, 0.9, 0.9],
  [0.25, 0.2, 0.6],
]) appendTier2Vertex('alarRightIndices', point);
for (const z of [0.5, 0.62, 0.3, 0.61, 0.4]) {
  appendTier2Vertex('malarApexLeftIndices', [-0.8, 0.1, z]);
}
for (const z of [0.4, 0.55, 0.2, 0.54, 0.3]) {
  appendTier2Vertex('malarApexRightIndices', [0.8, 0.1, z]);
}
// UV mirror fixture uses exactly one centerline self-pair and therefore needs an
// odd vertex count. This vertex is topology-only and belongs to no semantic group.
BASE_VERTICES.push([0, 1.4, -0.2]);

const chinDefinition = SEMANTIC_GROUPS.find(({key}) => key === 'chinIndices');
assert.deepEqual(chinDefinition?.fixedIndices, [34, 35, 975]);
assert.equal(chinDefinition?.minimumCount, 3);
assert.equal(chinDefinition?.targetCount, 3);

const INDICES = [];
for (let index = 1; index < BASE_VERTICES.length - 1; index += 1) {
  INDICES.push(0, index, index + 1);
}

function buildMirrorUvFixture(vertexCount) {
  const desiredPairs = [
    ...GROUPS.midfaceReferenceLeftIndices.map((leftIndex, index) => [
      leftIndex,
      GROUPS.midfaceReferenceRightIndices[index],
    ]),
    ...GROUPS.chinReferenceLeftIndices.map((leftIndex, index) => [
      leftIndex,
      GROUPS.chinReferenceRightIndices[index],
    ]),
    ...G2_GROUPS.alarLeftIndices.map((leftIndex, index) => [
      leftIndex,
      G2_GROUPS.alarRightIndices[index],
    ]),
    ...G2_GROUPS.malarApexLeftIndices.map((leftIndex, index) => [
      leftIndex,
      G2_GROUPS.malarApexRightIndices[index],
    ]),
  ];
  const used = new Set(desiredPairs.flat());
  const remaining = Array.from({length: vertexCount}, (_, index) => index)
    .filter(index => !used.has(index));
  const selfIndex = remaining.pop();
  assert.equal(remaining.length % 2, 0);
  const pairs = [...desiredPairs];
  while (remaining.length > 0) {
    pairs.push([remaining.shift(), remaining.shift()]);
  }
  const uvs = Array.from({length: vertexCount});
  const mirrorIndices = Array.from({length: vertexCount});
  for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
    const [leftIndex, rightIndex] = pairs[pairIndex];
    const v = (pairIndex + 1) / (pairs.length + 2);
    uvs[leftIndex] = [0.2, v];
    uvs[rightIndex] = [0.8, v];
    mirrorIndices[leftIndex] = rightIndex;
    mirrorIndices[rightIndex] = leftIndex;
  }
  uvs[selfIndex] = [0.5, (pairs.length + 1) / (pairs.length + 2)];
  mirrorIndices[selfIndex] = selfIndex;

  let minimumAmbiguityRatio = Number.POSITIVE_INFINITY;
  let maximumResidual = 0;
  for (let index = 0; index < uvs.length; index += 1) {
    const distances = uvs.map((uv, candidateIndex) => ({
      candidateIndex,
      distance: Math.hypot((1 - uvs[index][0]) - uv[0], uvs[index][1] - uv[1]),
    })).sort((left, right) =>
      left.distance - right.distance || left.candidateIndex - right.candidateIndex,
    );
    assert.equal(distances[0].candidateIndex, mirrorIndices[index]);
    maximumResidual = Math.max(maximumResidual, distances[0].distance);
    minimumAmbiguityRatio = Math.min(
      minimumAmbiguityRatio,
      distances[1].distance / Math.max(distances[0].distance, 1e-9),
    );
  }
  return {
    maximumResidual,
    minimumAmbiguityRatio,
    mirrorIndices,
    pairs,
    selfIndex,
    uvs,
  };
}

const MIRROR_FIXTURE = buildMirrorUvFixture(BASE_VERTICES.length);
const UVS = MIRROR_FIXTURE.uvs;
const MENTON_INDICES = new Set(GROUPS.chinBottomIndices);

function transformVertices(vertices, scale, translation) {
  return vertices.map(([x, y, z], index) => {
    const transformed = [
      (x * scale) + translation[0],
      (y * scale) + translation[1],
      (z * scale) + translation[2],
    ];
    // Menton is deliberately allowed to move independently: it is not consumed by
    // the current five metrics, while chinIndices/Pogonion is.
    return MENTON_INDICES.has(index)
      ? [transformed[0] + 100, transformed[1] - 100, transformed[2] + 100]
      : transformed;
  });
}

function buildCandidate(topology, includeTier2 = false) {
  const groups = structuredClone(GROUPS);
  if (includeTier2) Object.assign(groups, structuredClone(G2_GROUPS));
  const selectedPairs = (leftGroupKey, rightGroupKey) =>
    groups[leftGroupKey].map((leftIndex, index) => [
      leftIndex,
      groups[rightGroupKey][index],
    ]);
  const tier2GroupPairs = includeTier2
    ? TIER2_BILATERAL_GROUP_PAIRS.map(({leftGroupKey, rightGroupKey}) => ({
        leftGroupKey,
        rightGroupKey,
        pairs: selectedPairs(leftGroupKey, rightGroupKey),
      }))
    : [];
  return {
    schemaVersion: 'aura.face3d-semantic-candidate.v1',
    candidateId: 'focused-offline-evaluator-fixture',
    source: 'arkit_face_mesh',
    gateVersion: 'face3d-gate-v1',
    reviewStatus: 'candidate_only_not_runtime_approved',
    generationMethod: 'test_fixture',
    topologyFingerprint: topology,
    bilateralSymmetryPolicy: {
      policyVersion: 'uv-reflection-mutual-nearest-paired-connected-v2',
      mirrorSource: 'topology_uv_reflection',
      mirrorMapSha256: crypto
        .createHash('sha256')
        .update(JSON.stringify(MIRROR_FIXTURE.mirrorIndices))
        .digest('hex'),
      topologyUvHash: topology.uvHash,
      residualCap: 0.00125,
      minimumAmbiguityRatioRequired: 2,
      maximumResidual: MIRROR_FIXTURE.maximumResidual,
      minimumAmbiguityRatio: MIRROR_FIXTURE.minimumAmbiguityRatio,
      topologyMirrorPairCount: MIRROR_FIXTURE.pairs.length,
      topologySelfPairCount: 1,
      groupPairs: [
        {
          leftGroupKey: 'midfaceReferenceLeftIndices',
          rightGroupKey: 'midfaceReferenceRightIndices',
          uvSideBounds: {maximumLeftU: 0.405, minimumRightU: 0.595},
          pairs: selectedPairs(
            'midfaceReferenceLeftIndices',
            'midfaceReferenceRightIndices',
          ),
        },
        {
          leftGroupKey: 'chinReferenceLeftIndices',
          rightGroupKey: 'chinReferenceRightIndices',
          pairs: selectedPairs(
            'chinReferenceLeftIndices',
            'chinReferenceRightIndices',
          ),
        },
        ...tier2GroupPairs,
      ],
    },
    groups,
  };
}

function buildCapture(topology, vertices, capturePairId, captureShotKind) {
  return {
    schemaVersion: 'e7-arface-frame-export-v1',
    capturePairId,
    captureShotKind,
    indices: structuredClone(INDICES),
    uvs: structuredClone(UVS),
    localVertices: structuredClone(vertices),
    face3dCalibration: {
      status: 'ready_for_candidate_generation',
      candidateSchemaVersion: 'aura.face3d-semantic-candidate.v1',
      fingerprintSource: 'unity_exact_native_arrays',
      topologyFingerprint: structuredClone(topology),
    },
  };
}

function assertThrowsCode(callback, code) {
  assert.throws(callback, error => (
    error instanceof Face3DCandidateDiagnosticsError
      && error.code === code
  ));
}

function assertNoRawPayloadKeys(value) {
  const forbiddenKeys = new Set([
    'localVertices',
    'screenVertices',
    'worldVertices',
    'framePath',
    'frame',
  ]);
  const visit = current => {
    if (!current || typeof current !== 'object') {
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      assert.equal(forbiddenKeys.has(key), false, `raw payload key leaked: ${key}`);
      visit(child);
    }
  };
  visit(value);
}

const topology = createTopologyFingerprint(INDICES, UVS, BASE_VERTICES.length);
const candidate = buildCandidate(topology);
const captureA = buildCapture(topology, BASE_VERTICES, 'capture-a', 'neutral');
const captureB = buildCapture(
  topology,
  transformVertices(BASE_VERTICES, 2.5, [4, -3, 7]),
  'capture-b',
  'yawLeft',
);

const diagnostics = evaluateSemanticCandidateData(
  candidate,
  [
    {payload: captureA, sourceLabel: 'capture-a'},
    {payload: captureB, sourceLabel: 'capture-b'},
  ],
  {generatedAtUtc: '2026-01-01T00:00:00.000Z'},
);

assert.equal(diagnostics.status, 'provisional_candidate_diagnostics');
assert.equal(diagnostics.validation.bilateralSymmetryPolicyValid, true);
assert.equal(diagnostics.validation.bilateralSymmetryValidatedAgainstCaptureUvs, true);
assert.equal(
  diagnostics.validation.bilateralMirrorMapSha256,
  candidate.bilateralSymmetryPolicy.mirrorMapSha256,
);
assert.equal(diagnostics.validation.runtimeMetricGroupCount, 11);
assert.equal(diagnostics.validation.chinProjectionLandmark.startsWith('chinIndices'), true);
assert.match(
  diagnostics.validation.validatedButUnusedByCurrentMetrics.chinBottomIndices,
  /Menton/,
);
assert.equal(diagnostics.captures.length, 2);
for (const capture of diagnostics.captures) {
  assert.equal(
    capture.derivedGeometry.selectedPogonionVertexIndex,
    GROUPS.chinIndices[0],
    'equal Pogonion projections must select the smaller vertex index',
  );
}
for (const key of METRIC_KEYS) {
  assert.ok(Number.isFinite(diagnostics.captures[0].metrics[key]));
  assert.ok(Math.abs(
    diagnostics.captures[0].metrics[key]
      - diagnostics.captures[1].metrics[key],
  ) < 1e-12, `${key} should be invariant under translation and uniform scale`);
  assert.ok(diagnostics.metricSummary[key].range < 1e-12);
  assert.ok(diagnostics.metricSummary[key].mad < 1e-12);
}
const unityGoldenMetrics = {
  noseTipProjection: 0.5,
  // C1: chin projected onto the midface plane (like noseTip); chin and nose share z=1.0 in
  // this synthetic mesh, so chin now reads 0.5 (was 0.25 under the old chin-neighbor plane).
  chinProjection: 0.5,
  upperLipToELine: -0.1,
  lowerLipToELine: -0.15,
  centralProjectionScore: 0.375,
};
for (const [key, expected] of Object.entries(unityGoldenMetrics)) {
  assert.ok(
    Math.abs(diagnostics.captures[0].metrics[key] - expected) < 1e-12,
    `${key} must match the Unity Face3DCoreTests golden value`,
  );
}

const g2Candidate = buildCandidate(topology, true);
const g2Diagnostics = evaluateSemanticCandidateData(
  g2Candidate,
  [{payload: captureA}, {payload: captureB}],
  {generatedAtUtc: '2026-01-01T00:00:00.000Z'},
);
assert.equal(g2Diagnostics.validation.tier2RuntimeFormulaParity, true);
assert.equal(g2Diagnostics.validation.runtimeMetricGroupCount, 17);
assert.deepEqual(
  g2Diagnostics.validation.evaluatedMetricKeys,
  [...METRIC_KEYS, ...TIER2_METRIC_KEYS],
);
const tier2GoldenMetrics = {
  noseLength: Math.sqrt(0.45) / 2,
  nasalBridgeStraightness: 0.1,
  nasalAxisDeviation: 0.1,
  alarWidth: 0.425,
  malarProjectionLeft: 0.31,
  malarProjectionRight: 0.275,
};
for (const [key, expected] of Object.entries(tier2GoldenMetrics)) {
  assert.ok(
    Math.abs(g2Diagnostics.captures[0].metrics[key] - expected) < 1e-12,
    `${key} must match the Unity Tier-2 golden value`,
  );
  assert.ok(
    Math.abs(
      g2Diagnostics.captures[0].metrics[key]
        - g2Diagnostics.captures[1].metrics[key],
    ) < 1e-12,
    `${key} should be invariant under translation and uniform scale`,
  );
}
assert.equal(
  g2Diagnostics.captures[0].derivedGeometry.selectedAlarLeftVertexIndex,
  G2_GROUPS.alarLeftIndices[1],
  'left alare ties must choose the smaller vertex index',
);
assert.equal(
  g2Diagnostics.captures[0].derivedGeometry.selectedAlarRightVertexIndex,
  G2_GROUPS.alarRightIndices[1],
  'right alare ties must choose the smaller vertex index',
);

const clearlyForwardPogonionIndex = GROUPS.chinIndices.at(-1);
const clearlyForwardVertices = structuredClone(BASE_VERTICES);
clearlyForwardVertices[clearlyForwardPogonionIndex] = [0.25, -0.8, 2];
const clearlyForwardEvaluation = evaluateMetrics(clearlyForwardVertices, GROUPS);
assert.equal(
  clearlyForwardEvaluation.selectedPogonionVertexIndex,
  clearlyForwardPogonionIndex,
  'Pogonion must be the chin patch vertex with maximum signed midface-plane projection',
);

const selectedPointOnlyVertices = structuredClone(clearlyForwardVertices);
for (const index of GROUPS.chinIndices) {
  selectedPointOnlyVertices[index] = [0.25, -0.8, 2];
}
const selectedPointOnlyEvaluation = evaluateMetrics(selectedPointOnlyVertices, GROUPS);
for (const key of ['chinProjection', 'upperLipToELine', 'lowerLipToELine']) {
  assert.ok(
    Math.abs(
      clearlyForwardEvaluation.metrics[key]
        - selectedPointOnlyEvaluation.metrics[key]
    ) < 1e-12,
    `${key} must use the same selected Pogonion vertex instead of the chin patch centroid`,
  );
}

const smallerPogonionIndex = GROUPS.chinIndices[0];
const largerPogonionIndex = GROUPS.chinIndices.at(-1);
const tiedPogonionVertices = structuredClone(BASE_VERTICES);
tiedPogonionVertices[smallerPogonionIndex] = [0, -1, 2];
tiedPogonionVertices[largerPogonionIndex] = [0.4, -0.8, 2.0000015];
assert.equal(
  evaluateMetrics(tiedPogonionVertices, GROUPS).selectedPogonionVertexIndex,
  smallerPogonionIndex,
  'normalized projections within 1e-6 must select the smaller vertex index',
);
tiedPogonionVertices[largerPogonionIndex][2] = 2.000003;
assert.equal(
  evaluateMetrics(tiedPogonionVertices, GROUPS).selectedPogonionVertexIndex,
  largerPogonionIndex,
  'a projection more than 1e-6 ahead must win even when its vertex index is larger',
);
assert.equal('sourceLabel' in diagnostics.captures[0], false);

assertNoRawPayloadKeys(diagnostics);

assertThrowsCode(
  () => evaluateSemanticCandidateData(candidate, [
    {payload: captureA, sourceLabel: 'capture-a'},
    {payload: structuredClone(captureA), sourceLabel: 'copied-capture-a'},
  ]),
  'duplicate_capture_pair_id',
);

const missingRuntimeGroup = buildCandidate(topology);
delete missingRuntimeGroup.groups.chinIndices;
assertThrowsCode(
  () => evaluateSemanticCandidateData(missingRuntimeGroup, [
    {payload: captureA},
    {payload: captureB},
  ]),
  'semantic_groups_invalid',
);

const asymmetricCandidate = buildCandidate(topology);
asymmetricCandidate.groups.midfaceReferenceRightIndices[0] =
  asymmetricCandidate.groups.centralRegionIndices.at(-1);
assertThrowsCode(
  () => evaluateSemanticCandidateData(asymmetricCandidate, [
    {payload: captureA},
    {payload: captureB},
  ]),
  'semantic_groups_invalid',
);

const invalidMirrorPairCandidate = buildCandidate(topology);
invalidMirrorPairCandidate.bilateralSymmetryPolicy.groupPairs[0].pairs[0][1] =
  invalidMirrorPairCandidate.bilateralSymmetryPolicy.groupPairs[0].pairs[1][1];
assertThrowsCode(
  () => evaluateSemanticCandidateData(invalidMirrorPairCandidate, [
    {payload: captureA},
    {payload: captureB},
  ]),
  'semantic_groups_invalid',
);

const undersizedCandidateGroup = buildCandidate(topology);
undersizedCandidateGroup.groups.centralRegionIndices =
  undersizedCandidateGroup.groups.centralRegionIndices.slice(0, 15);
assertThrowsCode(
  () => evaluateSemanticCandidateData(undersizedCandidateGroup, [
    {payload: captureA},
    {payload: captureB},
  ]),
  'semantic_groups_invalid',
);

const runtimeApprovedCandidate = buildCandidate(topology);
runtimeApprovedCandidate.reviewStatus = 'human_overlay_approved';
assertThrowsCode(
  () => evaluateSemanticCandidateData(runtimeApprovedCandidate, [
    {payload: captureA},
    {payload: captureB},
  ]),
  'candidate_review_status_unsupported',
);

const nonFiniteCapture = structuredClone(captureA);
nonFiniteCapture.localVertices[0][2] = Number.NaN;
assertThrowsCode(
  () => evaluateSemanticCandidateData(candidate, [
    {payload: nonFiniteCapture},
    {payload: captureB},
  ]),
  'mesh_vertex_not_finite',
);

const missingCapturePairId = structuredClone(captureA);
delete missingCapturePairId.capturePairId;
assertThrowsCode(
  () => evaluateSemanticCandidateData(candidate, [
    {payload: missingCapturePairId},
    {payload: captureB},
  ]),
  'capture_pair_id_missing',
);

const mismatchedUvs = structuredClone(UVS);
mismatchedUvs[0][0] = 0.125;
const mismatchedTopology = createTopologyFingerprint(INDICES, mismatchedUvs, BASE_VERTICES.length);
const mismatchedCapture = buildCapture(
  mismatchedTopology,
  BASE_VERTICES,
  'capture-mismatch',
  'yawRight',
);
mismatchedCapture.uvs = mismatchedUvs;
assertThrowsCode(
  () => evaluateSemanticCandidateData(candidate, [
    {payload: captureA},
    {payload: mismatchedCapture},
  ]),
  'unknown_face_mesh_topology',
);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'face3d-offline-evaluator-'));
try {
  const candidatePath = path.join(temporaryRoot, 'candidate.json');
  const captureDirectoryA = path.join(temporaryRoot, 'capture-a');
  const captureDirectoryB = path.join(temporaryRoot, 'capture-b');
  const outputPath = path.join(temporaryRoot, 'diagnostics.json');
  fs.mkdirSync(captureDirectoryA);
  fs.mkdirSync(captureDirectoryB);
  fs.writeFileSync(candidatePath, JSON.stringify(candidate), 'utf8');
  fs.writeFileSync(path.join(captureDirectoryA, 'arface_export.json'), JSON.stringify(captureA), 'utf8');
  fs.writeFileSync(path.join(captureDirectoryB, 'arface_export.json'), JSON.stringify(captureB), 'utf8');
  let stdout = '';
  runCli(
    [
      candidatePath,
      captureDirectoryA,
      captureDirectoryB,
      '--output',
      outputPath,
    ],
    {stdout: {write: value => { stdout += value; }}},
  );
  assert.match(stdout, /provisional_candidate_diagnostics/);
  const cliOutput = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(cliOutput.status, 'provisional_candidate_diagnostics');
  assert.equal(cliOutput.captures.length, 2);
  assertNoRawPayloadKeys(cliOutput);

  assertThrowsCode(
    () => runCli([
      candidatePath,
      captureDirectoryA,
      captureDirectoryA,
      '--output',
      path.join(temporaryRoot, 'duplicate-directory.json'),
    ]),
    'duplicate_capture_directory',
  );
  assertThrowsCode(
    () => runCli([
      candidatePath,
      captureDirectoryA,
      captureDirectoryB,
      '--force',
      '--output',
      candidatePath,
    ]),
    'output_input_collision',
  );
  assertThrowsCode(
    () => runCli([
      candidatePath,
      captureDirectoryA,
      captureDirectoryB,
      '--output',
      outputPath,
    ]),
    'output_exists',
  );
  runCli(
    [
      candidatePath,
      captureDirectoryA,
      captureDirectoryB,
      '--force',
      '--output',
      outputPath,
    ],
    {stdout: {write: () => {}}},
  );
} finally {
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
}

console.log('Face3D offline semantic candidate evaluator focused tests passed.');
