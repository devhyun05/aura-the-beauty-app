#!/usr/bin/env node

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {VALIDATION_SCHEMA_VERSION} from './build-semantic-validation.mjs';
import {THREE_SUBJECT_REVIEW_SCHEMA_VERSION} from './build-three-subject-review-board.mjs';

const scriptPath = fileURLToPath(new URL('./build-three-subject-review-board.mjs', import.meta.url));
const semanticContentSha256 = 'c'.repeat(64);
const indicesHash = 'a'.repeat(64);
const uvHash = 'b'.repeat(64);
const shotKinds = ['neutral', 'yawLeft', 'yawRight'];
const bilateralSymmetryValidation = Object.freeze({
  status: 'passed',
  policyVersion: 'uv-reflection-mutual-nearest-paired-connected-v2',
  policySha256: 'd'.repeat(64),
  mirrorMapSha256: 'e'.repeat(64),
  selectedMirrorPairCount: 30,
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function topology(overrides = {}) {
  const value = {
    algorithm: 'sha256-le-v1',
    vertexCount: 1220,
    indexCount: 6912,
    uvCount: 1220,
    indicesHash,
    uvHash,
    ...overrides,
  };
  value.fingerprint = overrides.fingerprint ?? sha256([
    value.algorithm,
    'arkit_face_mesh',
    String(value.vertexCount),
    String(value.indexCount),
    String(value.uvCount),
    value.indicesHash,
    value.uvHash,
  ].join('|'));
  return value;
}

function createValidationFixture(root, subjectNumber, overrides = {}) {
  const directory = path.join(root, `validation-${subjectNumber}`);
  fs.mkdirSync(directory, {recursive: true});
  const captures = shotKinds.map((shotKind, shotIndex) => {
    const overlayFile = `semantic_validation_0${shotIndex + 1}_${shotKind}.svg`;
    const overlaySource = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><image href="data:image/png;base64,AA=="/><path d="M0,0L10,10Z"/><text class="group-label">${subjectNumber}-${shotKind}</text></svg>\n`;
    fs.writeFileSync(path.join(directory, overlayFile), overlaySource, 'utf8');
    return {
      capturePairId: `pair-subject-${subjectNumber}-${shotKind}`,
      captureSetId: `set-subject-${subjectNumber}`,
      captureShotKind: shotKind,
      overlayFile,
      overlaySha256: sha256(overlaySource),
      frameHeight: 80,
      frameWidth: 100,
      fullMeshInFrame: true,
      outOfFrameVertexCount: 0,
      topologyMatch: true,
    };
  });
  const matrixFile = 'semantic_validation_matrix.html';
  const matrixSource = `<!doctype html><title>subject-${subjectNumber} validation</title>\n`;
  fs.writeFileSync(path.join(directory, matrixFile), matrixSource, 'utf8');

  const summary = {
    schemaVersion: VALIDATION_SCHEMA_VERSION,
    generatedAtUtc: '2026-07-12T00:00:00.000Z',
    result: 'inputs_valid_human_overlay_review_required',
    candidate: {
      candidateId: 'synthetic-bilateral-candidate',
      candidatePath: '/private/not-exported/candidate.json',
      reviewStatus: 'candidate_only_not_runtime_approved',
      schemaVersion: 'aura.face3d-semantic-candidate.v1',
      semanticContentSha256,
      ...(overrides.candidate ?? {}),
    },
    bilateralSymmetryValidation: {
      ...bilateralSymmetryValidation,
      ...(overrides.bilateralSymmetryValidation ?? {}),
    },
    topologyFingerprint: topology(overrides.topology),
    captureCount: 3,
    captureShotKinds: [...shotKinds],
    captures,
    captureSetIds: [`set-subject-${subjectNumber}`],
    sameCaptureSet: true,
    runtimeMapGenerated: false,
    warnings: ['human review required'],
    reviewMatrix: {
      file: matrixFile,
      sha256: sha256(matrixSource),
    },
    ...(overrides.summary ?? {}),
  };
  const summaryPath = path.join(directory, 'semantic_validation_summary.json');
  writeJson(summaryPath, summary);
  return {captures, directory, summary, summaryPath};
}

function cliArguments(fixtures, outputDirectory, labels = ['subject-01', 'subject-02', 'subject-03']) {
  return fixtures.flatMap((fixture, index) => [
    '--subject',
    labels[index],
    fixture.summaryPath,
  ]).concat(['--output', outputDirectory]);
}

function runCli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {encoding: 'utf8'});
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-face3d-three-subject-board-'));
try {
  const fixtures = [1, 2, 3].map(subjectNumber =>
    createValidationFixture(temporaryRoot, subjectNumber));
  const outputDirectory = path.join(temporaryRoot, 'review-board-output');
  const success = runCli(cliArguments(fixtures, outputDirectory));
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /세 사람 검수 보드 생성 완료/);
  assert.match(success.stdout, /validation HTML 3개 \+ overlay SVG 9개 일치/);
  assert.match(success.stderr, /해부학적 정합은 사람이 직접 승인해야 합니다/);
  assert.match(success.stderr, /런타임 시맨틱 맵을 생성하거나 승인하지 않습니다/);

  const htmlPath = path.join(outputDirectory, 'three_subject_review_board.html');
  const summaryPath = path.join(outputDirectory, 'three_subject_review_summary.json');
  assert.equal(fs.existsSync(htmlPath), true);
  assert.equal(fs.existsSync(summaryPath), true);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'ARKitFaceSemanticMapV1.json')), false);

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.equal((html.match(/src="data:image\/svg\+xml;base64,/g) ?? []).length, 9);
  assert.equal(
    (html.match(/<img class="review-overlay"[^>]+data-embedded-svg="true"/g) ?? []).length,
    9,
  );
  assert.match(html, /subject-01/);
  assert.match(html, /subject-02/);
  assert.match(html, /subject-03/);
  assert.match(html, /id="mesh-toggle"/);
  assert.match(html, /id="label-toggle"/);
  assert.match(html, /<link rel="icon" href="data:,"\/>/);
  assert.match(html, /show-group-labels/);
  assert.match(html, /review-board-mesh/);
  assert.match(html, /사람 승인 필요 · 런타임 맵 아님/);
  assert.match(html, /uv-reflection-mutual-nearest-paired-connected-v2/);
  assert.doesNotMatch(html, /G1 v4/);
  assert.doesNotMatch(html, /src="(?:\.\/|\.\.\/|\/)/);
  assert.doesNotMatch(html, /candidatePath/);
  assert.doesNotMatch(html, /validation-[123]/);

  const reviewSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(reviewSummary.schemaVersion, THREE_SUBJECT_REVIEW_SCHEMA_VERSION);
  assert.equal(reviewSummary.result, 'artifacts_verified_human_approval_required');
  assert.equal(reviewSummary.reviewStatus, 'human_approval_required_not_runtime_approved');
  assert.equal(reviewSummary.subjectCount, 3);
  assert.equal(reviewSummary.humanApprovalRequired, true);
  assert.equal(reviewSummary.runtimeMapGenerated, false);
  assert.equal(reviewSummary.bilateralSymmetryValidation.status, 'passed');
  assert.equal(reviewSummary.bilateralSymmetryValidation.selectedMirrorPairCount, 30);
  assert.deepEqual(reviewSummary.requiredShotKinds, shotKinds);
  assert.deepEqual(
    reviewSummary.subjects.map(subject => subject.subjectLabel),
    ['subject-01', 'subject-02', 'subject-03'],
  );
  assert.equal(reviewSummary.artifactVerification.validationSummaryCount, 3);
  assert.equal(reviewSummary.artifactVerification.reviewMatrixCount, 3);
  assert.equal(reviewSummary.artifactVerification.overlaySvgCount, 9);
  assert.equal(reviewSummary.artifactVerification.allReferencedArtifactSha256Verified, true);
  assert.equal(reviewSummary.reviewBoard.embeddedSvgCount, 9);
  assert.equal(reviewSummary.reviewBoard.standalone, true);
  assert.equal(reviewSummary.reviewBoard.sha256, sha256(html));
  assert.equal(
    reviewSummary.subjects.every(subject =>
      subject.reviewMatrix.artifactSha256Verified
      && subject.captures.length === 3
      && subject.captures.every(capture =>
        capture.artifactSha256Verified && capture.embeddedAsBase64)),
    true,
  );
  assert.equal(
    reviewSummary.subjects.every(subject => !('summaryPath' in subject)),
    true,
  );

  const mismatchedCandidateFixture = createValidationFixture(temporaryRoot, 4, {
    candidate: {candidateId: 'different-candidate'},
  });
  const mismatchedCandidate = runCli(cliArguments(
    [fixtures[0], fixtures[1], mismatchedCandidateFixture],
    path.join(temporaryRoot, 'mismatched-candidate-output'),
  ));
  assert.equal(mismatchedCandidate.status, 1);
  assert.match(mismatchedCandidate.stderr, /candidateId가 subject-01과 다릅니다/);

  const mismatchedSemanticFixture = createValidationFixture(temporaryRoot, 5, {
    candidate: {semanticContentSha256: 'd'.repeat(64)},
  });
  const mismatchedSemantic = runCli(cliArguments(
    [fixtures[0], fixtures[1], mismatchedSemanticFixture],
    path.join(temporaryRoot, 'mismatched-semantic-output'),
  ));
  assert.equal(mismatchedSemantic.status, 1);
  assert.match(mismatchedSemantic.stderr, /semanticContentSha256가 subject-01과 다릅니다/);

  const mismatchedTopologyFixture = createValidationFixture(temporaryRoot, 6, {
    topology: {indicesHash: 'e'.repeat(64)},
  });
  const mismatchedTopology = runCli(cliArguments(
    [fixtures[0], fixtures[1], mismatchedTopologyFixture],
    path.join(temporaryRoot, 'mismatched-topology-output'),
  ));
  assert.equal(mismatchedTopology.status, 1);
  assert.match(mismatchedTopology.stderr, /topology fingerprint가 subject-01과 다릅니다/);

  const mismatchedSymmetryFixture = createValidationFixture(temporaryRoot, 13, {
    bilateralSymmetryValidation: {mirrorMapSha256: 'f'.repeat(64)},
  });
  const mismatchedSymmetry = runCli(cliArguments(
    [fixtures[0], fixtures[1], mismatchedSymmetryFixture],
    path.join(temporaryRoot, 'mismatched-symmetry-output'),
  ));
  assert.equal(mismatchedSymmetry.status, 1);
  assert.match(mismatchedSymmetry.stderr, /bilateral symmetry policy\/hash가 subject-01과 다릅니다/);

  const missingSymmetryFixture = createValidationFixture(temporaryRoot, 14);
  delete missingSymmetryFixture.summary.bilateralSymmetryValidation;
  writeJson(missingSymmetryFixture.summaryPath, missingSymmetryFixture.summary);
  const missingSymmetry = runCli(cliArguments(
    [fixtures[0], fixtures[1], missingSymmetryFixture],
    path.join(temporaryRoot, 'missing-symmetry-output'),
  ));
  assert.equal(missingSymmetry.status, 1);
  assert.match(missingSymmetry.stderr, /bilateralSymmetryValidation이 없습니다/);

  const duplicateShotFixture = createValidationFixture(temporaryRoot, 7);
  duplicateShotFixture.summary.captures[2].captureShotKind = 'yawLeft';
  writeJson(duplicateShotFixture.summaryPath, duplicateShotFixture.summary);
  const duplicateShot = runCli(cliArguments(
    [fixtures[0], fixtures[1], duplicateShotFixture],
    path.join(temporaryRoot, 'duplicate-shot-output'),
  ));
  assert.equal(duplicateShot.status, 1);
  assert.match(duplicateShot.stderr, /yawLeft 촬영이 중복됐습니다/);

  const wrongCountFixture = createValidationFixture(temporaryRoot, 8);
  wrongCountFixture.summary.captureCount = 2;
  writeJson(wrongCountFixture.summaryPath, wrongCountFixture.summary);
  const wrongCount = runCli(cliArguments(
    [fixtures[0], fixtures[1], wrongCountFixture],
    path.join(temporaryRoot, 'wrong-count-output'),
  ));
  assert.equal(wrongCount.status, 1);
  assert.match(wrongCount.stderr, /captureCount는 정확히 3이어야 합니다/);

  const tamperedOverlayFixture = createValidationFixture(temporaryRoot, 9);
  fs.appendFileSync(
    path.join(tamperedOverlayFixture.directory, tamperedOverlayFixture.captures[0].overlayFile),
    '<!-- tampered -->',
    'utf8',
  );
  const tamperedOverlay = runCli(cliArguments(
    [fixtures[0], fixtures[1], tamperedOverlayFixture],
    path.join(temporaryRoot, 'tampered-overlay-output'),
  ));
  assert.equal(tamperedOverlay.status, 1);
  assert.match(tamperedOverlay.stderr, /neutral overlay SHA-256이 summary와 다릅니다/);

  const tamperedMatrixFixture = createValidationFixture(temporaryRoot, 10);
  fs.appendFileSync(
    path.join(tamperedMatrixFixture.directory, 'semantic_validation_matrix.html'),
    '<!-- tampered -->',
    'utf8',
  );
  const tamperedMatrix = runCli(cliArguments(
    [fixtures[0], fixtures[1], tamperedMatrixFixture],
    path.join(temporaryRoot, 'tampered-matrix-output'),
  ));
  assert.equal(tamperedMatrix.status, 1);
  assert.match(tamperedMatrix.stderr, /reviewMatrix SHA-256이 summary와 다릅니다/);

  const externalSvgFixture = createValidationFixture(temporaryRoot, 12);
  const externalSvgPath = path.join(
    externalSvgFixture.directory,
    externalSvgFixture.captures[0].overlayFile,
  );
  const externalSvgSource = '<svg xmlns="http://www.w3.org/2000/svg"><image href="frame.png"/></svg>\n';
  fs.writeFileSync(externalSvgPath, externalSvgSource, 'utf8');
  externalSvgFixture.summary.captures[0].overlaySha256 = sha256(externalSvgSource);
  writeJson(externalSvgFixture.summaryPath, externalSvgFixture.summary);
  const externalSvg = runCli(cliArguments(
    [fixtures[0], fixtures[1], externalSvgFixture],
    path.join(temporaryRoot, 'external-svg-output'),
  ));
  assert.equal(externalSvg.status, 1);
  assert.match(externalSvg.stderr, /내장된 프레임 이미지가 없습니다|standalone이 아닙니다/);

  const pathTraversalFixture = createValidationFixture(temporaryRoot, 11);
  pathTraversalFixture.summary.captures[0].overlayFile = '../outside.svg';
  writeJson(pathTraversalFixture.summaryPath, pathTraversalFixture.summary);
  const pathTraversal = runCli(cliArguments(
    [fixtures[0], fixtures[1], pathTraversalFixture],
    path.join(temporaryRoot, 'path-traversal-output'),
  ));
  assert.equal(pathTraversal.status, 1);
  assert.match(pathTraversal.stderr, /validation 폴더 밖을 가리킵니다/);

  const nonPseudonymous = runCli(cliArguments(
    fixtures,
    path.join(temporaryRoot, 'non-pseudonymous-output'),
    ['subject-01', 'subject-02', '홍길동'],
  ));
  assert.equal(nonPseudonymous.status, 1);
  assert.match(nonPseudonymous.stderr, /익명 코드여야 합니다/);

  const duplicateSummary = runCli(cliArguments(
    [fixtures[0], fixtures[1], fixtures[1]],
    path.join(temporaryRoot, 'duplicate-summary-output'),
  ));
  assert.equal(duplicateSummary.status, 1);
  assert.match(duplicateSummary.stderr, /같은 validation summary를 여러 사람으로 중복 사용할 수 없습니다/);

  const runtimeOutputDirectory = path.join(temporaryRoot, 'runtime-output');
  fs.mkdirSync(runtimeOutputDirectory, {recursive: true});
  fs.writeFileSync(
    path.join(runtimeOutputDirectory, 'ARKitFaceSemanticMapV1.json'),
    '{}\n',
    'utf8',
  );
  const runtimeOutput = runCli(cliArguments(fixtures, runtimeOutputDirectory));
  assert.equal(runtimeOutput.status, 1);
  assert.match(runtimeOutput.stderr, /런타임 맵이 이미 있어 검수 전용 상태를 보증할 수 없습니다/);
} finally {
  if (process.env.KEEP_FACE3D_REVIEW_BOARD_FIXTURE === '1') {
    console.log(`Face3D three-subject review fixture: ${temporaryRoot}`);
  } else {
    fs.rmSync(temporaryRoot, {force: true, recursive: true});
  }
}

console.log('Face3D three-subject review board tests passed.');
