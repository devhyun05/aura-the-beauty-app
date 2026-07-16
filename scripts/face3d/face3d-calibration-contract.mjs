import crypto from 'node:crypto';

export const FACE3D_CALIBRATION_RECEIPT_SCHEMA_VERSION =
  'aura.face3d-confidence-calibration-receipt.v1';
export const FACE3D_CALIBRATION_SIGNATURE_ALGORITHM = 'hmac-sha256-v1';
export const FACE3D_PROFILE_SCHEMA_V2 = 'aura.face3d-profile.v2';
export const FACE3D_GATE_VERSION_V2 = 'face3d-gate-v2';
export const FACE3D_REPEATABILITY_MANIFEST_SCHEMA_VERSION =
  'aura.face3d-repeatability-manifest.v2';
export const FACE3D_VALIDATION_COHORT_SCHEMA_VERSION =
  'aura.face3d-calibration-validation-cohort.v1';

export const FACE3D_CALIBRATION_FRAME_COUNTS = Object.freeze([1, 3, 5, 8, 12, 30]);
export const FACE3D_PROMOTION_CANDIDATE_FRAME_COUNTS = Object.freeze([5, 8, 12]);
export const FACE3D_EXACT_POLICY_IDS = Object.freeze({
  1: 'diagnostics-exact-1-v1',
  3: 'diagnostics-exact-3-v1',
  5: 'diagnostics-exact-5-v1',
  8: 'diagnostics-exact-8-v1',
  12: 'diagnostics-exact-12-v1',
  30: 'diagnostics-exact-30-v1',
});
const FACE3D_EXACT_POLICY_MAXIMUM_DURATION_MS = Object.freeze({
  1: 500,
  3: 500,
  5: 500,
  8: 500,
  12: 750,
  30: 3000,
});
export const FACE3D_PRODUCT_POLICY_TUPLES = Object.freeze({
  'unified-micro-burst-5of8-v1': Object.freeze({
    aggregation: 'median_mad',
    gateVersion: FACE3D_GATE_VERSION_V2,
    gateSelectedFrameCount: 5,
    maximumCaptureWindowMs: 500,
    minimumValidFrames: 5,
    sampleMode: 'micro_burst',
    targetFrameCount: 8,
  }),
});
const FACE3D_REQUIRED_METRIC_KEYS = Object.freeze([
  'centralProjectionScore',
  'chinProjection',
  'lowerLipToELine',
  'noseTipProjection',
  'upperLipToELine',
]);

const PROFILE_BINDING_EXCLUDED_FIELDS = new Set([
  'calibrationReceipt',
  'profileBindingSha256',
  'serverCalibrationReceiptStatus',
]);
const RAW_FACE_DATA_KEYS = new Set([
  'image',
  'imageBytes',
  'imageUri',
  'landmark',
  'landmarks',
  'localVertices',
  'pixelBuffer',
  'projectedVertices',
  'rawFaceData',
  'rawLandmarks',
  'vertices',
]);

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateFace3DSensorProvenance(provenance, label = 'sensorProvenance') {
  requireCondition(isRecord(provenance), `${label}가 없습니다.`);
  requireCondition(
    provenance.trueDepthHardware === true,
    `${label}.trueDepthHardware는 true여야 합니다.`,
  );
  requireCondition(
    provenance.faceTrackingSupported === true,
    `${label}.faceTrackingSupported는 true여야 합니다.`,
  );
  requireCondition(
    typeof provenance.depthDataObservedRatio === 'number'
      && Number.isFinite(provenance.depthDataObservedRatio)
      && provenance.depthDataObservedRatio > 0
      && provenance.depthDataObservedRatio <= 1,
    `${label}.depthDataObservedRatio는 0 초과 1 이하의 finite number여야 합니다.`,
  );
  requireCondition(
    typeof provenance.deviceModel === 'string'
      && provenance.deviceModel.trim().length > 0,
    `${label}.deviceModel이 없습니다.`,
  );
}

export function assertNoRawFaceData(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRawFaceData(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    requireCondition(
      !RAW_FACE_DATA_KEYS.has(key),
      `${path}.${key}: raw face/image data는 calibration evidence에 포함할 수 없습니다.`,
    );
    assertNoRawFaceData(entry, `${path}.${key}`);
  }
}

function normalizeCanonicalValue(value, path = '$') {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    requireCondition(Number.isFinite(value), `${path}: canonical JSON은 finite number만 허용합니다.`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeCanonicalValue(entry, `${path}[${index}]`));
  }
  requireCondition(isRecord(value), `${path}: canonical JSON으로 직렬화할 수 없는 값입니다.`);
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    requireCondition(value[key] !== undefined, `${path}.${key}: undefined는 허용하지 않습니다.`);
    normalized[key] = normalizeCanonicalValue(value[key], `${path}.${key}`);
  }
  return normalized;
}

/**
 * Python json.dumps(value, ensure_ascii=False, sort_keys=True,
 * separators=(",", ":"))와 맞추기 위한 UTF-8 compact canonical JSON.
 */
export function canonicalJson(value) {
  return JSON.stringify(normalizeCanonicalValue(value));
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Canonical(value) {
  return sha256Text(canonicalJson(value));
}

export function buildProfileBindingPayload(profile) {
  requireCondition(isRecord(profile), 'profile binding 대상은 JSON object여야 합니다.');
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => !PROFILE_BINDING_EXCLUDED_FIELDS.has(key)),
  );
}

function fixed12Trimmed(value) {
  requireCondition(Number.isFinite(value), 'profile binding number는 finite여야 합니다.');
  if (Object.is(value, -0) || value === 0) {
    return '0';
  }
  requireCondition(
    Math.abs(value) < 1e21,
    'profile binding number는 fixed12 canonical 범위(|n| < 1e21)여야 합니다.',
  );
  const fixed = value.toFixed(12);
  const trimmed = fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

function normalizeProfileBindingNumbers(value) {
  if (typeof value === 'number') {
    return {$face3dNumber: fixed12Trimmed(value)};
  }
  if (Array.isArray(value)) {
    return value.map(normalizeProfileBindingNumbers);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeProfileBindingNumbers(entry),
      ]),
    );
  }
  return value;
}

export function canonicalProfileBindingJson(profile) {
  return canonicalJson(
    normalizeProfileBindingNumbers(buildProfileBindingPayload(profile)),
  );
}

export function computeProfileBindingSha256(profile) {
  return sha256Text(canonicalProfileBindingJson(profile));
}

function requireAsciiToken(value, label, prefix = null) {
  requireCondition(
    typeof value === 'string'
      && value.length >= 8
      && value.length <= 128
      && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value),
    `${label}는 8~128자의 ASCII 가명 token이어야 합니다.`,
  );
  if (prefix) {
    requireCondition(value.startsWith(prefix), `${label}는 ${prefix} prefix여야 합니다.`);
  }
}

function requireAsciiBuild(value) {
  requireCondition(
    typeof value === 'string'
      && value.length >= 3
      && value.length <= 128
      && /^[\x21-\x7e]+$/.test(value),
    'appBuild는 공백 없는 3~128자 ASCII build 식별자여야 합니다.',
  );
}

const CANONICAL_UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SUBJECT_CONTEXT_PATTERN = new RegExp(`^subj_user_${CANONICAL_UUID_PATTERN}$`);
const REPORT_CONTEXT_PATTERN = new RegExp(
  `^report_(?:photo_capture|source_media)_${CANONICAL_UUID_PATTERN}$`,
);

function requireProductContextId(value, label, pattern) {
  requireCondition(
    typeof value === 'string' && pattern.test(value),
    `${label} product binding 포맷이 잘못됐습니다.`,
  );
}

function requireSha256(value, label) {
  requireCondition(
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    `${label}는 lowercase SHA-256 hex여야 합니다.`,
  );
}

function requireUtcTimestamp(value, label) {
  requireCondition(
    typeof value === 'string'
      && value.endsWith('Z')
      && Number.isFinite(Date.parse(value)),
    `${label}는 UTC ISO-8601 시각이어야 합니다.`,
  );
}

export function validateReceiptBindingContext(context) {
  requireCondition(isRecord(context), 'receipt binding context가 없습니다.');
  requireAsciiToken(context.receiptId, 'receiptId', 'receipt_');
  // Unity binds captureNonce to the real unified requestId. Production and lab
  // IDs use unified-face-* / face-capture-lab-*; prepared local artifacts may
  // still use cap_*. Uniqueness and signed binding matter, not one prefix.
  requireAsciiToken(context.captureNonce, 'captureNonce');
  requireProductContextId(
    context.subjectContextId,
    'subjectContextId',
    SUBJECT_CONTEXT_PATTERN,
  );
  requireProductContextId(
    context.reportContextId,
    'reportContextId',
    REPORT_CONTEXT_PATTERN,
  );
  requireAsciiBuild(context.appBuild);
  requireSha256(context.profileBindingSha256, 'profileBindingSha256');
  requireSha256(context.approvalArtifactSha256, 'approvalArtifactSha256');
  requireCondition(
    typeof context.collectionPolicyId === 'string'
      && context.collectionPolicyId.trim().length > 0,
    'collectionPolicyId가 없습니다.',
  );
  requireCondition(
    typeof context.gateVersion === 'string' && context.gateVersion.trim().length > 0,
    'gateVersion이 없습니다.',
  );
  requireUtcTimestamp(context.issuedAtUtc, 'issuedAtUtc');
  requireUtcTimestamp(context.expiresAtUtc, 'expiresAtUtc');
  requireCondition(
    Date.parse(context.expiresAtUtc) > Date.parse(context.issuedAtUtc),
    'expiresAtUtc는 issuedAtUtc 이후여야 합니다.',
  );
}

/**
 * Backend HMAC 계약의 정확한 서명 입력. 필드 추가/생략을 허용하지 않는다.
 * 이 모듈은 HMAC key를 받거나 실제 서명을 만들지 않는다.
 */
export function buildReceiptSigningPayload(context) {
  validateReceiptBindingContext(context);
  return {
    receiptId: context.receiptId,
    captureNonce: context.captureNonce,
    profileBindingSha256: context.profileBindingSha256,
    collectionPolicyId: context.collectionPolicyId,
    gateVersion: context.gateVersion,
    appBuild: context.appBuild,
    issuedAtUtc: context.issuedAtUtc,
    expiresAtUtc: context.expiresAtUtc,
    subjectContextId: context.subjectContextId,
    reportContextId: context.reportContextId,
    approvalArtifactSha256: context.approvalArtifactSha256,
  };
}

export function buildUnsignedCalibrationReceipt(context) {
  const payload = buildReceiptSigningPayload(context);
  return {
    ...payload,
    signatureAlgorithm: FACE3D_CALIBRATION_SIGNATURE_ALGORITHM,
    signingKeyId: null,
    signature: null,
  };
}

export function percentileNearestRank(values, percentile) {
  requireCondition(
    Array.isArray(values) && values.length > 0,
    'percentile 계산에는 하나 이상의 값이 필요합니다.',
  );
  requireCondition(
    Number.isFinite(percentile) && percentile > 0 && percentile <= 1,
    'percentile은 0 초과 1 이하여야 합니다.',
  );
  const sorted = values
    .filter(value => Number.isFinite(value))
    .slice()
    .sort((left, right) => left - right);
  requireCondition(sorted.length === values.length, 'percentile 입력에 non-finite 값이 있습니다.');
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

export function validateExactDiagnosticProfile(profile, frameCount) {
  requireCondition(
    FACE3D_CALIBRATION_FRAME_COUNTS.includes(frameCount),
    `지원하지 않는 frameCount입니다: ${frameCount}`,
  );
  requireCondition(isRecord(profile), `${frameCount}프레임 profile이 없습니다.`);
  assertNoRawFaceData(profile);
  requireCondition(
    profile.schemaVersion === FACE3D_PROFILE_SCHEMA_V2,
    `${frameCount}프레임 profile schemaVersion이 v2가 아닙니다.`,
  );
  requireCondition(
    profile.collectionPolicyId === FACE3D_EXACT_POLICY_IDS[frameCount],
    `${frameCount}프레임 collectionPolicyId가 exact diagnostics 정책과 다릅니다.`,
  );
  requireCondition(
    profile.gateVersion === FACE3D_GATE_VERSION_V2,
    `${frameCount}프레임 gateVersion이 잘못됐습니다.`,
  );
  requireCondition(
    profile.validFrameCount === frameCount && profile.targetFrameCount === frameCount,
    `${frameCount}프레임 evidence는 valid/target이 정확히 ${frameCount}/${frameCount}여야 합니다.`,
  );
  requireCondition(
    profile.completionRatio === 1,
    `${frameCount}프레임 exact evidence completionRatio는 1이어야 합니다.`,
  );
  requireCondition(
    profile.sampleMode === (frameCount === 1 ? 'single_frame' : 'micro_burst')
      && profile.aggregation === (frameCount === 1 ? 'none' : 'median_mad'),
    `${frameCount}프레임 sampleMode/aggregation이 immutable exact policy와 다릅니다.`,
  );
  requireCondition(
    Number.isFinite(profile.captureWindowMs)
      && profile.captureWindowMs >= 0
      && profile.captureWindowMs <= FACE3D_EXACT_POLICY_MAXIMUM_DURATION_MS[frameCount],
    `${frameCount}프레임 captureWindowMs가 유효하지 않습니다.`,
  );
  validateFace3DSensorProvenance(
    profile.sensorProvenance,
    `${frameCount}프레임 sensorProvenance`,
  );
  requireCondition(isRecord(profile.metrics), `${frameCount}프레임 metrics가 없습니다.`);
  for (const [key, metric] of Object.entries(profile.metrics)) {
    requireCondition(isRecord(metric), `${frameCount}프레임 ${key} metric이 없습니다.`);
    requireCondition(
      metric.valueMm === null
        || (typeof metric.valueMm === 'number' && Number.isFinite(metric.valueMm)),
      `${frameCount}프레임 ${key}.valueMm은 finite number 또는 null이어야 합니다.`,
    );
    requireCondition(
      typeof metric.valueMmConfidence === 'number'
        && Number.isFinite(metric.valueMmConfidence)
        && metric.valueMmConfidence >= 0
        && metric.valueMmConfidence <= 1,
      `${frameCount}프레임 ${key}.valueMmConfidence가 유효하지 않습니다.`,
    );
    requireCondition(
      Number.isInteger(metric.valueMmValidFrameCount)
        && metric.valueMmValidFrameCount >= 0
        && metric.valueMmValidFrameCount <= frameCount,
      `${frameCount}프레임 ${key}.valueMmValidFrameCount가 유효하지 않습니다.`,
    );
    requireCondition(
      metric.valueMm === null || metric.valueMmValidFrameCount >= frameCount,
      `${frameCount}프레임 ${key}.valueMm은 raw inlier 최소치 미달이면 null이어야 합니다.`,
    );
    if (frameCount === 1) {
      requireCondition(
        metric.confidence === 0
          && metric.mad === null
          && metric.valueMmConfidence === 0
          && metric.valueMmMad === null,
        `exact-1 ${key}는 normalized/mm confidence=0, mad=null이어야 합니다.`,
      );
    } else {
      requireCondition(
        typeof metric.valueMmMad === 'number'
          && Number.isFinite(metric.valueMmMad)
          && metric.valueMmMad >= 0,
        `${frameCount}프레임 ${key}.valueMmMad가 유효하지 않습니다.`,
      );
    }
  }
}

export function validateProductFace3DProfile(profile, policyId) {
  requireCondition(isRecord(profile), 'calibrated product profile이 없습니다.');
  const policy = FACE3D_PRODUCT_POLICY_TUPLES[policyId];
  requireCondition(
    isRecord(policy),
    `승인되지 않은 product collectionPolicyId입니다: ${String(policyId)}`,
  );
  requireCondition(
    profile.collectionPolicyId === policyId
      && profile.gateVersion === policy.gateVersion,
    'calibrated product profile의 policy/gate binding이 잘못됐습니다.',
  );

  const validFrameCount = profile.validFrameCount;
  const targetFrameCount = profile.targetFrameCount;
  const completionRatio = profile.completionRatio;
  const captureWindowMs = profile.captureWindowMs;
  requireCondition(
    profile.sampleMode === policy.sampleMode
      && profile.aggregation === policy.aggregation
      && Number.isInteger(validFrameCount)
      && validFrameCount >= policy.minimumValidFrames
      && validFrameCount <= policy.targetFrameCount
      && targetFrameCount === policy.targetFrameCount
      && typeof completionRatio === 'number'
      && Number.isFinite(completionRatio)
      && Math.abs(completionRatio - validFrameCount / policy.targetFrameCount) <= 1e-6
      && typeof captureWindowMs === 'number'
      && Number.isFinite(captureWindowMs)
      && captureWindowMs >= 0
      && captureWindowMs <= policy.maximumCaptureWindowMs,
    'calibrated product profile의 immutable policy tuple이 잘못됐습니다.',
  );

  validateFace3DSensorProvenance(
    profile.sensorProvenance,
    'calibrated product profile sensorProvenance',
  );
  requireCondition(isRecord(profile.metrics), 'calibrated product profile metrics가 없습니다.');
  requireCondition(
    FACE3D_REQUIRED_METRIC_KEYS.every(key => isRecord(profile.metrics[key])),
    'calibrated product profile의 required metrics가 없습니다.',
  );
  for (const [key, metric] of Object.entries(profile.metrics)) {
    requireCondition(
      isRecord(metric),
      `calibrated product profile ${key} metric이 잘못됐습니다.`,
    );
    requireCondition(
      Number.isInteger(metric.validFrameCount)
        && metric.validFrameCount >= 0
        && metric.validFrameCount <= validFrameCount,
      `calibrated product profile ${key}.validFrameCount가 profile validFrameCount를 초과합니다.`,
    );
    requireCondition(
      metric.valueMm === null
        || (typeof metric.valueMm === 'number' && Number.isFinite(metric.valueMm)),
      `calibrated product profile ${key}.valueMm이 유효하지 않습니다.`,
    );
    requireCondition(
      typeof metric.valueMmConfidence === 'number'
        && Number.isFinite(metric.valueMmConfidence)
        && metric.valueMmConfidence >= 0
        && metric.valueMmConfidence <= 1,
      `calibrated product profile ${key}.valueMmConfidence가 유효하지 않습니다.`,
    );
    requireCondition(
      Number.isInteger(metric.valueMmValidFrameCount)
        && metric.valueMmValidFrameCount >= 0
        && metric.valueMmValidFrameCount <= validFrameCount,
      `calibrated product profile ${key}.valueMmValidFrameCount가 profile validFrameCount를 초과합니다.`,
    );
    requireCondition(
      typeof metric.valueMmMad === 'number'
        && Number.isFinite(metric.valueMmMad)
        && metric.valueMmMad >= 0,
      `calibrated product profile ${key}.valueMmMad가 유효하지 않습니다.`,
    );
    requireCondition(
      metric.valueMm === null
        || metric.valueMmValidFrameCount >= policy.minimumValidFrames,
      `calibrated product profile ${key}.valueMm은 raw inlier 최소치 미달이면 null이어야 합니다.`,
    );
  }
}
