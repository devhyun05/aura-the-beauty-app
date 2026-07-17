#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION,
  FACE_LENGTH_NORM_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
  FACE_LENGTH_NORM_INPUT_SCHEMA_VERSION,
  buildNormCandidate,
  calculateSampleStatistics,
  sha256Text,
  validateApproval,
  validateEstimatorInput,
} from './face-length-norm-contract.mjs';
import {estimateManifest} from './estimate-face-length-norm.mjs';
import {validateEvidence} from './validate-face-length-norm-candidate.mjs';


const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const COMMIT_SHA = 'c'.repeat(40);

function syntheticManifest() {
  return {
    schemaVersion: FACE_LENGTH_NORM_INPUT_SCHEMA_VERSION,
    locale: 'synthetic-AA',
    localeSelectionSource: 'self_selected',
    measurementContractId: 'synthetic-face-length/v1',
    rawFaceDataIncluded: false,
    collectionProtocol: {
      protocolId: 'synthetic_protocol_v1',
      appBuild: 'synthetic_build_v1',
      codeCommitSha: COMMIT_SHA,
      measurementDefinition: 'Synthetic scalar contract; no image or landmark payload.',
    },
    evidenceAttestation: {
      schemaVersion: FACE_LENGTH_NORM_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
      decision: 'approved',
      sourceKind: 'controlled_offline_collection',
      productHistoryIncluded: false,
      collectionEvidenceArtifactSha256: SHA_A,
      reviewer: 'reviewer_synthetic',
      reviewedAtUtc: '2026-07-17T00:10:00Z',
    },
    samples: [
      {
        subjectId: 'subj_synthetic_01',
        captureId: 'capture_synthetic_01',
        selfSelectedLocale: 'synthetic-AA',
        localeSelectionSource: 'self_selected',
        faceLengthRatio: 1,
        sourceArtifactSha256: SHA_A,
        capturedAtUtc: '2026-07-17T00:00:00Z',
      },
      {
        subjectId: 'subj_synthetic_02',
        captureId: 'capture_synthetic_02',
        selfSelectedLocale: 'synthetic-AA',
        localeSelectionSource: 'self_selected',
        faceLengthRatio: 2,
        sourceArtifactSha256: SHA_B,
        capturedAtUtc: '2026-07-17T00:01:00Z',
      },
    ],
  };
}

const manifest = syntheticManifest();
validateEstimatorInput(manifest);

const statistics = calculateSampleStatistics([1, 2]);
assert.equal(statistics.mean, 1.5);
assert.ok(Math.abs(statistics.sampleStandardDeviation - Math.sqrt(0.5)) <= 1e-12);

const candidate = buildNormCandidate(manifest, {estimatorSourceSha256: SHA_A});
assert.equal(candidate.status, 'candidate_flag_off');
assert.equal(candidate.activationEligible, false);
assert.equal(candidate.featureFlagDefault, 'off');
assert.equal(candidate.rawFaceDataIncluded, false);
assert.equal(candidate.evidenceProvenance, 'approved_attested_collection');
assert.equal(candidate.productHistoryIncluded, false);
assert.equal(candidate.localeSelectionSource, 'self_selected');
assert.equal(candidate.subjectCount, 2);

const rawImageManifest = structuredClone(manifest);
rawImageManifest.samples[0].imageUri = 'file:///private/raw-face.jpg';
assert.throws(() => validateEstimatorInput(rawImageManifest), /prohibited raw face/i);

const rawLandmarkManifest = structuredClone(manifest);
rawLandmarkManifest.samples[0].landmarks = [{x: 0, y: 0}];
assert.throws(() => validateEstimatorInput(rawLandmarkManifest), /prohibited raw face/i);

const rawFaceVectorManifest = structuredClone(manifest);
rawFaceVectorManifest.samples[0].rawFaceVector = [0.1, 0.2];
assert.throws(() => validateEstimatorInput(rawFaceVectorManifest), /prohibited raw face/i);

const inferredLocaleManifest = structuredClone(manifest);
inferredLocaleManifest.localeSelectionSource = 'device_inferred';
assert.throws(() => validateEstimatorInput(inferredLocaleManifest), /self_selected/);

const productHistoryManifest = structuredClone(manifest);
delete productHistoryManifest.evidenceAttestation;
productHistoryManifest.clientObservedSnapshots = [
  {faceLengthRatio: 1.5, evidenceProvenance: 'client_observed_unverified'},
];
assert.throws(
  () => validateEstimatorInput(productHistoryManifest),
  /unsupported keys|evidenceAttestation is required/,
);

const productHistoryAttestation = structuredClone(manifest);
productHistoryAttestation.evidenceAttestation.productHistoryIncluded = true;
productHistoryAttestation.evidenceAttestation.sourceKind = 'product_history';
assert.throws(
  () => validateEstimatorInput(productHistoryAttestation),
  /product history excluded/,
);

const mixedLocaleManifest = structuredClone(manifest);
mixedLocaleManifest.samples[1].selfSelectedLocale = 'synthetic-BB';
assert.throws(() => validateEstimatorInput(mixedLocaleManifest), /locale must match/);

const duplicateSubjectManifest = structuredClone(manifest);
duplicateSubjectManifest.samples[1].subjectId = duplicateSubjectManifest.samples[0].subjectId;
assert.throws(() => validateEstimatorInput(duplicateSubjectManifest), /one sample only/);

const invalidNumberManifest = structuredClone(manifest);
invalidNumberManifest.samples[1].faceLengthRatio = Number.NaN;
assert.throws(() => validateEstimatorInput(invalidNumberManifest), /finite and positive/);

const recomputedCandidate = estimateManifest(manifest);
const modelArtifactSha256 = sha256Text(JSON.stringify(recomputedCandidate));
const candidateWithRawFaceData = {
  ...recomputedCandidate,
  rawFaceVector: [0.1, 0.2],
};
assert.throws(
  () => validateEvidence({
    manifest,
    candidate: candidateWithRawFaceData,
    candidateSha256: modelArtifactSha256,
  }),
  /prohibited raw face/i,
);
const withoutApproval = validateEvidence({
  manifest,
  candidate: recomputedCandidate,
  candidateSha256: modelArtifactSha256,
});
assert.deepEqual(withoutApproval, {
  evidenceValidated: true,
  approvalValidated: false,
  activationEligible: false,
  featureFlagDefault: 'off',
  reason: 'approval_missing',
});

const approval = {
  schemaVersion: FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION,
  decision: 'approved',
  locale: recomputedCandidate.locale,
  localeSelectionSource: 'self_selected',
  measurementContractId: recomputedCandidate.measurementContractId,
  modelArtifactSha256,
  datasetManifestSha256: recomputedCandidate.datasetManifestSha256,
  estimatorSourceSha256: recomputedCandidate.estimatorSourceSha256,
  evidenceAttestationSha256: recomputedCandidate.evidenceAttestationSha256,
  reviewer: 'reviewer_synthetic',
  reviewedAtUtc: '2026-07-17T01:00:00Z',
};
validateApproval(approval, recomputedCandidate, {modelArtifactSha256});
const withApproval = validateEvidence({
  manifest,
  candidate: recomputedCandidate,
  candidateSha256: modelArtifactSha256,
  approval,
});
assert.equal(withApproval.approvalValidated, true);
assert.equal(withApproval.activationEligible, false);
assert.equal(withApproval.reason, 'approval_validated_but_promotion_not_implemented');

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const statusPath = path.resolve(
  currentDirectory,
  '../../docs/face-ratio/FACE_LENGTH_NORM_STATUS.json',
);
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
assert.equal(status.status, 'pending');
assert.equal(status.featureFlagDefault, 'off');
assert.equal(status.activeModel, null);
assert.equal(status.approval, null);
assert.equal(Object.hasOwn(status, 'mean'), false);
assert.equal(Object.hasOwn(status, 'sampleStandardDeviation'), false);

process.stdout.write('face-length norm estimator contract: ok\n');
