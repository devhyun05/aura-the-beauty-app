#!/usr/bin/env node

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  APPROVAL_MANIFEST_SCHEMA_VERSION,
  APPROVAL_RECEIPT_SCHEMA_VERSION,
  VALIDATION_SCHEMA_VERSION,
} from './approve-semantic-map.mjs';
import {
  computeBilateralSymmetryPolicySha256,
  computeCandidateSemanticContentSha256,
} from './build-semantic-validation.mjs';
import {
  CANDIDATE_SCHEMA_VERSION,
  SEMANTIC_GROUPS,
} from './semantic-candidate-core.mjs';

const scriptPath = fileURLToPath(new URL('./approve-semantic-map.mjs', import.meta.url));
const candidateId = 'face3d-synthetic-approved-candidate-v1';
const mapId = 'arkit-face3d-g1-reviewed-v1';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function topologyFixture(overrides = {}) {
  const value = {
    algorithm: 'sha256-le-v1',
    vertexCount: 128,
    indexCount: 6,
    uvCount: 128,
    indicesHash: 'a'.repeat(64),
    uvHash: 'b'.repeat(64),
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

const topology = Object.freeze(topologyFixture());

function writeJson(filePath, value, bom = false) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${bom ? '\ufeff' : ''}${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function candidateFixture() {
  let cursor = 0;
  const groups = Object.fromEntries(SEMANTIC_GROUPS.map(group => {
    const indices = Array.from(
      {length: group.minimumCount},
      (_, offset) => (cursor + offset) % topology.vertexCount,
    );
    cursor += group.minimumCount;
    return [group.key, indices];
  }));
  const selectedPairs = (leftGroupKey, rightGroupKey) =>
    groups[leftGroupKey].map((leftIndex, index) => [
      leftIndex,
      groups[rightGroupKey][index],
    ]);
  return {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    candidateId,
    source: 'arkit_face_mesh',
    gateVersion: 'face3d-gate-v1',
    reviewStatus: 'candidate_edited_not_runtime_approved',
    topologyFingerprint: {...topology},
    bilateralSymmetryPolicy: {
      policyVersion: 'uv-reflection-mutual-nearest-paired-connected-v2',
      mirrorSource: 'topology_uv_reflection',
      mirrorMapSha256: sha256('synthetic-approval-mirror-map'),
      topologyUvHash: topology.uvHash,
      residualCap: 0.00125,
      minimumAmbiguityRatioRequired: 2,
      maximumResidual: 0.0001,
      minimumAmbiguityRatio: 10,
      topologyMirrorPairCount: 64,
      topologySelfPairCount: 0,
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
      ],
    },
    groups,
  };
}

function validationFixture(root, subjectNumber, candidate, overrides = {}) {
  const prefix = `s${subjectNumber}`;
  const shotKinds = ['neutral', 'yawLeft', 'yawRight'];
  const captureSetIds = overrides.captureSetIds ?? shotKinds.map(() => `${prefix}-set`);
  const validationDirectory = path.join(root, 'validation');
  const captures = shotKinds.map((captureShotKind, index) => {
    const capturePairId = `${prefix}-${captureShotKind}`;
    const overlayFile = `${prefix}-${captureShotKind}.svg`;
    const overlay = `<svg data-candidate="${candidateId}" data-capture="${capturePairId}"/>\n`;
    fs.writeFileSync(path.join(validationDirectory, overlayFile), overlay, 'utf8');
    return {
      capturePairId,
      captureSetId: captureSetIds[index],
      captureShotKind,
      topologyMatch: true,
      fullMeshInFrame: true,
      overlayFile,
      overlaySha256: sha256(overlay),
    };
  });
  const matrixFile = `${prefix}-matrix.html`;
  const matrix = `<html data-candidate="${candidateId}" data-subject="${prefix}"></html>\n`;
  fs.writeFileSync(path.join(validationDirectory, matrixFile), matrix, 'utf8');
  const uniqueCaptureSetIds = [...new Set(captureSetIds)].sort();
  return {
    schemaVersion: VALIDATION_SCHEMA_VERSION,
    result: 'inputs_valid_human_overlay_review_required',
    candidate: {
      candidateId,
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      semanticContentSha256: computeCandidateSemanticContentSha256(candidate),
    },
    bilateralSymmetryValidation: {
      status: 'passed',
      policyVersion: candidate.bilateralSymmetryPolicy.policyVersion,
      policySha256: computeBilateralSymmetryPolicySha256(candidate),
      mirrorMapSha256: candidate.bilateralSymmetryPolicy.mirrorMapSha256,
      groupPairCount: candidate.bilateralSymmetryPolicy.groupPairs.length,
      selectedMirrorPairCount: candidate.bilateralSymmetryPolicy.groupPairs
        .reduce((sum, entry) => sum + entry.pairs.length, 0),
      topologyMirrorPairCount: candidate.bilateralSymmetryPolicy.topologyMirrorPairCount,
      topologySelfPairCount: candidate.bilateralSymmetryPolicy.topologySelfPairCount,
    },
    topologyFingerprint: {...topology},
    captureCount: 3,
    captureShotKinds: shotKinds,
    captureSetIds: uniqueCaptureSetIds,
    sameCaptureSet: uniqueCaptureSetIds.length === 1,
    captures,
    reviewMatrix: {file: matrixFile, sha256: sha256(matrix)},
    runtimeMapGenerated: false,
    ...overrides,
  };
}

function manifestFixture(subjects) {
  return {
    schemaVersion: APPROVAL_MANIFEST_SCHEMA_VERSION,
    candidateId,
    mapId,
    reviewer: 'reviewer-01',
    reviewedAtUtc: '2026-07-12T05:30:00Z',
    approved: true,
    distinctPeopleConfirmed: true,
    subjects,
  };
}

function runCli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {encoding: 'utf8'});
}

function setupValidFixture(root) {
  const candidatePath = path.join(root, 'candidate.json');
  const candidate = candidateFixture();
  writeJson(candidatePath, candidate, true);
  fs.mkdirSync(path.join(root, 'validation'), {recursive: true});
  const subjects = [];
  for (let subjectNumber = 1; subjectNumber <= 3; subjectNumber += 1) {
    const relativePath = `validation/subject-${String(subjectNumber).padStart(2, '0')}.json`;
    writeJson(path.join(root, relativePath), validationFixture(root, subjectNumber, candidate));
    subjects.push({
      subjectId: `subject-${String(subjectNumber).padStart(2, '0')}`,
      validationSummaryPath: relativePath,
    });
  }
  const manifestPath = path.join(root, 'approval.json');
  writeJson(manifestPath, manifestFixture(subjects));
  return {candidatePath, manifestPath, subjects};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-face3d-approval-'));
try {
  const validRoot = path.join(temporaryRoot, 'valid');
  const {candidatePath, manifestPath} = setupValidFixture(validRoot);
  const outputPath = path.join(validRoot, 'runtime', 'ARKitFaceSemanticMapV1.json');
  const receiptPath = path.join(validRoot, 'runtime', 'ARKitFaceSemanticMapV1.approval-receipt.json');
  const success = runCli([
    candidatePath,
    manifestPath,
    '--output',
    outputPath,
    '--receipt',
    receiptPath,
  ]);
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /semantic map 승인 완료/);
  assert.match(success.stdout, /3 subjects × 3 shotKinds/);

  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(fs.existsSync(receiptPath), true);
  const runtime = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(runtime.schemaVersion, 'aura.face3d-semantic-map.v1');
  assert.equal(runtime.mapId, mapId);
  assert.equal(runtime.topologyFingerprint.fingerprint, topology.fingerprint);
  for (const group of SEMANTIC_GROUPS) {
    assert.equal(Array.isArray(runtime[group.key]), true, group.key);
  }
  assert.equal(receipt.schemaVersion, APPROVAL_RECEIPT_SCHEMA_VERSION);
  assert.equal(receipt.approval.approved, true);
  assert.equal(receipt.approval.distinctPeopleConfirmed, true);
  assert.equal(receipt.approval.reviewer, 'reviewer-01');
  assert.equal(receipt.candidate.semanticContentSha256, computeCandidateSemanticContentSha256(candidateFixture()));
  assert.equal(
    receipt.candidate.bilateralSymmetry.policyVersion,
    'uv-reflection-mutual-nearest-paired-connected-v2',
  );
  assert.match(receipt.candidate.bilateralSymmetry.mirrorMapSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.evidence.subjectCount, 3);
  assert.equal('candidatePath' in receipt.candidate, false);
  assert.equal('approvalManifestPath' in receipt.evidence, false);
  assert.deepEqual(
    receipt.evidence.subjects.map(subject => subject.subjectId),
    ['subject-01', 'subject-02', 'subject-03'],
  );
  assert.equal(receipt.evidence.subjects.every(subject => subject.samePersonConfirmed), true);
  assert.equal(receipt.evidence.subjects.every(subject => subject.captureSetIds.length === 1), true);
  assert.equal(
    receipt.evidence.subjects.every(subject =>
      subject.bilateralSymmetryValidation.status === 'passed'),
    true,
  );
  assert.equal(JSON.stringify(receipt).includes(validRoot), false);
  const runtimeText = JSON.stringify(runtime);
  for (const forbidden of ['subject-01', 'subject-02', 'subject-03', 'reviewer-01', validRoot, 'approvalManifestPath']) {
    assert.equal(runtimeText.includes(forbidden), false, `runtime leaked approval evidence: ${forbidden}`);
  }
  assert.deepEqual(
    Object.keys(runtime).sort(),
    [
      'schemaVersion',
      'mapId',
      'source',
      'gateVersion',
      'topologyFingerprint',
      ...SEMANTIC_GROUPS.map(group => group.key),
    ].sort(),
  );

  const asymmetricRoot = path.join(temporaryRoot, 'asymmetric-candidate');
  const asymmetric = setupValidFixture(asymmetricRoot);
  const asymmetricCandidate = JSON.parse(
    fs.readFileSync(asymmetric.candidatePath, 'utf8').replace(/^\ufeff/, ''),
  );
  asymmetricCandidate.groups.midfaceReferenceRightIndices[0] = 127;
  writeJson(asymmetric.candidatePath, asymmetricCandidate);
  const asymmetricOutput = path.join(asymmetricRoot, 'runtime.json');
  const asymmetricResult = runCli([
    asymmetric.candidatePath,
    asymmetric.manifestPath,
    '--output',
    asymmetricOutput,
  ]);
  assert.equal(asymmetricResult.status, 1);
  assert.match(asymmetricResult.stderr, /midfaceReferenceRightIndices.*UV mirror pair 오른쪽 집합/);
  assert.equal(fs.existsSync(asymmetricOutput), false);

  const missingSymmetryRoot = path.join(temporaryRoot, 'missing-symmetry-summary');
  const missingSymmetry = setupValidFixture(missingSymmetryRoot);
  const missingSymmetrySummaryPath = path.join(
    missingSymmetryRoot,
    'validation',
    'subject-01.json',
  );
  const missingSymmetrySummary = JSON.parse(
    fs.readFileSync(missingSymmetrySummaryPath, 'utf8'),
  );
  delete missingSymmetrySummary.bilateralSymmetryValidation;
  writeJson(missingSymmetrySummaryPath, missingSymmetrySummary);
  const missingSymmetryResult = runCli([
    missingSymmetry.candidatePath,
    missingSymmetry.manifestPath,
    '--output',
    path.join(missingSymmetryRoot, 'runtime.json'),
  ]);
  assert.equal(missingSymmetryResult.status, 1);
  assert.match(missingSymmetryResult.stderr, /bilateralSymmetryValidation이 없습니다/);

  const mismatchedSymmetryRoot = path.join(temporaryRoot, 'mismatched-symmetry-summary');
  const mismatchedSymmetry = setupValidFixture(mismatchedSymmetryRoot);
  const mismatchedSymmetrySummaryPath = path.join(
    mismatchedSymmetryRoot,
    'validation',
    'subject-02.json',
  );
  const mismatchedSymmetrySummary = JSON.parse(
    fs.readFileSync(mismatchedSymmetrySummaryPath, 'utf8'),
  );
  mismatchedSymmetrySummary.bilateralSymmetryValidation.mirrorMapSha256 = 'd'.repeat(64);
  writeJson(mismatchedSymmetrySummaryPath, mismatchedSymmetrySummary);
  const mismatchedSymmetryResult = runCli([
    mismatchedSymmetry.candidatePath,
    mismatchedSymmetry.manifestPath,
    '--output',
    path.join(mismatchedSymmetryRoot, 'runtime.json'),
  ]);
  assert.equal(mismatchedSymmetryResult.status, 1);
  assert.match(mismatchedSymmetryResult.stderr, /UV mirror map SHA가 승인 후보와 다릅니다/);

  const tooFewRoot = path.join(temporaryRoot, 'too-few');
  const tooFew = setupValidFixture(tooFewRoot);
  const tooFewManifest = JSON.parse(fs.readFileSync(tooFew.manifestPath, 'utf8'));
  tooFewManifest.subjects.pop();
  writeJson(tooFew.manifestPath, tooFewManifest);
  const tooFewResult = runCli([
    tooFew.candidatePath,
    tooFew.manifestPath,
    '--output',
    path.join(tooFewRoot, 'runtime.json'),
  ]);
  assert.equal(tooFewResult.status, 1);
  assert.match(tooFewResult.stderr, /최소 3개 필요/);

  const duplicateSubjectRoot = path.join(temporaryRoot, 'duplicate-subject');
  const duplicateSubject = setupValidFixture(duplicateSubjectRoot);
  const duplicateSubjectManifest = JSON.parse(fs.readFileSync(duplicateSubject.manifestPath, 'utf8'));
  duplicateSubjectManifest.subjects[2].subjectId = 'subject-01';
  writeJson(duplicateSubject.manifestPath, duplicateSubjectManifest);
  const duplicateSubjectResult = runCli([
    duplicateSubject.candidatePath,
    duplicateSubject.manifestPath,
    '--output',
    path.join(duplicateSubjectRoot, 'runtime.json'),
  ]);
  assert.equal(duplicateSubjectResult.status, 1);
  assert.match(duplicateSubjectResult.stderr, /중복 subjectId/);

  const badSubjectRoot = path.join(temporaryRoot, 'bad-subject');
  const badSubject = setupValidFixture(badSubjectRoot);
  const badSubjectManifest = JSON.parse(fs.readFileSync(badSubject.manifestPath, 'utf8'));
  badSubjectManifest.subjects[0].subjectId = 'Alice';
  writeJson(badSubject.manifestPath, badSubjectManifest);
  const badSubjectResult = runCli([
    badSubject.candidatePath,
    badSubject.manifestPath,
    '--output',
    path.join(badSubjectRoot, 'runtime.json'),
  ]);
  assert.equal(badSubjectResult.status, 1);
  assert.match(badSubjectResult.stderr, /pseudonymous subjectId 형식/);

  const duplicateCaptureRoot = path.join(temporaryRoot, 'duplicate-capture');
  const duplicateCapture = setupValidFixture(duplicateCaptureRoot);
  const duplicateCaptureSummaryPath = path.join(duplicateCaptureRoot, 'validation', 'subject-02.json');
  const duplicateCaptureSummary = JSON.parse(fs.readFileSync(duplicateCaptureSummaryPath, 'utf8'));
  duplicateCaptureSummary.captures[0].capturePairId = 's1-neutral';
  writeJson(duplicateCaptureSummaryPath, duplicateCaptureSummary);
  const duplicateCaptureResult = runCli([
    duplicateCapture.candidatePath,
    duplicateCapture.manifestPath,
    '--output',
    path.join(duplicateCaptureRoot, 'runtime.json'),
  ]);
  assert.equal(duplicateCaptureResult.status, 1);
  assert.match(duplicateCaptureResult.stderr, /서로 다른 subject에 중복 capturePairId/);

  const missingShotRoot = path.join(temporaryRoot, 'missing-shot');
  const missingShot = setupValidFixture(missingShotRoot);
  const missingShotSummaryPath = path.join(missingShotRoot, 'validation', 'subject-03.json');
  const missingShotSummary = JSON.parse(fs.readFileSync(missingShotSummaryPath, 'utf8'));
  missingShotSummary.captureShotKinds[2] = 'yawLeft';
  missingShotSummary.captures[2].captureShotKind = 'yawLeft';
  writeJson(missingShotSummaryPath, missingShotSummary);
  const missingShotResult = runCli([
    missingShot.candidatePath,
    missingShot.manifestPath,
    '--output',
    path.join(missingShotRoot, 'runtime.json'),
  ]);
  assert.equal(missingShotResult.status, 1);
  assert.match(missingShotResult.stderr, /중복 shotKind|정확히 일치/);

  const unsafeCaptureRoot = path.join(temporaryRoot, 'unsafe-capture');
  const unsafeCapture = setupValidFixture(unsafeCaptureRoot);
  const unsafeSummaryPath = path.join(unsafeCaptureRoot, 'validation', 'subject-01.json');
  const unsafeSummary = JSON.parse(fs.readFileSync(unsafeSummaryPath, 'utf8'));
  unsafeSummary.captures[1].fullMeshInFrame = false;
  writeJson(unsafeSummaryPath, unsafeSummary);
  const unsafeCaptureResult = runCli([
    unsafeCapture.candidatePath,
    unsafeCapture.manifestPath,
    '--output',
    path.join(unsafeCaptureRoot, 'runtime.json'),
  ]);
  assert.equal(unsafeCaptureResult.status, 1);
  assert.match(unsafeCaptureResult.stderr, /fullMeshInFrame이 true가 아닙니다/);

  const topologyFlagRoot = path.join(temporaryRoot, 'topology-flag');
  const topologyFlag = setupValidFixture(topologyFlagRoot);
  const topologyFlagSummaryPath = path.join(topologyFlagRoot, 'validation', 'subject-01.json');
  const topologyFlagSummary = JSON.parse(fs.readFileSync(topologyFlagSummaryPath, 'utf8'));
  topologyFlagSummary.captures[2].topologyMatch = false;
  writeJson(topologyFlagSummaryPath, topologyFlagSummary);
  const topologyFlagResult = runCli([
    topologyFlag.candidatePath,
    topologyFlag.manifestPath,
    '--output',
    path.join(topologyFlagRoot, 'runtime.json'),
  ]);
  assert.equal(topologyFlagResult.status, 1);
  assert.match(topologyFlagResult.stderr, /topologyMatch가 true가 아닙니다/);

  const mismatchRoot = path.join(temporaryRoot, 'mismatch');
  const mismatch = setupValidFixture(mismatchRoot);
  const mismatchSummaryPath = path.join(mismatchRoot, 'validation', 'subject-02.json');
  const mismatchSummary = JSON.parse(fs.readFileSync(mismatchSummaryPath, 'utf8'));
  mismatchSummary.topologyFingerprint = topologyFixture({indicesHash: 'd'.repeat(64)});
  writeJson(mismatchSummaryPath, mismatchSummary);
  const mismatchResult = runCli([
    mismatch.candidatePath,
    mismatch.manifestPath,
    '--output',
    path.join(mismatchRoot, 'runtime.json'),
  ]);
  assert.equal(mismatchResult.status, 1);
  assert.match(mismatchResult.stderr, /topology fingerprint가 후보와 다릅니다: indicesHash, fingerprint/);

  const candidateMismatchRoot = path.join(temporaryRoot, 'candidate-mismatch');
  const candidateMismatch = setupValidFixture(candidateMismatchRoot);
  const candidateMismatchSummaryPath = path.join(candidateMismatchRoot, 'validation', 'subject-03.json');
  const candidateMismatchSummary = JSON.parse(fs.readFileSync(candidateMismatchSummaryPath, 'utf8'));
  candidateMismatchSummary.candidate.candidateId = 'different-candidate-v1';
  writeJson(candidateMismatchSummaryPath, candidateMismatchSummary);
  const candidateMismatchResult = runCli([
    candidateMismatch.candidatePath,
    candidateMismatch.manifestPath,
    '--output',
    path.join(candidateMismatchRoot, 'runtime.json'),
  ]);
  assert.equal(candidateMismatchResult.status, 1);
  assert.match(candidateMismatchResult.stderr, /candidateId가 승인 후보와 다릅니다/);

  const semanticHashRoot = path.join(temporaryRoot, 'semantic-hash-mismatch');
  const semanticHash = setupValidFixture(semanticHashRoot);
  const changedCandidate = JSON.parse(fs.readFileSync(semanticHash.candidatePath, 'utf8').replace(/^\ufeff/, ''));
  changedCandidate.groups.noseTipIndices = [10, 11, 12];
  writeJson(semanticHash.candidatePath, changedCandidate);
  const semanticHashResult = runCli([
    semanticHash.candidatePath,
    semanticHash.manifestPath,
    '--output',
    path.join(semanticHashRoot, 'runtime.json'),
  ]);
  assert.equal(semanticHashResult.status, 1);
  assert.match(semanticHashResult.stderr, /candidate semantic content hash가 승인 후보와 다릅니다/);

  const artifactHashRoot = path.join(temporaryRoot, 'artifact-hash-mismatch');
  const artifactHash = setupValidFixture(artifactHashRoot);
  fs.appendFileSync(path.join(artifactHashRoot, 'validation', 's2-yawLeft.svg'), '<!-- tampered -->\n');
  const artifactHashResult = runCli([
    artifactHash.candidatePath,
    artifactHash.manifestPath,
    '--output',
    path.join(artifactHashRoot, 'runtime.json'),
  ]);
  assert.equal(artifactHashResult.status, 1);
  assert.match(artifactHashResult.stderr, /overlay 파일 hash가 validation summary와 다릅니다/);

  const matrixHashRoot = path.join(temporaryRoot, 'matrix-hash-mismatch');
  const matrixHash = setupValidFixture(matrixHashRoot);
  fs.appendFileSync(path.join(matrixHashRoot, 'validation', 's3-matrix.html'), '<!-- tampered -->\n');
  const matrixHashResult = runCli([
    matrixHash.candidatePath,
    matrixHash.manifestPath,
    '--output',
    path.join(matrixHashRoot, 'runtime.json'),
  ]);
  assert.equal(matrixHashResult.status, 1);
  assert.match(matrixHashResult.stderr, /reviewMatrix 파일 hash가 validation summary와 다릅니다/);

  const distinctRoot = path.join(temporaryRoot, 'distinct-not-confirmed');
  const distinct = setupValidFixture(distinctRoot);
  const distinctManifest = JSON.parse(fs.readFileSync(distinct.manifestPath, 'utf8'));
  distinctManifest.distinctPeopleConfirmed = false;
  writeJson(distinct.manifestPath, distinctManifest);
  const distinctResult = runCli([
    distinct.candidatePath,
    distinct.manifestPath,
    '--output',
    path.join(distinctRoot, 'runtime.json'),
  ]);
  assert.equal(distinctResult.status, 1);
  assert.match(distinctResult.stderr, /distinctPeopleConfirmed가 true/);

  const sharedSetRoot = path.join(temporaryRoot, 'shared-set');
  const sharedSet = setupValidFixture(sharedSetRoot);
  const sharedSetSummaryPath = path.join(sharedSetRoot, 'validation', 'subject-02.json');
  const sharedSetSummary = JSON.parse(fs.readFileSync(sharedSetSummaryPath, 'utf8'));
  sharedSetSummary.captures.forEach(capture => {
    capture.captureSetId = 's1-set';
  });
  sharedSetSummary.captureSetIds = ['s1-set'];
  writeJson(sharedSetSummaryPath, sharedSetSummary);
  const sharedSetResult = runCli([
    sharedSet.candidatePath,
    sharedSet.manifestPath,
    '--output',
    path.join(sharedSetRoot, 'runtime.json'),
  ]);
  assert.equal(sharedSetResult.status, 1);
  assert.match(sharedSetResult.stderr, /서로 다른 subject가 같은 captureSetId를 공유/);

  const legacyRoot = path.join(temporaryRoot, 'legacy-multiple-sets');
  const legacy = setupValidFixture(legacyRoot);
  const legacySummaryPath = path.join(legacyRoot, 'validation', 'subject-01.json');
  const legacySummary = JSON.parse(fs.readFileSync(legacySummaryPath, 'utf8'));
  legacySummary.captures.forEach((capture, index) => {
    capture.captureSetId = `legacy-subject-01-set-${index + 1}`;
  });
  legacySummary.captureSetIds = legacySummary.captures.map(capture => capture.captureSetId);
  legacySummary.sameCaptureSet = false;
  writeJson(legacySummaryPath, legacySummary);
  const legacyRejected = runCli([
    legacy.candidatePath,
    legacy.manifestPath,
    '--output',
    path.join(legacyRoot, 'runtime-rejected.json'),
  ]);
  assert.equal(legacyRejected.status, 1);
  assert.match(legacyRejected.stderr, /samePersonConfirmed=true가 필요/);

  const legacyManifest = JSON.parse(fs.readFileSync(legacy.manifestPath, 'utf8'));
  legacyManifest.subjects[0].samePersonConfirmed = true;
  writeJson(legacy.manifestPath, legacyManifest);
  const legacyApproved = runCli([
    legacy.candidatePath,
    legacy.manifestPath,
    '--output',
    path.join(legacyRoot, 'runtime-approved.json'),
    '--receipt',
    path.join(legacyRoot, 'runtime-approved.receipt.json'),
  ]);
  assert.equal(legacyApproved.status, 0, legacyApproved.stderr);

  const invalidCompositeRoot = path.join(temporaryRoot, 'invalid-composite');
  const invalidComposite = setupValidFixture(invalidCompositeRoot);
  const invalidCompositeCandidate = JSON.parse(fs.readFileSync(invalidComposite.candidatePath, 'utf8').replace(/^\ufeff/, ''));
  invalidCompositeCandidate.topologyFingerprint.fingerprint = 'c'.repeat(64);
  writeJson(invalidComposite.candidatePath, invalidCompositeCandidate);
  const invalidCompositeResult = runCli([
    invalidComposite.candidatePath,
    invalidComposite.manifestPath,
    '--output',
    path.join(invalidCompositeRoot, 'runtime.json'),
  ]);
  assert.equal(invalidCompositeResult.status, 1);
  assert.match(invalidCompositeResult.stderr, /Unity composite 계약과 일치하지 않습니다/);

  const approvalRoot = path.join(temporaryRoot, 'not-approved');
  const notApproved = setupValidFixture(approvalRoot);
  const notApprovedManifest = clone(JSON.parse(fs.readFileSync(notApproved.manifestPath, 'utf8')));
  notApprovedManifest.approved = false;
  writeJson(notApproved.manifestPath, notApprovedManifest);
  const notApprovedResult = runCli([
    notApproved.candidatePath,
    notApproved.manifestPath,
    '--output',
    path.join(approvalRoot, 'runtime.json'),
  ]);
  assert.equal(notApprovedResult.status, 1);
  assert.match(notApprovedResult.stderr, /approved가 true/);
} finally {
  if (process.env.KEEP_FACE3D_APPROVAL_FIXTURE === '1') {
    console.log(`Face3D approval fixture: ${temporaryRoot}`);
  } else {
    fs.rmSync(temporaryRoot, {force: true, recursive: true});
  }
}

console.log('Face3D semantic approval gate tests passed.');
