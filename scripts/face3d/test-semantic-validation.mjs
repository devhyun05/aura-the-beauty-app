#!/usr/bin/env node

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  CANDIDATE_SCHEMA_VERSION,
  VALIDATION_SCHEMA_VERSION,
  computeCandidateSemanticContentSha256,
} from './build-semantic-validation.mjs';

const scriptPath = fileURLToPath(new URL('./build-semantic-validation.mjs', import.meta.url));
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const fixtureUvs = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

function bilateralSymmetryPolicy() {
  return {
    policyVersion: 'uv-reflection-mutual-nearest-paired-connected-v2',
    mirrorSource: 'topology_uv_reflection',
    mirrorMapSha256: sha256(JSON.stringify([1, 0, 3, 2])),
    topologyUvHash: hashB,
    residualCap: 0.00125,
    minimumAmbiguityRatioRequired: 2,
    maximumResidual: 0,
    minimumAmbiguityRatio: 500000000,
    topologyMirrorPairCount: 2,
    topologySelfPairCount: 0,
    groupPairs: [
      {
        leftGroupKey: 'midfaceReferenceLeftIndices',
        rightGroupKey: 'midfaceReferenceRightIndices',
        uvSideBounds: {maximumLeftU: 0.405, minimumRightU: 0.595},
        pairs: [[0, 1]],
      },
      {
        leftGroupKey: 'chinReferenceLeftIndices',
        rightGroupKey: 'chinReferenceRightIndices',
        pairs: [[2, 3]],
      },
    ],
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function topology(overrides = {}) {
  const value = {
    algorithm: 'sha256-le-v1',
    vertexCount: 4,
    indexCount: 6,
    uvCount: 4,
    indicesHash: hashA,
    uvHash: hashB,
    ...overrides,
  };
  value.fingerprint = overrides.fingerprint ?? sha256([
    value.algorithm,
    'arkit_face_mesh',
    value.vertexCount,
    value.indexCount,
    value.uvCount,
    value.indicesHash.toLowerCase(),
    value.uvHash.toLowerCase(),
  ].join('|'));
  return value;
}

function writeJson(filePath, value, bom = false) {
  fs.writeFileSync(
    filePath,
    `${bom ? '\ufeff' : ''}${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

function writeCandidate(root, overrides = {}) {
  const candidatePath = path.join(root, 'candidate.json');
  writeJson(candidatePath, {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    candidateId: 'synthetic-fixed-candidate-v1',
    source: 'arkit_face_mesh',
    gateVersion: 'face3d-gate-v1',
    reviewStatus: 'candidate_edited_not_runtime_approved',
    topologyFingerprint: topology(),
    bilateralSymmetryPolicy: bilateralSymmetryPolicy(),
    groups: {
      noseTipIndices: [0],
      chinIndices: [3],
      midfaceReferenceLeftIndices: [0],
      midfaceReferenceRightIndices: [1],
      chinReferenceLeftIndices: [2],
      chinReferenceRightIndices: [3],
      centralRegionIndices: [0, 1, 2, 3],
    },
    groupDefinitions: {
      noseTipIndices: {color: '#ff3b30', label: '코끝'},
      chinIndices: {color: '#007aff', label: '턱 전방점'},
      centralRegionIndices: {color: '#64d2ff', label: '중앙 얼굴 ROI'},
    },
    ...overrides,
  });
  return candidatePath;
}

function writeCapture(root, name, shotKind, options = {}) {
  const captureDirectory = path.join(root, name);
  fs.mkdirSync(captureDirectory, {recursive: true});
  fs.writeFileSync(
    path.join(captureDirectory, 'frame.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#222"/></svg>`,
    'utf8',
  );
  const captureTopology = topology(options.topologyOverrides);
  const captureSetId = options.captureSetId ?? 'synthetic-subject-01';
  const screenVertices = options.screenVertices ?? [
    [20, 15, 0.4, 1],
    [80, 15, 0.4, 1],
    [20, 65, 0.4, 1],
    [80, 65, 0.4, 1],
  ];
  writeJson(path.join(captureDirectory, 'arface_export.json'), {
    capturePairId: name,
    captureSetId,
    captureShotKind: shotKind,
    display: {videoFrameSize: [100, 80]},
    face3dCalibration: {topologyFingerprint: captureTopology},
    framePath: 'frame.svg',
    indices: [0, 2, 1, 1, 2, 3],
    screenVertices,
    uvs: options.uvs ?? fixtureUvs,
  }, true);
  writeJson(path.join(captureDirectory, 'capture_summary.json'), {
    capturePairId: options.summaryPairId ?? name,
    captureSetId: options.summarySetId ?? captureSetId,
    captureShotKind: options.summaryShotKind ?? shotKind,
    frameWidth: 100,
    frameHeight: 80,
    meshVertexCount: 4,
    meshIndexCount: 6,
    meshUvCount: 4,
    face3dCalibration: {topologyFingerprint: captureTopology},
  });
  return captureDirectory;
}

function runCli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {encoding: 'utf8'});
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-face3d-validation-'));
try {
  const candidatePath = writeCandidate(temporaryRoot);
  const neutralDirectory = writeCapture(temporaryRoot, 'capture-neutral', 'neutral');
  const yawLeftDirectory = writeCapture(temporaryRoot, 'capture-yaw-left', 'yawLeft');
  const outputDirectory = path.join(temporaryRoot, 'validation-output');

  const success = runCli([
    candidatePath,
    neutralDirectory,
    yawLeftDirectory,
    '--output',
    outputDirectory,
  ]);
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /재투영 검증판 생성 완료 \(2 captures\)/);
  assert.match(success.stderr, /런타임 승인 파일을 자동 생성하지 않습니다/);
  assert.match(success.stderr, /서로 다른 얼굴 3명 조건.*자동 증명할 수 없습니다/);

  const htmlPath = path.join(outputDirectory, 'semantic_validation_matrix.html');
  const summaryPath = path.join(outputDirectory, 'semantic_validation_summary.json');
  assert.equal(fs.existsSync(htmlPath), true);
  assert.equal(fs.existsSync(summaryPath), true);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'ARKitFaceSemanticMapV1.json')), false);

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /data:image\/svg\+xml;base64,/);
  assert.match(html, /capture-neutral/);
  assert.match(html, /capture-yaw-left/);
  assert.match(html, /neutral/);
  assert.match(html, /yawLeft/);
  assert.match(html, /semantic-group-0/);
  assert.match(html, /id="label-toggle"/);
  assert.match(html, /서로 다른 얼굴 3명 조건/);
  assert.doesNotMatch(html, /src="\.\.\//);

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(summary.schemaVersion, VALIDATION_SCHEMA_VERSION);
  assert.equal(summary.captureCount, 2);
  assert.equal(summary.runtimeMapGenerated, false);
  assert.equal(summary.subjectCoverage.status, 'not_machine_verifiable');
  assert.match(summary.candidate.semanticContentSha256, /^[a-f0-9]{64}$/);
  assert.equal(summary.bilateralSymmetryValidation.status, 'passed');
  assert.equal(
    summary.bilateralSymmetryValidation.policyVersion,
    'uv-reflection-mutual-nearest-paired-connected-v2',
  );
  assert.equal(summary.bilateralSymmetryValidation.groupPairCount, 2);
  assert.equal(summary.bilateralSymmetryValidation.selectedMirrorPairCount, 2);
  assert.deepEqual(summary.captureShotKinds, ['neutral', 'yawLeft']);
  assert.deepEqual(summary.captureSetIds, ['synthetic-subject-01']);
  assert.equal(summary.sameCaptureSet, true);
  assert.equal(summary.reviewMatrix.file, 'semantic_validation_matrix.html');
  assert.equal(summary.reviewMatrix.sha256, sha256(html));
  assert.equal(summary.captures.every(capture => capture.fullMeshInFrame), true);
  assert.equal(summary.captures.every(capture => capture.topologyMatch), true);
  assert.deepEqual(
    summary.captures.map(capture => capture.overlayFile),
    ['semantic_validation_01_neutral.svg', 'semantic_validation_02_yawLeft.svg'],
  );
  for (const capture of summary.captures) {
    const overlayPath = path.join(outputDirectory, capture.overlayFile);
    assert.equal(fs.existsSync(overlayPath), true);
    const overlay = fs.readFileSync(overlayPath, 'utf8');
    assert.equal(capture.captureSetId, 'synthetic-subject-01');
    assert.equal(capture.overlaySha256, sha256(overlay));
    assert.match(overlay, /data:image\/svg\+xml;base64,/);
    assert.match(overlay, /고정 후보 재투영/);
  }

  const baseCandidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const policyChangedCandidate = structuredClone(baseCandidate);
  policyChangedCandidate.bilateralSymmetryPolicy.maximumResidual = 0.0001;
  assert.notEqual(
    computeCandidateSemanticContentSha256(baseCandidate),
    computeCandidateSemanticContentSha256(policyChangedCandidate),
    'bilateral policy changes must alter semantic content SHA',
  );

  const asymmetricCandidate = structuredClone(baseCandidate);
  asymmetricCandidate.groups.midfaceReferenceRightIndices = [3];
  const asymmetricCandidatePath = path.join(temporaryRoot, 'asymmetric-candidate.json');
  writeJson(asymmetricCandidatePath, asymmetricCandidate);
  const asymmetric = runCli([
    asymmetricCandidatePath,
    neutralDirectory,
    yawLeftDirectory,
    '--output',
    path.join(temporaryRoot, 'asymmetric-output'),
  ]);
  assert.equal(asymmetric.status, 1);
  assert.match(asymmetric.stderr, /midfaceReferenceRightIndices.*UV mirror pair 오른쪽 집합/);

  const mismatchedUvDirectory = writeCapture(
    temporaryRoot,
    'capture-uv-mirror-mismatch',
    'yawRight',
    {uvs: [[0.2, 0.2], [0.7, 0.2], [0.2, 0.8], [0.7, 0.8]]},
  );
  const mismatchedUv = runCli([
    candidatePath,
    neutralDirectory,
    mismatchedUvDirectory,
    '--output',
    path.join(temporaryRoot, 'uv-mirror-mismatch-output'),
  ]);
  assert.equal(mismatchedUv.status, 1);
  assert.match(mismatchedUv.stderr, /bilateral symmetry 검증 실패|UV mirror 대응/);

  const topologyMismatchDirectory = writeCapture(
    temporaryRoot,
    'capture-topology-mismatch',
    'yawRight',
    {topologyOverrides: {indicesHash: 'd'.repeat(64)}},
  );
  const topologyMismatch = runCli([
    candidatePath,
    neutralDirectory,
    topologyMismatchDirectory,
    '--output',
    path.join(temporaryRoot, 'topology-mismatch-output'),
  ]);
  assert.equal(topologyMismatch.status, 1);
  assert.match(topologyMismatch.stderr, /topology fingerprint가 후보와 다릅니다: indicesHash, fingerprint/);

  const inconsistentFingerprintDirectory = writeCapture(
    temporaryRoot,
    'capture-inconsistent-fingerprint',
    'yawRight',
    {topologyOverrides: {fingerprint: 'd'.repeat(64)}},
  );
  const inconsistentFingerprint = runCli([
    candidatePath,
    neutralDirectory,
    inconsistentFingerprintDirectory,
    '--output',
    path.join(temporaryRoot, 'inconsistent-fingerprint-output'),
  ]);
  assert.equal(inconsistentFingerprint.status, 1);
  assert.match(inconsistentFingerprint.stderr, /Unity composite 계약과 일치하지 않습니다/);

  const croppedDirectory = writeCapture(
    temporaryRoot,
    'capture-cropped',
    'yawRight',
    {screenVertices: [[-1, 15, 0.4, 1], [80, 15, 0.4, 1], [20, 65, 0.4, 1], [80, 81, 0.4, 1]]},
  );
  const cropped = runCli([
    candidatePath,
    neutralDirectory,
    croppedDirectory,
    '--output',
    path.join(temporaryRoot, 'cropped-output'),
  ]);
  assert.equal(cropped.status, 1);
  assert.match(cropped.stderr, /얼굴 메시 전체가 프레임 안에 있지 않습니다.*화면 밖 정점 2개/);

  const inconsistentSummaryDirectory = writeCapture(
    temporaryRoot,
    'capture-summary-mismatch',
    'yawRight',
    {summaryShotKind: 'neutral'},
  );
  const inconsistentSummary = runCli([
    candidatePath,
    neutralDirectory,
    inconsistentSummaryDirectory,
    '--output',
    path.join(temporaryRoot, 'summary-mismatch-output'),
  ]);
  assert.equal(inconsistentSummary.status, 1);
  assert.match(inconsistentSummary.stderr, /captureShotKind가 ARFace 덤프와 다릅니다/);

  const inconsistentSetDirectory = writeCapture(
    temporaryRoot,
    'capture-set-mismatch',
    'yawRight',
    {summarySetId: 'different-set'},
  );
  const inconsistentSet = runCli([
    candidatePath,
    neutralDirectory,
    inconsistentSetDirectory,
    '--output',
    path.join(temporaryRoot, 'set-mismatch-output'),
  ]);
  assert.equal(inconsistentSet.status, 1);
  assert.match(inconsistentSet.stderr, /captureSetId가 ARFace 덤프와 다릅니다/);

  const unknownShotDirectory = writeCapture(
    temporaryRoot,
    'capture-unknown-shot',
    'profile',
  );
  const unknownShot = runCli([
    candidatePath,
    neutralDirectory,
    unknownShotDirectory,
    '--output',
    path.join(temporaryRoot, 'unknown-shot-output'),
  ]);
  assert.equal(unknownShot.status, 1);
  assert.match(unknownShot.stderr, /captureShotKind가 지원 범위를 벗어났습니다: profile/);

  const runtimeCandidatePath = writeCandidate(temporaryRoot, {
    schemaVersion: 'aura.face3d-semantic-map.v1',
    reviewStatus: 'human_overlay_approved',
  });
  const runtimeCandidate = runCli([
    runtimeCandidatePath,
    neutralDirectory,
    yawLeftDirectory,
    '--output',
    path.join(temporaryRoot, 'runtime-candidate-output'),
  ]);
  assert.equal(runtimeCandidate.status, 1);
  assert.match(runtimeCandidate.stderr, /승인 전 candidate JSON만 사용할 수 있습니다/);
} finally {
  if (process.env.KEEP_FACE3D_VALIDATION_FIXTURE === '1') {
    console.log(`Face3D validation fixture: ${temporaryRoot}`);
  } else {
    fs.rmSync(temporaryRoot, {force: true, recursive: true});
  }
}

console.log('Face3D semantic validation tests passed.');
