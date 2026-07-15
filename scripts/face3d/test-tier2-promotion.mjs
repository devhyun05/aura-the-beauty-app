#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {computeCandidateSemanticContentSha256} from './build-semantic-validation.mjs';
import {
  promoteTier2SemanticMap,
  verifyTier2Diagnostics,
} from './promote-tier2-semantic-map.mjs';
import {TIER2_SEMANTIC_GROUPS} from './semantic-candidate-core.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const candidatePath = path.join(
  root,
  'artifacts/face3d/semantic-approval-g2/ARKitFaceSemanticMapV1.g2.candidate.json',
);
const receiptPath = path.join(
  root,
  'artifacts/face3d/semantic-approval-g2/ARKitFaceSemanticMapV1.g2.promotion-receipt.json',
);
const manifestPath = path.join(
  root,
  'artifacts/face3d/semantic-approval-g2/tier2-promotion-manifest.json',
);
const liveMapPath = path.join(
  root,
  'apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json',
);

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

const committedCandidate = readJson(candidatePath);
const committedReceipt = readJson(receiptPath);
assert.equal(
  computeCandidateSemanticContentSha256(committedCandidate),
  committedReceipt.candidate.semanticContentSha256,
  'committed G2 candidate must match its approval receipt',
);
assert.deepEqual(committedCandidate.groups.chinIndices, [34, 35, 975]);
for (const {fixedIndices, key} of TIER2_SEMANTIC_GROUPS) {
  assert.deepEqual(committedCandidate.groups[key], fixedIndices, key);
}

const manifest = readJson(manifestPath);
const diagnostics = readJson(path.join(
  root,
  'artifacts/face3d/semantic-approval-g2/tier2-offline-diagnostics-17.json',
));
const promotion = promoteTier2SemanticMap({
  candidate: committedCandidate,
  manifest,
  manifestPath,
});
assert.deepEqual(promotion.runtimeMap, readJson(liveMapPath));
assert.equal(promotion.receipt.runtimeMap.mapId, 'arkit-face3d-g2-product-approved-v1');
assert.equal(promotion.receipt.evidence.offlineDiagnostics17.captureCount, 17);
assert.equal(promotion.receipt.evidence.offlineDiagnostics17.finiteMetricCount, 11);
assert.equal(
  promotion.receipt.evidence.deviceRepeatability.status,
  'waived_by_product_owner',
);

const missingCaptureDiagnostics = structuredClone(diagnostics);
missingCaptureDiagnostics.captures.pop();
assert.throws(
  () => verifyTier2Diagnostics(missingCaptureDiagnostics, committedCandidate),
  /서로 다른 17개 capture/,
);

const duplicateCaptureDiagnostics = structuredClone(diagnostics);
duplicateCaptureDiagnostics.captures[16].capturePairId =
  duplicateCaptureDiagnostics.captures[0].capturePairId;
assert.throws(
  () => verifyTier2Diagnostics(duplicateCaptureDiagnostics, committedCandidate),
  /서로 다른 17개 capture/,
);

const alteredPatchCandidate = structuredClone(committedCandidate);
alteredPatchCandidate.groups.alarLeftIndices.pop();
assert.throws(
  () => promoteTier2SemanticMap({
    candidate: alteredPatchCandidate,
    manifest,
    manifestPath,
  }),
  /최소 5개|제품 승인 고정 patch/,
);

const noWaiverManifest = structuredClone(manifest);
noWaiverManifest.deviceRepeatability.status = 'pending';
assert.throws(
  () => promoteTier2SemanticMap({
    candidate: committedCandidate,
    manifest: noWaiverManifest,
    manifestPath,
  }),
  /면제 결정/,
);

const deceptiveReviewStatusCandidate = structuredClone(committedCandidate);
deceptiveReviewStatusCandidate.reviewStatus = 'malicious_not_runtime_approved_suffix';
assert.throws(
  () => promoteTier2SemanticMap({
    candidate: deceptiveReviewStatusCandidate,
    manifest,
    manifestPath,
  }),
  /승인 전 G2 candidate/,
);

const invalidReviewedAtManifest = structuredClone(manifest);
invalidReviewedAtManifest.reviewedAtUtc = 'not-a-date';
assert.throws(
  () => promoteTier2SemanticMap({
    candidate: committedCandidate,
    manifest: invalidReviewedAtManifest,
    manifestPath,
  }),
  /reviewedAtUtc/,
);

const outsideRepositoryManifest = structuredClone(manifest);
outsideRepositoryManifest.evidence.baseG1ApprovalReceipt = '../../../../../../etc/passwd';
assert.throws(
  () => promoteTier2SemanticMap({
    candidate: committedCandidate,
    manifest: outsideRepositoryManifest,
    manifestPath,
  }),
  /repository 밖/,
);

console.log('Face3D Tier-2 candidate and promotion tests passed.');
