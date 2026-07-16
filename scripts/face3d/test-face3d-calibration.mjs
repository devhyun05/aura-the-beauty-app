#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FACE3D_ALL_METRIC_KEYS,
  FACE3D_METRIC_KEYS,
  extractMetricsFromCaptureFile,
  extractMetricsFromProfile,
} from './analyze-repeatability.mjs';
import {
  FACE3D_REPEATABILITY_SOURCE_INDEX_SCHEMA_VERSION,
  adaptRepeatabilitySourceIndex,
} from './adapt-repeatability-manifest.mjs';
import {
  FACE3D_CALIBRATION_FRAME_COUNTS,
  FACE3D_EXACT_POLICY_IDS,
  FACE3D_GATE_VERSION_V2,
  FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION,
  FACE3D_VALIDATION_COHORT_SCHEMA_VERSION,
  buildUnsignedCalibrationReceipt,
  canonicalProfileBindingJson,
  computeProfileBindingSha256,
  sha256Canonical,
  validateExactDiagnosticProfile,
} from './face3d-calibration-contract.mjs';
import {
  FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION,
  buildFaceMeasurementCollectionPlan,
} from './prepare-face-measurement-collection.mjs';
import {
  FACE3D_CALIBRATED_PROFILE_ENVELOPE_SCHEMA_VERSION,
  FACE3D_CALIBRATION_APPROVAL_SCHEMA_VERSION,
  FACE3D_CALIBRATION_MODEL_SCHEMA_VERSION,
  FACE3D_CALIBRATION_PROMOTION_MANIFEST_SCHEMA_VERSION,
  evaluateFace3DCalibrationPromotion,
} from './promote-face3d-calibration.mjs';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('gate status registry remains fail-closed for v3 calibration', () => {
  const gateStatus = JSON.parse(
    fs.readFileSync(
      new URL('../../docs/face3d/FACE3D_GATE_STATUS.json', import.meta.url),
      'utf8',
    ),
  );
  const calibration = gateStatus.confidenceCalibration;
  const validation = gateStatus.validation;

  assert.equal(gateStatus.schemaVersion, 'aura.face3d-gate-status.v3');
  assert.equal(gateStatus.registryRevision, 'provenance-separated.v1');
  assert.match(gateStatus.recordedAtUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(calibration.revision, 'confidence-calibration-v3-pending.v1');
  assert.match(calibration.recordedAtUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(calibration.scope, /excludes Unity Editor, device, Gate 6B/);
  assert.equal(calibration.profileSchemaVersion, 'aura.face3d-profile.v3');
  assert.equal(calibration.status, 'pending');
  assert.equal(calibration.validationStatus, 'not_run');
  assert.equal(calibration.validatedCommitSha, null);
  assert.equal(calibration.featureFlagDefault, 'off');
  assert.equal(calibration.policyId, null);
  assert.equal(calibration.approvalArtifactPath, null);
  assert.equal(calibration.approvalArtifactSha256, null);
  assert.equal(calibration.receiptPath, null);
  assert.equal(calibration.receiptSha256, null);

  for (const [name, section] of Object.entries(validation)) {
    assert.equal(typeof section.revision, 'string', `${name}.revision`);
    assert.equal(typeof section.scope, 'string', `${name}.scope`);
    assert.equal(typeof section.status, 'string', `${name}.status`);
    assert.match(
      section.recordedAtUtc,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
      `${name}.recordedAtUtc`,
    );
  }

  assert.equal(
    validation.historicalG2UnityEditor.validatedCommitSha,
    'b1287bde521ce0d10430b3b1048d8a56970e36e8',
  );
  assert.equal(
    validation.historicalG2UnityEditor.status,
    'passed_historical_not_current_v3',
  );
  assert.equal(validation.historicalG2UnityEditor.resultPath, null);
  assert.equal(
    validation.historicalG2RepositorySnapshot.status,
    'unverified_historical',
  );
  assert.equal(
    validation.historicalG2RepositorySnapshot.validatedCommitSha,
    null,
  );
  assert.equal(
    validation.currentV3StaticNodeValidation.status,
    'passed_worktree_unbound',
  );
  assert.equal(validation.currentV3StaticNodeValidation.validatedCommitSha, null);
  assert.equal(validation.currentV3UnityEditorValidation.status, 'not_run');
  assert.equal(validation.currentV3UnityEditorValidation.validatedCommitSha, null);
  assert.equal(validation.currentV3UnityEditorValidation.resultPath, null);
});

function metricValues(base, delta = 0) {
  return Object.fromEntries(
    FACE3D_ALL_METRIC_KEYS.map((key, index) => [
      key,
      base + index * 0.01 + delta,
    ]),
  );
}

function trueDepthSensorProvenance() {
  return {
    trueDepthHardware: true,
    depthDataObservedRatio: 1,
    faceTrackingSupported: true,
    deviceModel: 'iPhone15,3',
  };
}

function profileMetrics(values, validFrameCount = 30) {
  const metrics = Object.fromEntries(
    FACE3D_ALL_METRIC_KEYS.map(key => [
      key,
      {
        value: values[key],
        confidence: 0.8,
        unit: 'normalized',
        validFrameCount,
        mad: 0.001,
        valueMm: values[key] * 10,
        valueMmConfidence: 0.75,
        valueMmValidFrameCount: validFrameCount,
        valueMmMad: 0.1,
      },
    ]),
  );
  if (validFrameCount === 1) {
    for (const metric of Object.values(metrics)) {
      metric.confidence = 0;
      metric.mad = null;
      metric.valueMmConfidence = 0;
      metric.valueMmMad = null;
    }
  }
  return metrics;
}

function exactProfile(frameCount, values, overrides = {}) {
  return {
    schemaVersion: 'aura.face3d-profile.v3',
    source: 'arkit_face_mesh',
    collectionPolicyId: FACE3D_EXACT_POLICY_IDS[frameCount],
    sampleMode: frameCount === 1 ? 'single_frame' : 'micro_burst',
    aggregation: frameCount === 1 ? 'none' : 'median_mad',
    gateVersion: FACE3D_GATE_VERSION_V2,
    validFrameCount: frameCount,
    targetFrameCount: frameCount,
    completionRatio: 1,
    confidenceCalibrationStatus: 'uncalibrated',
    captureWindowMs:
      frameCount === 30 ? 1200
        : frameCount === 12 ? 480
          : frameCount === 8 ? 400
            : 300,
    sensorProvenance: trueDepthSensorProvenance(),
    topologyFingerprint: 'fixture-topology',
    warnings: [],
    metrics: profileMetrics(values, frameCount),
    ...overrides,
  };
}

function legacyProfile(values) {
  return {
    schemaVersion: 'aura.face3d-profile.v1',
    source: 'arkit_face_mesh',
    gateVersion: 'face3d-gate-v1',
    validFrameCount: 30,
    targetFrameCount: 30,
    topologyFingerprint: 'fixture-topology',
    warnings: [],
    metrics: profileMetrics(values),
  };
}

function makeRepeatabilityManifest(frameCount) {
  const captures = [];
  const subjectBases = [0.2, 0.4, 0.6];
  for (let subjectIndex = 0; subjectIndex < subjectBases.length; subjectIndex += 1) {
    for (let repeatIndex = 0; repeatIndex < 3; repeatIndex += 1) {
      const delta = (repeatIndex - 1) * 0.001;
      captures.push({
        attemptId: `attempt-${frameCount}-${subjectIndex}-${repeatIndex}`,
        subjectId: `subj_cal_${subjectIndex + 1}`,
        sessionId: `session_cal_${subjectIndex}_${repeatIndex}`,
        pairId: `cal-pair-${subjectIndex}-${repeatIndex}`,
        shotKind: 'neutral',
        captureId: `cal-cap-${frameCount}-${subjectIndex}-${repeatIndex}`,
        requestId: `request-${frameCount}-${subjectIndex}-${repeatIndex}`,
        sourceEventType: 'unified_face_capture_completed',
        sourceFile: `fixture-${frameCount}.jsonl`,
        sourceSha256: 'a'.repeat(64),
        profileBindingSha256: 'b'.repeat(64),
        profile: exactProfile(
          frameCount,
          metricValues(subjectBases[subjectIndex], delta),
        ),
      });
    }
  }
  return {
    schemaVersion: FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION,
    generatedAtUtc: '2026-07-17T00:00:00.000Z',
    cohortRole: 'calibration',
    frameCount,
    collectionPolicyId: FACE3D_EXACT_POLICY_IDS[frameCount],
    gateVersion: FACE3D_GATE_VERSION_V2,
    appBuild: 'com.nicewei.aura.dev@1.0.0+100',
    rawFaceDataIncluded: false,
    sourceIndexSha256: 'c'.repeat(64),
    attempts: {
      total: 9,
      succeeded: 9,
      failed: 0,
      failureRate: 0,
    },
    manifestValidation: {
      ok: true,
      requiredSubjects: 3,
      requiredCapturesPerSubject: 3,
    },
    captures,
  };
}

function makeValidationCohort() {
  const pairs = [];
  for (let subjectIndex = 0; subjectIndex < 60; subjectIndex += 1) {
    const base = 0.2 + subjectIndex * 0.005;
    const profiles = {};
    for (const frameCount of FACE3D_CALIBRATION_FRAME_COUNTS) {
      const candidateOffset =
        frameCount === 5 ? 0.0005
          : frameCount === 8 ? 0.0004
            : frameCount === 12 ? 0.0003
              : frameCount === 30 ? 0
                : 0.0008;
      profiles[String(frameCount)] = {
        captureId: `val-cap-${subjectIndex}-${frameCount}`,
        profile: exactProfile(
          frameCount,
          metricValues(base, candidateOffset),
        ),
      };
    }
    pairs.push({
      subjectId: `subj_val_${String(subjectIndex + 1).padStart(3, '0')}`,
      sessionId: `session_val_${String(subjectIndex + 1).padStart(3, '0')}`,
      pairId: `val-pair-${String(subjectIndex + 1).padStart(3, '0')}`,
      profiles,
    });
  }
  return {
    schemaVersion: FACE3D_VALIDATION_COHORT_SCHEMA_VERSION,
    cohortRole: 'validation',
    independentFromCalibration: true,
    rawFaceDataIncluded: false,
    phaseMinusOnePreregistration: {
      status: 'approved_before_collection',
      approvedAtUtc: '2026-07-16T00:00:00.000Z',
      requiredValidationSubjects: 60,
    },
    collectionStartedAtUtc: '2026-07-17T00:00:00.000Z',
    attemptsByFrameCount: Object.fromEntries(
      FACE3D_CALIBRATION_FRAME_COUNTS.map(frameCount => [
        String(frameCount),
        {total: 60, succeeded: 60, failed: 0, failureRate: 0},
      ]),
    ),
    pairs,
  };
}

function createPromotionFixture(root) {
  const evidence = {};
  const evidenceHashes = {repeatability: {}};
  for (const frameCount of FACE3D_CALIBRATION_FRAME_COUNTS) {
    const fileName = `repeatability-${frameCount}.json`;
    const filePath = path.join(root, fileName);
    writeJson(filePath, makeRepeatabilityManifest(frameCount));
    evidence[`repeatability${frameCount}`] = fileName;
    evidenceHashes.repeatability[frameCount] = {
      file: fileName,
      sha256: sha256File(filePath),
    };
  }

  const validationFile = 'validation-cohort.json';
  const validationPath = path.join(root, validationFile);
  writeJson(validationPath, makeValidationCohort());
  evidence.validationCohort = validationFile;
  evidenceHashes.validationCohort = {
    file: validationFile,
    sha256: sha256File(validationPath),
  };

  const model = {
    schemaVersion: FACE3D_CALIBRATION_MODEL_SCHEMA_VERSION,
    status: 'candidate_flag_off',
    featureFlagDefault: 'off',
    coverageTreatment: 'completion_separate_from_quality',
    qualitySignals: [
      'pose',
      'neutralExpression',
      'tracking',
      'nativeSync',
      'independentRepeatability',
    ],
    validationCohortRole: 'independent',
  };
  const modelFile = 'calibration-model.json';
  const modelPath = path.join(root, modelFile);
  writeJson(modelPath, model);
  evidence.calibrationModel = modelFile;
  evidenceHashes.calibrationModel = {
    file: modelFile,
    sha256: sha256File(modelPath),
  };

  const evidenceBundleSha256 = sha256Canonical(evidenceHashes);
  const requestedPolicyId = 'unified-micro-burst-5of8-v1';
  const approval = {
    schemaVersion: FACE3D_CALIBRATION_APPROVAL_SCHEMA_VERSION,
    decision: 'approved_for_receipt_signing',
    reviewerRole: 'product-owner',
    reviewedAtUtc: '2026-07-17T01:00:00.000Z',
    selectedFrameCount: 5,
    policyId: requestedPolicyId,
    gateVersion: FACE3D_GATE_VERSION_V2,
    evidenceBundleSha256,
    calibrationModelSha256: sha256File(modelPath),
  };
  const approvalFile = 'calibration-approval.json';
  writeJson(path.join(root, approvalFile), approval);
  evidence.approvalArtifact = approvalFile;

  const captureNonce = 'cap_fixture_0001';
  const appBuild = 'com.nicewei.aura.dev@1.0.0+100';
  const productProfile = exactProfile(8, metricValues(0.4), {
    collectionPolicyId: requestedPolicyId,
    captureNonce,
    validFrameCount: 5,
    targetFrameCount: 8,
    completionRatio: 0.625,
    confidenceCalibrationStatus: 'calibrated',
    captureWindowMs: 420,
    metrics: profileMetrics(metricValues(0.4), 5),
  });
  const profileEnvelopeFile = 'calibrated-profile-envelope.json';
  writeJson(path.join(root, profileEnvelopeFile), {
    schemaVersion: FACE3D_CALIBRATED_PROFILE_ENVELOPE_SCHEMA_VERSION,
    captureNonce,
    appBuild,
    profile: productProfile,
  });

  const manifest = {
    schemaVersion: FACE3D_CALIBRATION_PROMOTION_MANIFEST_SCHEMA_VERSION,
    executionMode: 'dry_run_only',
    requestedFrameCount: 5,
    requestedPolicyId,
    evidence,
    profileEnvelope: profileEnvelopeFile,
    receiptContext: {
      receiptId: 'receipt_fixture_0001',
      captureNonce,
      appBuild,
      issuedAtUtc: '2026-07-17T01:05:00.000Z',
      expiresAtUtc: '2026-07-17T01:20:00.000Z',
      subjectContextId: 'subj_user_11111111-1111-4111-8111-111111111111',
      reportContextId:
        'report_photo_capture_22222222-2222-4222-8222-222222222222',
    },
  };
  const manifestPath = path.join(root, 'promotion-manifest.json');
  writeJson(manifestPath, manifest);
  return {manifest, manifestPath, model, validationPath};
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-face3d-calibration-'));

test('exact diagnostics require independent millimeter quality metadata', () => {
  const missingQuality = exactProfile(8, metricValues(0.2));
  delete missingQuality.metrics.noseTipProjection.valueMmConfidence;
  assert.throws(
    () => validateExactDiagnosticProfile(missingQuality, 8),
    /valueMmConfidence/,
  );

  const belowMinimum = exactProfile(8, metricValues(0.2));
  belowMinimum.metrics.noseTipProjection.valueMmValidFrameCount = 4;
  assert.throws(
    () => validateExactDiagnosticProfile(belowMinimum, 8),
    /raw inlier 최소치 미달/,
  );

  belowMinimum.metrics.noseTipProjection.valueMm = null;
  validateExactDiagnosticProfile(belowMinimum, 8);
});

test('exact diagnostics reject missing TrueDepth sensor provenance', () => {
  const missingProvenance = exactProfile(8, metricValues(0.2));
  delete missingProvenance.sensorProvenance;
  assert.throws(
    () => validateExactDiagnosticProfile(missingProvenance, 8),
    /sensorProvenance/,
  );
});

test('unified exact-30 events adapt to the common 3x3 repeatability manifest', () => {
  const attempts = [];
  for (let subjectIndex = 0; subjectIndex < 3; subjectIndex += 1) {
    for (let repeatIndex = 0; repeatIndex < 3; repeatIndex += 1) {
      const captureId = `cap_exact30_${subjectIndex}_${repeatIndex}`;
      const fileName = `exact30-${subjectIndex}-${repeatIndex}.jsonl`;
      const event = {
        event: {
          type: 'face3d_analyzed',
          requestId: `request-${subjectIndex}-${repeatIndex}`,
          profile: exactProfile(
            30,
            metricValues(0.2 + subjectIndex * 0.2, repeatIndex * 0.001),
          ),
        },
        rawFaceDataIncluded: false,
        unifiedCapture: {
          captureId,
          sourceEventType: 'unified_face_capture_completed',
        },
      };
      fs.writeFileSync(path.join(root, fileName), `${JSON.stringify(event)}\n`, 'utf8');
      attempts.push({
        attemptId: `attempt_exact30_${subjectIndex}_${repeatIndex}`,
        subjectId: `subj_exact_${subjectIndex + 1}`,
        sessionId: `session_exact30_${subjectIndex}_${repeatIndex}`,
        pairId: `pair-exact30-${subjectIndex}-${repeatIndex}`,
        shotKind: 'neutral',
        status: 'success',
        sourcePath: fileName,
        captureId,
      });
    }
  }
  const index = {
    schemaVersion: FACE3D_REPEATABILITY_SOURCE_INDEX_SCHEMA_VERSION,
    cohortRole: 'calibration',
    frameCount: 30,
    collectionPolicyId: FACE3D_EXACT_POLICY_IDS[30],
    gateVersion: FACE3D_GATE_VERSION_V2,
    appBuild: 'com.nicewei.aura.dev@1.0.0+100',
    attempts,
  };
  const indexPath = path.join(root, 'exact30-index.json');
  writeJson(indexPath, index);
  const manifest = adaptRepeatabilitySourceIndex({index, indexPath});
  assert.equal(manifest.schemaVersion, FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION);
  assert.equal(manifest.captures.length, 9);
  assert.equal(manifest.captures[0].sourceEventType, 'unified_face_capture_completed');
  assert.equal(manifest.captures[0].profile.validFrameCount, 30);
  assert.equal(manifest.rawFaceDataIncluded, false);
  assert.equal('image' in manifest.captures[0], false);
  const mismatchedIndex = structuredClone(index);
  mismatchedIndex.attempts[0].captureId = 'cap_wrong_exact30';
  assert.throws(
    () => adaptRepeatabilitySourceIndex({index: mismatchedIndex, indexPath}),
    /요청한 captureId가 없습니다|captureId가 unified 완료 이벤트와 일치/,
  );
});

test('legacy face3d_analyzed logs adapt to the same manifest shape', () => {
  const attempts = [];
  for (let subjectIndex = 0; subjectIndex < 3; subjectIndex += 1) {
    for (let repeatIndex = 0; repeatIndex < 3; repeatIndex += 1) {
      const fileName = `legacy-${subjectIndex}-${repeatIndex}.jsonl`;
      const event = {
        event: {
          type: 'face3d_analyzed',
          requestId: `legacy-request-${subjectIndex}-${repeatIndex}`,
          profile: legacyProfile(metricValues(0.2 + subjectIndex * 0.2)),
        },
      };
      fs.writeFileSync(path.join(root, fileName), `${JSON.stringify(event)}\n`, 'utf8');
      attempts.push({
        attemptId: `legacy_attempt_${subjectIndex}_${repeatIndex}`,
        subjectId: `subj_legacy_${subjectIndex + 1}`,
        sessionId: `session_legacy_${subjectIndex}_${repeatIndex}`,
        shotKind: 'neutral',
        status: 'success',
        sourcePath: fileName,
        captureId: `legacy_cap_${subjectIndex}_${repeatIndex}`,
      });
    }
  }
  const index = {
    schemaVersion: FACE3D_REPEATABILITY_SOURCE_INDEX_SCHEMA_VERSION,
    cohortRole: 'calibration',
    frameCount: 30,
    collectionPolicyId: 'legacy-face3d-v1-20of30',
    gateVersion: 'face3d-gate-v1',
    appBuild: 'com.nicewei.aura.dev@1.0.0+100',
    attempts,
  };
  const indexPath = path.join(root, 'legacy-index.json');
  writeJson(indexPath, index);
  const manifest = adaptRepeatabilitySourceIndex({index, indexPath});
  assert.equal(manifest.captures.length, 9);
  assert.equal(manifest.captures[0].sourceEventType, 'face3d_analyzed');
  assert.equal(manifest.captures[0].profile.schemaVersion, 'aura.face3d-profile.v1');
});

test('adapter rejects an exact-30 event that is not exactly 30/30', () => {
  const sourceFile = 'bad-exact30.jsonl';
  fs.writeFileSync(
    path.join(root, sourceFile),
    `${JSON.stringify({
      type: 'unified_face_capture_completed',
      captureId: 'cap_bad_exact30',
      face3d: exactProfile(30, metricValues(0.2), {validFrameCount: 29}),
    })}\n`,
    'utf8',
  );
  const index = {
    schemaVersion: FACE3D_REPEATABILITY_SOURCE_INDEX_SCHEMA_VERSION,
    cohortRole: 'calibration',
    frameCount: 30,
    collectionPolicyId: FACE3D_EXACT_POLICY_IDS[30],
    gateVersion: FACE3D_GATE_VERSION_V2,
    appBuild: 'com.nicewei.aura.dev@1.0.0+100',
    attempts: [{
      attemptId: 'attempt_bad_exact30',
      subjectId: 'subj_bad_exact30',
      sessionId: 'session_bad_exact30',
      pairId: 'pair-bad-exact30',
      shotKind: 'neutral',
      status: 'success',
      sourcePath: sourceFile,
      captureId: 'cap_bad_exact30',
    }],
  };
  assert.throws(
    () => adaptRepeatabilitySourceIndex({
      index,
      indexPath: path.join(root, 'bad-index.json'),
    }),
    /정확히 30\/30/,
  );
});

test('repeatability analyzer reads unified JSONL and embedded profiles', () => {
  const filePath = path.join(root, 'extract-unified.jsonl');
  const profile = exactProfile(30, metricValues(0.25));
  const adaptedProfile = exactProfile(30, metricValues(0.35));
  fs.writeFileSync(
    filePath,
    [
      JSON.stringify({
        event: {
          type: 'unified_face_capture_completed',
          captureId: 'cap_extract_0001',
          face3d: profile,
        },
      }),
      JSON.stringify({
        event: {
          type: 'face3d_analyzed',
          profile: adaptedProfile,
        },
        unifiedCapture: {
          captureId: 'cap_extract_0002',
          sourceEventType: 'unified_face_capture_completed',
        },
      }),
      '',
    ].join('\n'),
    'utf8',
  );
  assert.deepEqual(
    extractMetricsFromCaptureFile(filePath, {captureId: 'cap_extract_0001'}),
    extractMetricsFromProfile(profile),
  );
  assert.deepEqual(
    extractMetricsFromCaptureFile(filePath, {captureId: 'cap_extract_0002'}),
    extractMetricsFromProfile(adaptedProfile),
  );
});

test('profile binding canonicalization wraps every number and normalizes -0', () => {
  const profile = {
    schemaVersion: 'aura.face3d-profile.v3',
    count: 1,
    negativeZero: -0,
    nested: {value: 0.125},
  };
  const canonical = canonicalProfileBindingJson(profile);
  assert.ok(canonical.includes('"count":{"$face3dNumber":"1"}'));
  assert.ok(canonical.includes('"negativeZero":{"$face3dNumber":"0"}'));
  assert.ok(canonical.includes('"value":{"$face3dNumber":"0.125"}'));
});

test('profile binding hash matches the backend Python canonicalization fixture', () => {
  const profile = {
    schemaVersion: 'aura.face3d-profile.v3',
    captureNonce: 'cap_fixture_1234',
    metrics: {
      x: {
        value: 0.125,
        count: 1,
        negativeZero: -0,
      },
    },
    warning: '테스트',
  };
  assert.equal(
    computeProfileBindingSha256(profile),
    'a8a683cdb1e81c1ebbeb890f7ccd9fe7c43ea2ef0fd6719ca001c20bb3cbe6cd',
  );

  const receiptContext = {
    receiptId: 'receipt_nonce_contract_0001',
    captureNonce: 'cap_fixture_1234',
    profileBindingSha256: computeProfileBindingSha256(profile),
    collectionPolicyId: 'unified-micro-burst-5of8-v1',
    gateVersion: FACE3D_GATE_VERSION_V2,
    appBuild: 'com.nicewei.aura.dev@1.0.0+100',
    issuedAtUtc: '2026-07-17T01:05:00.000Z',
    expiresAtUtc: '2026-07-17T01:20:00.000Z',
    subjectContextId: 'subj_user_11111111-1111-4111-8111-111111111111',
    reportContextId:
      'report_photo_capture_22222222-2222-4222-8222-222222222222',
    approvalArtifactSha256: 'a'.repeat(64),
  };
  const productionNonceReceipt = buildUnsignedCalibrationReceipt({
    ...receiptContext,
    captureNonce: 'unified-face-mock-abc123',
  });
  assert.equal(
    productionNonceReceipt.captureNonce,
    'unified-face-mock-abc123',
  );
  const labNonceReceipt = buildUnsignedCalibrationReceipt({
    ...receiptContext,
    captureNonce: 'face-capture-lab-exact30-1-123456',
  });
  assert.equal(
    labNonceReceipt.captureNonce,
    'face-capture-lab-exact30-1-123456',
  );
});

test('profile binding excludes only receipt status fields and changes on metric mutation', () => {
  const profile = exactProfile(8, metricValues(0.3));
  const baseline = computeProfileBindingSha256(profile);
  const withReceiptFields = {
    ...profile,
    calibrationReceipt: {signatureHex: 'ignored'},
    profileBindingSha256: 'ignored',
    serverCalibrationReceiptStatus: 'ignored',
  };
  assert.equal(computeProfileBindingSha256(withReceiptFields), baseline);
  const mutated = structuredClone(profile);
  mutated.metrics.noseTipProjection.value += 0.01;
  assert.notEqual(computeProfileBindingSha256(mutated), baseline);
});

test('Gate 6B dry-run validates six manifests and selects the smallest passing 5-frame candidate', () => {
  const fixtureRoot = path.join(root, 'promotion-pass');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath} = createPromotionFixture(fixtureRoot);
  const result = evaluateFace3DCalibrationPromotion({manifest, manifestPath});
  assert.equal(result.gate6B.selectedFrameCount, 5);
  assert.equal(result.status, 'evidence_validated_unsigned_not_promoted');
  assert.equal(result.unsignedReceipt.signature, null);
  assert.equal(result.unsignedReceipt.signingKeyId, null);
  assert.deepEqual(
    Object.keys(result.unsignedReceipt).sort(),
    [
      'appBuild',
      'approvalArtifactSha256',
      'captureNonce',
      'collectionPolicyId',
      'expiresAtUtc',
      'gateVersion',
      'issuedAtUtc',
      'profileBindingSha256',
      'receiptId',
      'reportContextId',
      'signature',
      'signatureAlgorithm',
      'signingKeyId',
      'subjectContextId',
    ].sort(),
  );
  assert.equal(result.confidenceCalibrationRegistryPreview.status, 'pending');
  assert.equal(result.confidenceCalibrationRegistryPreview.receiptSha256, null);
  assert.equal(result.safeguards.actualSigningPerformed, false);
  assert.equal(result.safeguards.liveGateStatusMutated, false);
  assert.equal(result.safeguards.productPromotionPerformed, false);
});

test('promotion rejects a product profile without TrueDepth sensor provenance', () => {
  const fixtureRoot = path.join(root, 'promotion-missing-product-provenance');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath} = createPromotionFixture(fixtureRoot);
  const profileEnvelopePath = path.join(fixtureRoot, manifest.profileEnvelope);
  const profileEnvelope = JSON.parse(fs.readFileSync(profileEnvelopePath, 'utf8'));
  delete profileEnvelope.profile.sensorProvenance;
  writeJson(profileEnvelopePath, profileEnvelope);
  assert.throws(
    () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
    /sensorProvenance/,
  );
});

test('promotion rejects metric frame counts above the product profile valid frame count', () => {
  const fixtureRoot = path.join(root, 'promotion-metric-frame-mismatch');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath} = createPromotionFixture(fixtureRoot);
  const profileEnvelopePath = path.join(fixtureRoot, manifest.profileEnvelope);
  const profileEnvelope = JSON.parse(fs.readFileSync(profileEnvelopePath, 'utf8'));
  profileEnvelope.profile.metrics.noseTipProjection.validFrameCount = 8;
  writeJson(profileEnvelopePath, profileEnvelope);
  assert.throws(
    () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
    /validFrameCount.*초과/,
  );
});

test('promotion fails closed when one required repeatability manifest is missing', () => {
  const fixtureRoot = path.join(root, 'promotion-missing');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath} = createPromotionFixture(fixtureRoot);
  manifest.evidence.repeatability12 = 'missing-repeatability-12.json';
  assert.throws(
    () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
    /파일이 없습니다/,
  );
});

test('promotion rejects validation subjects that overlap calibration subjects', () => {
  const fixtureRoot = path.join(root, 'promotion-overlap');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath, validationPath} = createPromotionFixture(fixtureRoot);
  const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
  validation.pairs[0].subjectId = 'subj_cal_1';
  writeJson(validationPath, validation);
  assert.throws(
    () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
    /calibration cohort와 겹칩니다/,
  );
});

test('promotion rejects a requested frame count outside the product policy binding', () => {
  const fixtureRoot = path.join(root, 'promotion-not-smallest');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath} = createPromotionFixture(fixtureRoot);
  manifest.requestedFrameCount = 8;
  assert.throws(
    () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
    /Gate 선택 frame binding/,
  );
});

test('promotion rejects selected 8 with the immutable 5-of-8 product policy', () => {
  const fixtureRoot = path.join(root, 'promotion-selected8-policy5of8');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath} = createPromotionFixture(fixtureRoot);
  manifest.requestedFrameCount = 8;
  const approvalPath = path.join(fixtureRoot, manifest.evidence.approvalArtifact);
  const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
  approval.selectedFrameCount = 8;
  writeJson(approvalPath, approval);
  assert.throws(
    () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
    /Gate 선택 frame binding/,
  );
});

test('Gate 6B enforces paired p95 bias, failure-rate delta, and 500ms p95 window', () => {
  for (const [caseName, mutateValidation, expectedError] of [
    [
      'p95-bias',
      validation => {
        for (const pair of validation.pairs) {
          for (const key of FACE3D_METRIC_KEYS) {
            pair.profiles['5'].profile.metrics[key].value += 0.06;
          }
        }
      },
      /가장 작은 통과 후보는 8프레임/,
    ],
    [
      'failure-rate',
      validation => {
        validation.attemptsByFrameCount['5'] = {
          total: 64,
          succeeded: 60,
          failed: 4,
          failureRate: 4 / 64,
        };
      },
      /가장 작은 통과 후보는 8프레임/,
    ],
    [
      'capture-window',
      validation => {
        for (const pair of validation.pairs) {
          for (const key of FACE3D_METRIC_KEYS) {
            pair.profiles['5'].profile.metrics[key].value += 0.06;
            pair.profiles['8'].profile.metrics[key].value += 0.06;
          }
          pair.profiles['12'].profile.captureWindowMs = 600;
        }
      },
      /Gate 6B를 통과한 5\/8\/12 후보가 없습니다/,
    ],
  ]) {
    const fixtureRoot = path.join(root, `promotion-${caseName}`);
    fs.mkdirSync(fixtureRoot);
    const {manifest, manifestPath, validationPath} = createPromotionFixture(fixtureRoot);
    const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
    mutateValidation(validation);
    writeJson(validationPath, validation);
    assert.throws(
      () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
      expectedError,
      caseName,
    );
  }
});

test('promotion rejects a calibration model that still treats coverage as quality', () => {
  const fixtureRoot = path.join(root, 'promotion-bad-model');
  fs.mkdirSync(fixtureRoot);
  const {manifest, manifestPath, model} = createPromotionFixture(fixtureRoot);
  writeJson(path.join(fixtureRoot, manifest.evidence.calibrationModel), {
    ...model,
    coverageTreatment: 'target_coverage_is_quality',
  });
  assert.throws(
    () => evaluateFace3DCalibrationPromotion({manifest, manifestPath}),
    /coverage를 quality로 재사용/,
  );
});

test('receipt binding fails closed without expiry and pseudonymous contexts', () => {
  assert.throws(
    () => buildUnsignedCalibrationReceipt({
      receiptId: 'receipt_fixture_0002',
      captureNonce: 'cap_fixture_0002',
      profileBindingSha256: 'a'.repeat(64),
      collectionPolicyId: 'unified-micro-burst-5of8-v1',
      gateVersion: FACE3D_GATE_VERSION_V2,
      appBuild: 'com.nicewei.aura.dev@1.0.0+100',
      issuedAtUtc: '2026-07-17T01:00:00.000Z',
      expiresAtUtc: '2026-07-17T00:59:00.000Z',
      subjectContextId: 'Alice Example',
      reportContextId:
        'report_source_media_33333333-3333-4333-8333-333333333333',
      approvalArtifactSha256: 'b'.repeat(64),
    }),
    /subjectContextId|expiresAtUtc/,
  );
});

test('collection dry-run fixes Phase 1 ten-shot order before explicit exact-30 repeats', () => {
  const plan = buildFaceMeasurementCollectionPlan({
    cohortId: 'cohort_fixture_1001',
    subjectContextId: 'subj_fixture_1001',
    sessionId: 'session_fixture_1001',
    exact30Repeats: 3,
    rawLandmarkDirectory: path.join(root, 'raw-landmarks'),
    evidenceDirectory: path.join(root, 'repeatability-evidence'),
    retentionDays: 7,
    now: new Date('2026-07-17T02:00:00.000Z'),
  });
  assert.equal(plan.schemaVersion, FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION);
  assert.equal(plan.executionMode, 'dry_run_only');
  assert.equal(plan.cohortId, 'cohort_fixture_1001');
  assert.equal(plan.phase1.shotCount, 10);
  assert.equal(plan.sequence.length, 13);
  assert.ok(plan.sequence.slice(0, 10).every(shot => shot.phase === 'phase1_pose_distance'));
  const replayValidations = plan.phase1.shots.map(
    shot => shot.phase1ReplayValidation,
  );
  assert.equal(new Set(replayValidations.map(value => value.captureId)).size, 10);
  assert.ok(
    replayValidations.every(
      value =>
        /^cap_/.test(value.captureId)
        && value.cohortId === 'cohort_fixture_1001'
        && value.sessionId === 'session_fixture_1001'
        && value.subjectId === 'subj_fixture_1001'
        && value.retentionDays === 7,
    ),
  );
  const references = replayValidations.filter(
    value => value.condition.isReference,
  );
  assert.equal(references.length, 2);
  assert.deepEqual(
    references.map(value => ({
      repeatGroup: value.condition.repeatGroup,
      repeatIndex: value.condition.repeatIndex,
    })),
    [
      {repeatGroup: 'frontal-standard', repeatIndex: 1},
      {repeatGroup: 'frontal-standard', repeatIndex: 2},
    ],
  );
  assert.equal(
    plan.phase1.replayArtifactWriteContract.captureTimestampField,
    'capturedAtUtc',
  );
  assert.equal(
    plan.phase1.replayArtifactWriteContract.captureTimestampSource,
    'runtime_at_capture',
  );
  assert.ok(
    plan.sequence.slice(10).every(
      shot =>
        shot.phase === 'phase2_exact30_baseline'
        && shot.collectionPolicyId === 'diagnostics-exact-30-v1'
        && shot.requiredValidFrameCount === 30
        && shot.requiredTargetFrameCount === 30,
    ),
  );
  assert.equal(plan.privacy.rawLandmarks.localOnly, true);
  assert.equal(plan.privacy.rawLandmarks.uploadAllowed, false);
  assert.equal(
    plan.privacy.rawLandmarks.createdAtUtc,
    '2026-07-17T02:00:00.000Z',
  );
  assert.equal(
    plan.privacy.rawLandmarks.deleteByUtc,
    '2026-07-24T02:00:00.000Z',
  );
  assert.equal(plan.privacy.repeatabilityEvidence.rawFaceDataIncluded, false);
  assert.equal(plan.deviceActionsExecuted, false);
});

test('collection dry-run rejects direct identifiers and overlapping raw/evidence paths', () => {
  assert.throws(
    () => buildFaceMeasurementCollectionPlan({
      cohortId: 'Team A',
      subjectContextId: 'subj_fixture_2001',
      sessionId: 'session_fixture_2001',
      exact30Repeats: 3,
      rawLandmarkDirectory: path.join(root, 'invalid-cohort-raw'),
      evidenceDirectory: path.join(root, 'invalid-cohort-evidence'),
      retentionDays: 7,
    }),
    /cohortId.*가명 ASCII ID/,
  );
  assert.throws(
    () => buildFaceMeasurementCollectionPlan({
      cohortId: 'cohort_fixture_2001',
      subjectContextId: 'Alice Example',
      sessionId: 'session_fixture_2001',
      exact30Repeats: 3,
      rawLandmarkDirectory: path.join(root, 'same'),
      evidenceDirectory: path.join(root, 'same', 'evidence'),
      retentionDays: 7,
    }),
    /가명 ASCII ID/,
  );
  assert.throws(
    () => buildFaceMeasurementCollectionPlan({
      cohortId: 'cohort_fixture_2001',
      subjectContextId:
        'subj_user_11111111-1111-4111-8111-111111111111',
      sessionId: 'session_fixture_2001',
      exact30Repeats: 3,
      rawLandmarkDirectory: path.join(root, 'raw-product-context'),
      evidenceDirectory: path.join(root, 'evidence-product-context'),
      retentionDays: 7,
    }),
    /제품 user UUID 문맥/,
  );
  assert.throws(
    () => buildFaceMeasurementCollectionPlan({
      cohortId: 'cohort_fixture_2001',
      subjectContextId: 'subj_fixture_2001',
      sessionId: 'session_fixture_2001',
      exact30Repeats: 3,
      rawLandmarkDirectory: path.join(root, 'same'),
      evidenceDirectory: path.join(root, 'same', 'evidence'),
      retentionDays: 7,
    }),
    /중첩되면 안 됩니다/,
  );
});

console.log(`\nFace3D calibration tooling: ${passed} tests passed.`);
