import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  COVERAGE_VERDICTS,
  TIER2_AUTHORING_SCHEMA_VERSION,
  buildAuthoringPayload,
  buildMeshAdjacency,
  buildUvMirrorMap,
  connectedComponents,
  createFaceCoordinateFrame,
  emptyTier2Groups,
  extractTier2Groups,
  graphBoundaryIndices,
  selectScoreWinner,
  toFaceCoordinates,
  validateTier2Patch,
} from './tier2-seed-review-core.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REVIEWER_SCRIPT = path.join(REPO_ROOT, 'scripts/face3d/build-tier2-seed-review.mjs');
const CAPTURE_DIR = path.join(
  REPO_ROOT,
  'artifacts/face3d/device-captures/pair_face3d_semantic_1783799136465',
);
const LIVE_MAP_PATH = path.join(
  REPO_ROOT,
  'apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json',
);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function issueCodes(result) {
  return result.errors.map(({code}) => code);
}

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

function makeClique(adjacency, indices) {
  for (const left of indices) {
    for (const right of indices) {
      if (left !== right) adjacency[left].add(right);
    }
  }
}

function cloneGroups(groups) {
  return Object.fromEntries(
    Object.entries(groups).map(([key, indices]) => [key, [...indices]]),
  );
}

function makeValidationFixture() {
  const groups = {
    nasionIndices: [0],
    noseBridgeMidlineIndices: [3, 4, 5, 6],
    alarLeftIndices: [7, 8, 9, 10, 11],
    alarRightIndices: [12, 13, 14, 15, 16],
    malarApexLeftIndices: [17, 18, 19, 20, 21],
    malarApexRightIndices: [22, 23, 24, 25, 26],
  };
  const localVertices = Array.from({length: 27}, (_, index) => [0, index / 100, 0]);
  for (let offset = 0; offset < 5; offset += 1) {
    localVertices[7 + offset] = [-0.2 - offset * 0.1, 0, 0.1];
    localVertices[12 + offset] = [0.2 + offset * 0.1, 0, 0.1];
    localVertices[17 + offset] = [-0.2 - offset * 0.1, 0.2, 0.1 + offset * 0.1];
    localVertices[22 + offset] = [0.2 + offset * 0.1, 0.2, 0.1 + offset * 0.1];
  }

  const meshAdjacency = Array.from({length: localVertices.length}, () => new Set());
  for (const indices of Object.values(groups)) makeClique(meshAdjacency, indices);

  const mirrorIndices = Array.from({length: localVertices.length}, (_, index) => index);
  for (const [leftStart, rightStart] of [[7, 12], [17, 22]]) {
    for (let offset = 0; offset < 5; offset += 1) {
      mirrorIndices[leftStart + offset] = rightStart + offset;
      mirrorIndices[rightStart + offset] = leftStart + offset;
    }
  }

  return {
    annotations: Object.fromEntries(Object.entries(groups).map(([key, indices]) => [key, {
      allowedRegionIndices: [...indices],
      coverageNote: '합성 fixture에서 해부 영역을 덮음',
      coverageVerdict: 'pass',
      disposition: 'candidate_review',
      fixedPatchIndices: [...indices],
      targetIndex: indices[0],
    }])),
    candidateTopologyFingerprint: 'fixture-fingerprint',
    captureTopologyFingerprint: 'fixture-fingerprint',
    g1Indices: [],
    groups,
    localVertices,
    meshAdjacency,
    mirrorPolicy: {
      frame: {
        anterior: [0, 0, 1],
        faceScale: 1,
        lateral: [1, 0, 0],
        origin: [0, 0, 0],
        up: [0, 1, 0],
      },
      mirrorIndices,
      residuals: Array(localVertices.length).fill(0),
    },
  };
}

test('mesh adjacency, components, and graph boundary use triangle connectivity', () => {
  const adjacency = buildMeshAdjacency(4, [0, 1, 2, 1, 2, 3]);
  assert.deepEqual([...adjacency[1]].sort((a, b) => a - b), [0, 2, 3]);
  assert.deepEqual(connectedComponents([0, 3], adjacency), [[0], [3]]);
  assert.deepEqual(graphBoundaryIndices([0, 1, 2], adjacency), [1, 2]);
  assert.throws(() => buildMeshAdjacency(3, [0, 1, 3]), /범위를 벗어났습니다/);
});

test('UV mirror map is deterministic and mutual on a symmetric fixture', () => {
  const result = buildUvMirrorMap([[0.1, 0.2], [0.9, 0.2], [0.5, 0.8]]);
  assert.deepEqual(result.mirrorIndices, [1, 0, 2]);
  assert.equal(result.mutualCount, 3);
  assert.ok(result.residuals.every(value => value < 1e-15));
});

test('face-local frame remains map-right positive; mirrored authoring maps anatomical Left negative', () => {
  const vertices = [[-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const liveMap = {
    midfaceReferenceLeftIndices: [0],
    midfaceReferenceRightIndices: [1],
    midfaceReferenceUpperIndices: [2],
    noseTipIndices: [3],
  };
  const frame = createFaceCoordinateFrame(vertices, liveMap);
  assert.deepEqual(toFaceCoordinates([0.5, 0, 0], frame), [0.25, 0, 0]);
  assert.ok(toFaceCoordinates([0, 0, 1], frame)[2] > 0);
});

test('score winner uses global maximum and lowest-index epsilon tie break', () => {
  const scores = new Map([[9, 0.5], [3, 0.5000005], [7, 0.1]]);
  const winner = selectScoreWinner([9, 3, 7], index => scores.get(index));
  assert.equal(winner.maximum, 0.5000005);
  assert.deepEqual(winner.tiedIndices, [3, 9]);
  assert.equal(winner.index, 3);
});

test('legacy selected/suggestions and v1 groups payloads remain importable', () => {
  assert.deepEqual(extractTier2Groups({selected: {nasionIndices: [2, 1, 0]}}).nasionIndices, [2, 1, 0]);
  assert.deepEqual(extractTier2Groups({suggestions: {alarLeftIndices: [7]}}).alarLeftIndices, [7]);
  assert.deepEqual(extractTier2Groups({groups: {alarRightIndices: [12]}}).alarRightIndices, [12]);
  assert.throws(() => extractTier2Groups({groups: {nasionIndices: 'bad'}}), /배열이어야/);
});

test('complete connected symmetric fixture passes every structural gate', () => {
  const result = validateTier2Patch(makeValidationFixture());
  assert.equal(result.result, 'pass');
  assert.equal(result.status, 'candidate_structural_pass');
  assert.equal(result.completionStatus, 'candidate_structural_pass');
  assert.deepEqual(result.errors, []);
  assert.equal(result.bilateral.alar.exact, true);
  assert.equal(result.bilateral.malar.exact, true);
  assert.equal(result.groupDiagnostics.alarLeftIndices.winnerIndex, 11);
  assert.equal(result.groupDiagnostics.malarApexRightIndices.winnerIndex, 26);
});

test('unsupported/null retains ROI/target evidence but requires empty fixed patch, fail coverage, and reason', () => {
  const fixture = makeValidationFixture();
  fixture.groups = emptyTier2Groups();
  const evidenceByGroup = {
    nasionIndices: [0, 1, 2],
    noseBridgeMidlineIndices: [3, 4, 5, 6],
    alarLeftIndices: [7, 8, 9, 10, 11],
    alarRightIndices: [12, 13, 14, 15, 16],
    malarApexLeftIndices: [17, 18, 19, 20, 21],
    malarApexRightIndices: [22, 23, 24, 25, 26],
  };
  fixture.annotations = Object.fromEntries(Object.entries(evidenceByGroup).map(([key, evidence]) => [key, {
    allowedRegionIndices: evidence,
    coverageNote: '고정 topology patch로 안전하게 덮을 수 없음',
    coverageVerdict: 'fail',
    disposition: 'unsupported_null',
    fixedPatchIndices: [],
    targetIndex: evidence[0],
    unsupportedReason: '두 reviewer가 해부 영역을 합의하지 못함',
  }]));
  const unsupportedResult = validateTier2Patch(fixture);
  assert.equal(unsupportedResult.result, 'pass');
  assert.equal(unsupportedResult.status, 'complete_with_unsupported');
  assert.equal(unsupportedResult.completionStatus, 'complete_with_unsupported');

  fixture.annotations.nasionIndices.unsupportedReason = '';
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('unsupported_reason_missing'));

  fixture.annotations.nasionIndices.unsupportedReason = '합의 실패';
  fixture.annotations.nasionIndices.coverageNote = '';
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('coverage_note_missing'));
  fixture.annotations.nasionIndices.coverageNote = '고정 patch gross miss';
  fixture.annotations.nasionIndices.coverageVerdict = 'pending';
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('unsupported_coverage_not_fail'));
  fixture.annotations.nasionIndices.coverageVerdict = 'fail';
  fixture.annotations.alarLeftIndices.fixedPatchIndices = [7, 8, 9, 10, 11];
  fixture.groups.alarLeftIndices = [7, 8, 9, 10, 11];
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('unsupported_group_has_indices'));
});

test('annotation fixed patch must exactly match the authoritative groups array', () => {
  const fixture = makeValidationFixture();
  fixture.annotations.nasionIndices.fixedPatchIndices = [0, 1];
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('fixed_patch_annotation_mismatch'));

  delete fixture.annotations.nasionIndices.fixedPatchIndices;
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('fixed_patch_annotation_missing'));

  fixture.annotations.nasionIndices.fixedPatchIndices = [0, 1, 1];
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('fixed_patch_annotation_duplicate_indices'));
});

test('annotation contract keeps target in ROI and fixed patch as an ROI subset without requiring target in patch', () => {
  const fixture = makeValidationFixture();
  fixture.annotations.nasionIndices = {
    ...fixture.annotations.nasionIndices,
    allowedRegionIndices: [0, 1, 2, 3],
    targetIndex: 3,
  };
  const valid = validateTier2Patch(fixture);
  assert.equal(valid.result, 'pass');
  assert.equal(valid.status, 'candidate_structural_pass');
  assert.ok(!fixture.groups.nasionIndices.includes(3));

  fixture.annotations.nasionIndices.targetIndex = 4;
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('target_outside_allowed_region'));

  fixture.annotations.nasionIndices.targetIndex = 1;
  fixture.annotations.nasionIndices.allowedRegionIndices = [1];
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('fixed_patch_outside_allowed_region'));

  const missingEvidence = makeValidationFixture();
  delete missingEvidence.annotations.nasionIndices.allowedRegionIndices;
  missingEvidence.annotations.nasionIndices.targetIndex = null;
  const missingEvidenceCodes = issueCodes(validateTier2Patch(missingEvidence));
  assert.ok(missingEvidenceCodes.includes('required_allowed_region_missing'));
  assert.ok(missingEvidenceCodes.includes('required_target_missing'));
  assert.ok(missingEvidenceCodes.includes('fixed_patch_allowed_region_missing'));
});

test('coverage verdicts are validated and required candidate groups cannot pass while pending', () => {
  assert.deepEqual(COVERAGE_VERDICTS, ['pending', 'pass', 'fail']);
  const fixture = makeValidationFixture();
  fixture.annotations.alarLeftIndices.coverageVerdict = 'pending';
  const pendingResult = validateTier2Patch(fixture);
  const pendingIssue = pendingResult.errors.find(({code}) => code === 'required_coverage_not_pass');
  assert.equal(pendingIssue.groupKey, 'alarLeftIndices');
  assert.match(pendingIssue.message, /coverageVerdict=pass/);
  assert.equal(pendingResult.result, 'fail');
  assert.equal(pendingResult.status, 'incomplete_or_error');
  assert.equal(pendingResult.completionStatus, 'incomplete_or_error');

  fixture.annotations.alarLeftIndices.coverageVerdict = 'unknown';
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('coverage_verdict_invalid'));

  fixture.annotations.alarLeftIndices.coverageVerdict = 'pass';
  fixture.annotations.alarLeftIndices.coverageNote = '';
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('coverage_note_missing'));

  fixture.annotations.alarLeftIndices.coverageNote = '육안 coverage pass';
  fixture.annotations.alarLeftIndices.coverageNote = 42;
  assert.ok(issueCodes(validateTier2Patch(fixture)).includes('coverage_note_invalid'));

  const bridgeFixture = makeValidationFixture();
  bridgeFixture.annotations.noseBridgeMidlineIndices.coverageVerdict = 'fail';
  assert.ok(issueCodes(validateTier2Patch(bridgeFixture)).includes('candidate_coverage_not_pass'));
});

test('validator reports count, laterality, connectivity, overlap, g1, boundary, UV, and topology faults', () => {
  {
    const fixture = makeValidationFixture();
    fixture.groups = cloneGroups(fixture.groups);
    fixture.groups.nasionIndices = [0, 1];
    fixture.annotations.nasionIndices.allowedRegionIndices = [0, 1];
    fixture.annotations.nasionIndices.fixedPatchIndices = [0, 1];
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('group_count_not_exact'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.localVertices = fixture.localVertices.map(vertex => [...vertex]);
    fixture.localVertices[7][0] = 0.2;
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('laterality_violation'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.annotations.alarLeftIndices.allowedRegionIndices = [12, 13, 14, 15, 16];
    fixture.annotations.alarLeftIndices.targetIndex = 12;
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('evidence_laterality_violation'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.meshAdjacency = fixture.meshAdjacency.map(neighbors => new Set(neighbors));
    for (const neighbor of [4, 5, 6]) {
      fixture.meshAdjacency[3].delete(neighbor);
      fixture.meshAdjacency[neighbor].delete(3);
    }
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('group_disconnected'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.groups = cloneGroups(fixture.groups);
    fixture.groups.malarApexLeftIndices[0] = 7;
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('tier2_group_overlap'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.g1Indices = [7];
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('g1_overlap'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.g1Indices = [0, 3];
    const result = validateTier2Patch(fixture);
    assert.ok(!issueCodes(result).includes('g1_overlap'));
    assert.deepEqual(result.groupDiagnostics.nasionIndices.g1OverlapIndices, [0]);
    assert.equal(result.groupDiagnostics.nasionIndices.g1OverlapAllowed, true);
    assert.deepEqual(result.groupDiagnostics.noseBridgeMidlineIndices.g1OverlapIndices, [3]);
  }
  {
    const fixture = makeValidationFixture();
    fixture.meshAdjacency = fixture.meshAdjacency.map(neighbors => new Set(neighbors));
    fixture.meshAdjacency[11].add(0);
    fixture.meshAdjacency[0].add(11);
    const result = validateTier2Patch(fixture);
    assert.ok(!issueCodes(result).includes('winner_on_patch_boundary'));
    assert.ok(result.warnings.some(({code}) => code === 'winner_on_patch_boundary'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.mirrorPolicy = {
      ...fixture.mirrorPolicy,
      mirrorIndices: Array.from({length: fixture.localVertices.length}, (_, index) => index),
    };
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('bilateral_uv_mismatch'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.mirrorPolicy = {
      ...fixture.mirrorPolicy,
      mirrorIndices: [...fixture.mirrorPolicy.mirrorIndices],
    };
    fixture.mirrorPolicy.mirrorIndices[12] = 12;
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('bilateral_uv_mismatch'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.candidateTopologyFingerprint = 'wrong';
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('topology_fingerprint_mismatch'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.candidateTopologyFingerprint = null;
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('topology_fingerprint_missing'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.captureTopologyFingerprint = null;
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('capture_topology_fingerprint_missing'));
  }
  {
    const fixture = makeValidationFixture();
    fixture.captureTopologyFingerprint = {};
    assert.ok(issueCodes(validateTier2Patch(fixture)).includes('capture_topology_fingerprint_invalid'));
  }
});

test('authoring payload is explicitly provisional and sorts/deduplicates groups', () => {
  const groups = emptyTier2Groups();
  groups.nasionIndices = [2, 0, 2, 1];
  const payload = buildAuthoringPayload({
    annotations: {},
    capturePairId: 'fixture',
    groups,
    registrationStatus: 'pass',
    reviewerId: 'reviewer-a',
    topologyFingerprint: {fingerprint: 'fixture-fingerprint'},
    validation: {status: 'pass'},
  });
  assert.equal(payload.schemaVersion, TIER2_AUTHORING_SCHEMA_VERSION);
  assert.equal(payload.reviewStatus, 'provisional_human_review_required');
  assert.deepEqual(payload.groups.nasionIndices, [0, 1, 2]);
});

function runReviewer(args, cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [REVIEWER_SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function extractEmbeddedReviewData(html) {
  const startMarker = 'var DATA=';
  const endMarker = ';\n  var GROUPS=';
  const start = html.indexOf(startMarker);
  assert.notEqual(start, -1, 'generated HTML has no DATA payload');
  const valueStart = start + startMarker.length;
  const end = html.indexOf(endMarker, valueStart);
  assert.notEqual(end, -1, 'generated HTML DATA payload has no end marker');
  return JSON.parse(html.slice(valueStart, end));
}

test('reviewer source hides candidates on first blind paint and preserves anatomical 45-degree signs', () => {
  const source = fs.readFileSync(REVIEWER_SCRIPT, 'utf8');
  assert.match(source, /body\.blind-suggestions \.grp:not\(\[data-g\^="__"\]\)\{ display:none; \}/);
  assert.match(source, /if\(suggestionsRevealedAtUtc&&lastValidation\)GROUPS\.forEach/);
  assert.match(source, /if\(view==='left45'\)\{meshState\.yaw=-Math\.PI\/4/);
  assert.match(source, /if\(view==='right45'\)\{meshState\.yaw=Math\.PI\/4/);
  assert.match(source, /coverageVerdict\.disabled=blind&&!isUnsupported/);
  assert.match(source, /state\.coverageVerdict='pending';state\.coverageNote=''/);
  assert.match(source, /function reviewGroupVisible\(group\)\{return suggestionsRevealedAtUtc\?visibleGroup\(group\):group\.key===target\.value;\}/);
  assert.match(source, /ROI\/target evidence의 반대쪽\/정중선/);
  assert.match(source, /isCanonicalIsoUtcTimestamp/);
});

const runCaptureIntegration = process.env.TIER2_RUN_CAPTURE_INTEGRATION === '1';
if (runCaptureIntegration && fs.existsSync(CAPTURE_DIR)) test(
  'CLI builds a self-contained 2D/3D board and anatomical-side diagnostics from a real capture',
  () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tier2-seed-review-test-'));
  const outHtml = path.join(tempRoot, 'review.html');
  const result = runReviewer([CAPTURE_DIR, outHtml]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(outHtml), true);
  assert.equal(fs.existsSync(path.join(tempRoot, 'review.suggestions.json')), true);

  const html = fs.readFileSync(outHtml, 'utf8');
  assert.match(html, /id="mesh3d"/);
  assert.match(html, /data-view="subnasal"/);
  assert.match(html, /id="soloTarget"/);
  assert.match(html, /id="center2d"/);
  assert.match(html, /id="disposition"/);
  assert.match(html, /id="applyBridgeFreePatch"/);
  assert.match(html, /unsupported_null/);
  assert.match(html, /allowedRegionIndices/);
  assert.match(html, /fixedPatchIndices/);
  assert.match(html, /해부학적 Left/);
  assert.match(html, /if\(view==='left45'\)\{meshState\.yaw=-Math\.PI\/4/);
  assert.match(html, /if\(view==='right45'\)\{meshState\.yaw=Math\.PI\/4/);
  assert.match(html, /svg text\{ pointer-events:none; \}/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(inlineScripts.length > 0);
  assert.doesNotThrow(() => new Function(inlineScripts.at(-1)[1]));

  const suggestionPath = path.join(tempRoot, 'review.suggestions.json');
  const suggestion = readJson(suggestionPath);
  assert.equal(suggestion.schemaVersion, 'aura.face3d-tier2-auto-suggestions.v2');
  assert.equal(suggestion.reviewStatus, 'exploratory_only_not_runtime_approved');
  assert.equal(
    suggestion.sideConvention,
    'mirrored_selfie_subject_anatomical_left_negative_face_local_lateral',
  );
  assert.equal(suggestion.topologyFingerprint.vertexCount, 1220);
  assert.equal(suggestion.topologyFingerprint.indexCount, 6912);
  assert.equal(suggestion.topologyFingerprint.uvCount, 1220);
  assert.equal(suggestion.suggestions.alarLeftIndices.length, 5);
  assert.equal(suggestion.suggestions.alarRightIndices.length, 5);

  const capture = readJson(path.join(CAPTURE_DIR, 'arface_export.json'));
  const liveMap = readJson(LIVE_MAP_PATH);
  const frame = createFaceCoordinateFrame(capture.localVertices, liveMap);
  for (const index of suggestion.suggestions.alarLeftIndices) {
    assert.ok(toFaceCoordinates(capture.localVertices[index], frame)[0] < 0);
  }
  for (const index of suggestion.suggestions.alarRightIndices) {
    assert.ok(toFaceCoordinates(capture.localVertices[index], frame)[0] > 0);
  }

  const reviewEvidence = {
    allowedRegionIndices: [0, 1, 2],
    coverageNote: 'same-capture evidence',
    coverageVerdict: 'pass',
    disposition: 'candidate_review',
    fixedPatchIndices: [],
    selectionEvidence: [{index: 1, kind: 'targetIndex', source: 'fixture'}],
    targetIndex: 1,
    unsupportedReason: '',
  };
  const sameCapturePatchPath = path.join(tempRoot, 'same-capture.json');
  fs.writeFileSync(sameCapturePatchPath, `${JSON.stringify({
    schemaVersion: TIER2_AUTHORING_SCHEMA_VERSION,
    capturePairId: capture.capturePairId,
    blindReviewCompleted: true,
    reviewerId: 'reviewer-alpha',
    registrationStatus: 'pass',
    suggestionsRevealedAtUtc: '2026-07-14T00:00:00.000Z',
    topologyFingerprint: suggestion.topologyFingerprint,
    groups: emptyTier2Groups(),
    annotations: {nasionIndices: reviewEvidence},
  })}\n`);
  const sameCaptureHtml = path.join(tempRoot, 'same-capture.html');
  const sameCaptureResult = runReviewer(
    [CAPTURE_DIR, sameCaptureHtml, '--patch', sameCapturePatchPath],
    path.join(REPO_ROOT, 'apps/mobile'),
  );
  assert.equal(sameCaptureResult.status, 0, sameCaptureResult.stderr);
  const sameCaptureData = extractEmbeddedReviewData(fs.readFileSync(sameCaptureHtml, 'utf8'));
  assert.equal(sameCaptureData.initialAuthoringPayload.reviewerId, 'reviewer-alpha');
  assert.equal(sameCaptureData.initialAuthoringPayload.registrationStatus, 'pass');
  assert.equal(sameCaptureData.initialSuggestionsRevealedAtUtc, null);
  assert.deepEqual(
    sameCaptureData.initialAuthoringPayload.annotations.nasionIndices.allowedRegionIndices,
    [0, 1, 2],
  );
  assert.equal(sameCaptureData.initialAuthoringPayload.annotations.nasionIndices.targetIndex, 1);
  assert.equal(sameCaptureData.initialAuthoringPayload.annotations.nasionIndices.coverageVerdict, 'pass');
  assert.equal(
    sameCaptureData.initialAuthoringPayload.annotations.nasionIndices.coverageNote,
    'same-capture evidence',
  );
  assert.deepEqual(
    sameCaptureData.initialAuthoringPayload.annotations.nasionIndices.selectionEvidence,
    reviewEvidence.selectionEvidence,
  );

  const crossCaptureGroups = emptyTier2Groups();
  crossCaptureGroups.nasionIndices = [0];
  const crossCapturePatchPath = path.join(tempRoot, 'cross-capture.json');
  fs.writeFileSync(crossCapturePatchPath, `${JSON.stringify({
    schemaVersion: TIER2_AUTHORING_SCHEMA_VERSION,
    capturePairId: 'pair_different_capture',
    reviewerId: 'must-not-carry-over',
    registrationStatus: 'pass',
    topologyFingerprint: suggestion.topologyFingerprint,
    groups: crossCaptureGroups,
    annotations: {
      nasionIndices: {...reviewEvidence, fixedPatchIndices: [0]},
    },
  })}\n`);
  const crossCaptureHtml = path.join(tempRoot, 'cross-capture.html');
  const crossCaptureResult = runReviewer([
    CAPTURE_DIR,
    crossCaptureHtml,
    '--patch',
    crossCapturePatchPath,
  ]);
  assert.equal(crossCaptureResult.status, 0, crossCaptureResult.stderr);
  const crossCaptureData = extractEmbeddedReviewData(fs.readFileSync(crossCaptureHtml, 'utf8'));
  const crossCapturePayload = crossCaptureData.initialAuthoringPayload;
  assert.deepEqual(crossCapturePayload.groups.nasionIndices, [0]);
  assert.deepEqual(crossCapturePayload.annotations.nasionIndices.fixedPatchIndices, [0]);
  assert.equal(crossCapturePayload.reviewerId, '');
  assert.equal(crossCapturePayload.registrationStatus, 'pending');
  assert.deepEqual(crossCapturePayload.annotations.nasionIndices.allowedRegionIndices, []);
  assert.equal(crossCapturePayload.annotations.nasionIndices.targetIndex, null);
  assert.equal(crossCapturePayload.annotations.nasionIndices.coverageVerdict, 'pending');
  assert.equal(crossCapturePayload.annotations.nasionIndices.coverageNote, '');
  assert.deepEqual(crossCapturePayload.annotations.nasionIndices.selectionEvidence, []);

  const reprojectionHtml = path.join(tempRoot, 'reprojection.html');
  const reprojectionResult = runReviewer([
    CAPTURE_DIR,
    reprojectionHtml,
    '--patch',
    crossCapturePatchPath,
    '--reprojection',
  ]);
  assert.equal(reprojectionResult.status, 0, reprojectionResult.stderr);
  const reprojectionSource = fs.readFileSync(reprojectionHtml, 'utf8');
  const reprojectionData = extractEmbeddedReviewData(reprojectionSource);
  const reprojectionPayload = reprojectionData.initialAuthoringPayload;
  assert.equal(reprojectionData.reprojectionMode, true);
  assert.equal(reprojectionData.initialSuggestionsRevealedAtUtc, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(reprojectionPayload.groups.nasionIndices, [0]);
  assert.deepEqual(reprojectionPayload.annotations.nasionIndices.allowedRegionIndices, [0]);
  assert.equal(reprojectionPayload.annotations.nasionIndices.targetIndex, 0);
  assert.equal(reprojectionPayload.annotations.nasionIndices.coverageVerdict, 'pending');
  assert.match(reprojectionSource, /고정 patch 재투영 검수 모드/);
  assert.match(reprojectionSource, /fixed_patch_reprojection/);
  assert.match(reprojectionSource, /fixed-reprojection-layer/);
  assert.match(reprojectionSource, /fixed-reprojection-point/);

  const reprojectionWithoutPatch = runReviewer([
    CAPTURE_DIR,
    path.join(tempRoot, 'reprojection-without-patch.html'),
    '--reprojection',
  ]);
  assert.notEqual(reprojectionWithoutPatch.status, 0);
  assert.match(reprojectionWithoutPatch.stderr, /--patch/);

  const missingFingerprintPath = path.join(tempRoot, 'missing-fingerprint.json');
  fs.writeFileSync(missingFingerprintPath, `${JSON.stringify({groups: emptyTier2Groups()})}\n`);
  const missingFingerprint = runReviewer([
    CAPTURE_DIR,
    path.join(tempRoot, 'missing-fingerprint.html'),
    '--patch',
    missingFingerprintPath,
  ]);
  assert.notEqual(missingFingerprint.status, 0);
  assert.match(missingFingerprint.stderr, /topologyFingerprint/);

  const invalidGroups = emptyTier2Groups();
  invalidGroups.nasionIndices = [1220];
  const outOfRangePath = path.join(tempRoot, 'out-of-range.json');
  fs.writeFileSync(outOfRangePath, `${JSON.stringify({
    topologyFingerprint: suggestion.topologyFingerprint,
    groups: invalidGroups,
  })}\n`);
  const outOfRange = runReviewer([
    CAPTURE_DIR,
    path.join(tempRoot, 'out-of-range.html'),
    '--patch',
    outOfRangePath,
  ]);
  assert.notEqual(outOfRange.status, 0);
  assert.match(outOfRange.stderr, /범위 밖 (?:vertex )?index/);

  const duplicateGroups = emptyTier2Groups();
  duplicateGroups.nasionIndices = [1, 1];
  const duplicatePath = path.join(tempRoot, 'duplicate.json');
  fs.writeFileSync(duplicatePath, `${JSON.stringify({
    topologyFingerprint: suggestion.topologyFingerprint,
    groups: duplicateGroups,
  })}\n`);
  const duplicate = runReviewer([
    CAPTURE_DIR,
    path.join(tempRoot, 'duplicate.html'),
    '--patch',
    duplicatePath,
  ]);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /중복 (?:vertex )?index/);

  const wrongExtension = path.join(tempRoot, 'must-not-overwrite.json');
  const rejectedOutput = runReviewer([CAPTURE_DIR, wrongExtension]);
  assert.notEqual(rejectedOutput.status, 0);
  assert.match(rejectedOutput.stderr, /\.html/);
  assert.equal(fs.existsSync(wrongExtension), false);

  const rejectedOption = runReviewer([CAPTURE_DIR, '--unknown']);
  assert.notEqual(rejectedOption.status, 0);
  assert.match(rejectedOption.stderr, /알 수 없는 옵션/);
  },
);
else console.log(
  `skip - real-capture CLI integration (${runCaptureIntegration ? 'fixture absent' : 'set TIER2_RUN_CAPTURE_INTEGRATION=1'})`,
);

console.log(`\n${passed} Tier-2 seed reviewer tests passed.`);
