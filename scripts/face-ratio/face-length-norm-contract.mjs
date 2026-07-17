import crypto from 'node:crypto';


export const FACE_LENGTH_NORM_INPUT_SCHEMA_VERSION =
  'aura.face-length-norm-estimator-input.v1';
export const FACE_LENGTH_NORM_CANDIDATE_SCHEMA_VERSION =
  'aura.face-length-norm-candidate.v1';
export const FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION =
  'aura.face-length-norm-approval.v1';
export const FACE_LENGTH_NORM_EVIDENCE_ATTESTATION_SCHEMA_VERSION =
  'aura.face-length-norm-evidence-attestation.v1';

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;
const LOCALE_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;
const PROHIBITED_FACE_DATA_KEY =
  /(?:^|_)(?:image|photo|landmark|landmarks|keypoint|keypoints|mesh|vertex|vertices|raw_frame|raw_face)(?:$|_)/;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function snakeCaseKey(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function assertNoRawFaceData(value, location = 'manifest') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawFaceData(item, `${location}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = snakeCaseKey(key);
    if (normalized === 'raw_face_data_included' && item === false) {
      continue;
    }
    requireCondition(
      !PROHIBITED_FACE_DATA_KEY.test(normalized),
      `${location}.${key} contains prohibited raw face, image, or landmark data.`,
    );
    assertNoRawFaceData(item, `${location}.${key}`);
  }
}

function assertExactKeys(record, allowed, location) {
  const unknown = Object.keys(record).filter(key => !allowed.has(key));
  requireCondition(
    unknown.length === 0,
    `${location} contains unsupported keys: ${unknown.join(', ')}`,
  );
}

function requireSafeId(value, location) {
  requireCondition(
    typeof value === 'string' && SAFE_ID.test(value),
    `${location} must be a safe pseudonymous identifier.`,
  );
}

function requireUtc(value, location) {
  requireCondition(
    typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value)),
    `${location} must be a UTC ISO-8601 timestamp.`,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }
  if (typeof value === 'number') {
    requireCondition(Number.isFinite(value), 'Canonical JSON cannot contain non-finite numbers.');
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Canonical(value) {
  return sha256Text(canonicalJson(value));
}

export function validateEstimatorInput(manifest) {
  requireCondition(isRecord(manifest), 'Estimator input must be a JSON object.');
  assertNoRawFaceData(manifest);
  assertExactKeys(
    manifest,
    new Set([
      'schemaVersion',
      'locale',
      'localeSelectionSource',
      'measurementContractId',
      'rawFaceDataIncluded',
      'collectionProtocol',
      'evidenceAttestation',
      'samples',
    ]),
    'manifest',
  );
  requireCondition(
    manifest.schemaVersion === FACE_LENGTH_NORM_INPUT_SCHEMA_VERSION,
    'Estimator input schemaVersion is invalid.',
  );
  requireCondition(
    typeof manifest.locale === 'string' && LOCALE_CODE.test(manifest.locale),
    'locale must be an explicit safe locale code.',
  );
  requireCondition(
    manifest.localeSelectionSource === 'self_selected',
    'localeSelectionSource must be self_selected.',
  );
  requireSafeId(manifest.measurementContractId, 'measurementContractId');
  requireCondition(
    manifest.rawFaceDataIncluded === false,
    'rawFaceDataIncluded must be exactly false.',
  );
  requireCondition(isRecord(manifest.collectionProtocol), 'collectionProtocol is required.');
  assertExactKeys(
    manifest.collectionProtocol,
    new Set(['protocolId', 'appBuild', 'codeCommitSha', 'measurementDefinition']),
    'collectionProtocol',
  );
  requireSafeId(manifest.collectionProtocol.protocolId, 'collectionProtocol.protocolId');
  requireSafeId(manifest.collectionProtocol.appBuild, 'collectionProtocol.appBuild');
  requireCondition(
    typeof manifest.collectionProtocol.codeCommitSha === 'string'
      && HEX_40.test(manifest.collectionProtocol.codeCommitSha),
    'collectionProtocol.codeCommitSha must be a 40-character lowercase git SHA.',
  );
  requireCondition(
    typeof manifest.collectionProtocol.measurementDefinition === 'string'
      && manifest.collectionProtocol.measurementDefinition.trim().length >= 8
      && manifest.collectionProtocol.measurementDefinition.length <= 240,
    'collectionProtocol.measurementDefinition is required.',
  );
  requireCondition(
    isRecord(manifest.evidenceAttestation),
    'evidenceAttestation is required; product history is never estimator evidence.',
  );
  assertExactKeys(
    manifest.evidenceAttestation,
    new Set([
      'schemaVersion',
      'decision',
      'sourceKind',
      'productHistoryIncluded',
      'collectionEvidenceArtifactSha256',
      'reviewer',
      'reviewedAtUtc',
    ]),
    'evidenceAttestation',
  );
  requireCondition(
    manifest.evidenceAttestation.schemaVersion
      === FACE_LENGTH_NORM_EVIDENCE_ATTESTATION_SCHEMA_VERSION
      && manifest.evidenceAttestation.decision === 'approved'
      && manifest.evidenceAttestation.sourceKind === 'controlled_offline_collection'
      && manifest.evidenceAttestation.productHistoryIncluded === false,
    'Estimator evidence must be an approved controlled offline collection with product history excluded.',
  );
  requireCondition(
    typeof manifest.evidenceAttestation.collectionEvidenceArtifactSha256 === 'string'
      && HEX_64.test(manifest.evidenceAttestation.collectionEvidenceArtifactSha256),
    'evidenceAttestation.collectionEvidenceArtifactSha256 must be a lowercase SHA-256.',
  );
  requireSafeId(manifest.evidenceAttestation.reviewer, 'evidenceAttestation.reviewer');
  requireUtc(manifest.evidenceAttestation.reviewedAtUtc, 'evidenceAttestation.reviewedAtUtc');
  requireCondition(
    Array.isArray(manifest.samples) && manifest.samples.length >= 2,
    'At least two subject-level samples are required to calculate sample SD.',
  );

  const subjectIds = new Set();
  const captureIds = new Set();
  for (const [index, sample] of manifest.samples.entries()) {
    const location = `samples[${index}]`;
    requireCondition(isRecord(sample), `${location} must be an object.`);
    assertExactKeys(
      sample,
      new Set([
        'subjectId',
        'captureId',
        'selfSelectedLocale',
        'localeSelectionSource',
        'faceLengthRatio',
        'sourceArtifactSha256',
        'capturedAtUtc',
      ]),
      location,
    );
    requireSafeId(sample.subjectId, `${location}.subjectId`);
    requireCondition(
      sample.subjectId.startsWith('subj_') && !sample.subjectId.startsWith('subj_user_'),
      `${location}.subjectId must be a local pseudonym and never a product user id.`,
    );
    requireSafeId(sample.captureId, `${location}.captureId`);
    requireCondition(
      sample.captureId.startsWith('capture_'),
      `${location}.captureId must be a local capture pseudonym.`,
    );
    requireCondition(!subjectIds.has(sample.subjectId), 'Each subject may contribute one sample only.');
    requireCondition(!captureIds.has(sample.captureId), 'captureId values must be unique.');
    subjectIds.add(sample.subjectId);
    captureIds.add(sample.captureId);
    requireCondition(
      sample.selfSelectedLocale === manifest.locale
        && sample.localeSelectionSource === 'self_selected',
      `${location} locale must match the self-selected manifest locale.`,
    );
    requireCondition(
      typeof sample.faceLengthRatio === 'number'
        && Number.isFinite(sample.faceLengthRatio)
        && sample.faceLengthRatio > 0,
      `${location}.faceLengthRatio must be finite and positive.`,
    );
    requireCondition(
      typeof sample.sourceArtifactSha256 === 'string'
        && HEX_64.test(sample.sourceArtifactSha256),
      `${location}.sourceArtifactSha256 must be a lowercase SHA-256.`,
    );
    requireUtc(sample.capturedAtUtc, `${location}.capturedAtUtc`);
  }
  return manifest;
}

export function calculateSampleStatistics(values) {
  requireCondition(Array.isArray(values) && values.length >= 2, 'Sample SD requires n >= 2.');
  requireCondition(
    values.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0),
    'Statistics input must contain finite positive numbers only.',
  );
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredError = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return {
    mean,
    sampleStandardDeviation: Math.sqrt(squaredError / (values.length - 1)),
  };
}

export function buildNormCandidate(manifest, {estimatorSourceSha256}) {
  validateEstimatorInput(manifest);
  requireCondition(
    typeof estimatorSourceSha256 === 'string' && HEX_64.test(estimatorSourceSha256),
    'estimatorSourceSha256 must be a lowercase SHA-256.',
  );
  const statistics = calculateSampleStatistics(
    manifest.samples.map(sample => sample.faceLengthRatio),
  );
  return {
    schemaVersion: FACE_LENGTH_NORM_CANDIDATE_SCHEMA_VERSION,
    status: 'candidate_flag_off',
    activationEligible: false,
    featureFlagDefault: 'off',
    rawFaceDataIncluded: false,
    evidenceProvenance: 'approved_attested_collection',
    productHistoryIncluded: false,
    evidenceAttestationSha256: sha256Canonical(manifest.evidenceAttestation),
    locale: manifest.locale,
    localeSelectionSource: 'self_selected',
    measurementContractId: manifest.measurementContractId,
    datasetManifestSha256: sha256Canonical(manifest),
    estimatorSourceSha256,
    subjectCount: manifest.samples.length,
    captureCount: manifest.samples.length,
    statisticsUnit: 'one_subject_one_sample',
    mean: statistics.mean,
    sampleStandardDeviation: statistics.sampleStandardDeviation,
  };
}

export function validateCandidate(candidate, manifest, {estimatorSourceSha256}) {
  const expected = buildNormCandidate(manifest, {estimatorSourceSha256});
  requireCondition(isRecord(candidate), 'Candidate must be a JSON object.');
  assertNoRawFaceData(candidate, 'candidate');
  assertExactKeys(candidate, new Set(Object.keys(expected)), 'candidate');
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = candidate[key];
    if (typeof expectedValue === 'number') {
      requireCondition(
        typeof actual === 'number'
          && Number.isFinite(actual)
          && Math.abs(actual - expectedValue) <= 1e-12,
        `candidate.${key} does not match recomputed evidence.`,
      );
    } else {
      requireCondition(actual === expectedValue, `candidate.${key} does not match evidence.`);
    }
  }
  requireCondition(
    candidate.activationEligible === false
      && candidate.featureFlagDefault === 'off'
      && candidate.status === 'candidate_flag_off',
    'Candidate must remain non-activating and flag-off.',
  );
  return expected;
}

export function validateApproval(approval, candidate, {modelArtifactSha256}) {
  requireCondition(isRecord(approval), 'Approval must be a JSON object.');
  assertNoRawFaceData(approval, 'approval');
  assertExactKeys(
    approval,
    new Set([
      'schemaVersion',
      'decision',
      'locale',
      'localeSelectionSource',
      'measurementContractId',
      'modelArtifactSha256',
      'datasetManifestSha256',
      'estimatorSourceSha256',
      'evidenceAttestationSha256',
      'reviewer',
      'reviewedAtUtc',
    ]),
    'approval',
  );
  requireCondition(
    approval.schemaVersion === FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION
      && approval.decision === 'approved',
    'Approval schema or decision is invalid.',
  );
  requireCondition(
    typeof modelArtifactSha256 === 'string' && HEX_64.test(modelArtifactSha256),
    'modelArtifactSha256 must be a lowercase SHA-256.',
  );
  requireCondition(
    approval.modelArtifactSha256 === modelArtifactSha256
      && approval.datasetManifestSha256 === candidate.datasetManifestSha256
      && approval.estimatorSourceSha256 === candidate.estimatorSourceSha256
      && approval.evidenceAttestationSha256 === candidate.evidenceAttestationSha256
      && approval.locale === candidate.locale
      && approval.localeSelectionSource === 'self_selected'
      && approval.measurementContractId === candidate.measurementContractId,
    'Approval does not bind the candidate provenance and scope.',
  );
  requireSafeId(approval.reviewer, 'approval.reviewer');
  requireUtc(approval.reviewedAtUtc, 'approval.reviewedAtUtc');
  return approval;
}
