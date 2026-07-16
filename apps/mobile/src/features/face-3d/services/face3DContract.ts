import {
  FACE_3D_OPTIONAL_METRIC_KEYS,
  FACE_3D_REQUIRED_METRIC_KEYS,
  type Face3DCalibrationReceipt,
  type Face3DEvent,
  type Face3DMetric,
  type Face3DMetrics,
  type Face3DOptionalMetricKey,
  type Face3DProfile,
  type Face3DProfileV1,
  type Face3DProfileV2,
  type Face3DProfileV3,
  type Face3DSensorProvenance,
  type Face3DStartRequest,
  type Face3DStatus,
} from '../types';

export const FACE_3D_PROFILE_SCHEMA_VERSION = 'aura.face3d-profile.v1' as const;
export const FACE_3D_PROFILE_SCHEMA_VERSION_V2 = 'aura.face3d-profile.v2' as const;
export const FACE_3D_PROFILE_SCHEMA_VERSION_V3 = 'aura.face3d-profile.v3' as const;
export const FACE_3D_PROFILE_SOURCE = 'arkit_face_mesh' as const;
export const FACE_3D_GATE_VERSION = 'face3d-gate-v1' as const;
export const FACE_3D_GATE_VERSION_V2 = 'face3d-gate-v2' as const;

export const UNIFIED_MICRO_BURST_POLICY_ID = 'unified-micro-burst-5of8-v1';
export const FACE_3D_CALIBRATION_PROMOTION_ENABLED: boolean = false;
export const FACE_3D_CALIBRATION_APPROVAL_ALLOWLIST = new Map([
  [
    UNIFIED_MICRO_BURST_POLICY_ID,
    {
      approvalArtifactSha256s: new Set<string>(),
      gateVersion: FACE_3D_GATE_VERSION_V2,
      signingKeyIds: new Set<string>(),
    },
  ],
] as const);
const DIAGNOSTICS_EXACT_POLICY_TARGETS = new Map<string, number>([
  ['diagnostics-exact-1-v1', 1],
  ['diagnostics-exact-3-v1', 3],
  ['diagnostics-exact-5-v1', 5],
  ['diagnostics-exact-8-v1', 8],
  ['diagnostics-exact-12-v1', 12],
  ['diagnostics-exact-30-v1', 30],
]);

export const DEFAULT_FACE_3D_REQUEST_OPTIONS = {
  gateVersion: FACE_3D_GATE_VERSION,
  maximumDurationMs: 3000,
  minimumValidFrames: 20,
  targetValidFrames: 30,
} as const;

const FACE_3D_STATUSES = new Set<Face3DStatus>([
  'idle',
  'preparing',
  'tracking',
  'collecting',
  'completed',
  'blocked',
  'error',
]);
const FACE_3D_MILLIMETER_METRIC_FIELDS = [
  'valueMm',
  'valueMmConfidence',
  'valueMmMad',
  'valueMmValidFrameCount',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === 'boolean' ? value : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readSha256(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    ? value
    : null;
}

function readWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((warning): warning is string => typeof warning === 'string')
        .map(warning => warning.trim())
        .filter(Boolean),
    ),
  );
}

function readStatus(value: unknown): Face3DStatus | null {
  return typeof value === 'string' && FACE_3D_STATUSES.has(value as Face3DStatus)
    ? (value as Face3DStatus)
    : null;
}

function parseMetric(
  value: unknown,
  includeMillimeterFields: boolean,
): Face3DMetric | null {
  if (!isRecord(value) || value.unit !== 'normalized') {
    return null;
  }

  const metricValue = value.value === null ? null : readFiniteNumber(value.value);
  const confidence = readFiniteNumber(value.confidence);
  const validFrameCount = readNonNegativeInteger(value.validFrameCount);
  const mad = value.mad === null ? null : readFiniteNumber(value.mad);
  const valueMm =
    !includeMillimeterFields || value.valueMm === undefined
      ? undefined
      : value.valueMm === null
        ? null
        : readFiniteNumber(value.valueMm);
  const valueMmConfidence =
    !includeMillimeterFields || value.valueMmConfidence === undefined
      ? undefined
      : readFiniteNumber(value.valueMmConfidence);
  const valueMmValidFrameCount =
    !includeMillimeterFields || value.valueMmValidFrameCount === undefined
      ? undefined
      : readNonNegativeInteger(value.valueMmValidFrameCount);
  const valueMmMad =
    !includeMillimeterFields || value.valueMmMad === undefined
      ? undefined
      : value.valueMmMad === null
        ? null
        : readFiniteNumber(value.valueMmMad);

  if (
    (value.value !== null && metricValue === null) ||
    confidence === null ||
    confidence < 0 ||
    confidence > 1 ||
    validFrameCount === null ||
    (value.mad !== null && mad === null) ||
    (mad !== null && mad < 0) ||
    (includeMillimeterFields &&
      value.valueMm !== undefined &&
      value.valueMm !== null &&
      valueMm === null) ||
    (includeMillimeterFields &&
      value.valueMmConfidence !== undefined &&
      (typeof valueMmConfidence !== 'number' ||
        valueMmConfidence < 0 ||
        valueMmConfidence > 1)) ||
    (includeMillimeterFields &&
      value.valueMmValidFrameCount !== undefined &&
      typeof valueMmValidFrameCount !== 'number') ||
    (includeMillimeterFields &&
      value.valueMmMad !== undefined &&
      value.valueMmMad !== null &&
      valueMmMad === null) ||
    (valueMmMad !== undefined && valueMmMad !== null && valueMmMad < 0)
  ) {
    return null;
  }

  return {
    confidence,
    mad,
    unit: 'normalized',
    validFrameCount,
    value: metricValue,
    ...(valueMm !== undefined ? {valueMm} : {}),
    ...(typeof valueMmConfidence === 'number' ? {valueMmConfidence} : {}),
    ...(typeof valueMmValidFrameCount === 'number'
      ? {valueMmValidFrameCount}
      : {}),
    ...(valueMmMad !== undefined ? {valueMmMad} : {}),
  };
}

function hasMillimeterMetricFields(metricsRecord: Record<string, unknown>): boolean {
  return Object.values(metricsRecord).some(
    metric =>
      isRecord(metric) &&
      FACE_3D_MILLIMETER_METRIC_FIELDS.some(field => field in metric),
  );
}

function parseSensorProvenance(value: unknown): Face3DSensorProvenance | null {
  if (!isRecord(value)) {
    return null;
  }

  const trueDepthHardware = readNullableBoolean(value.trueDepthHardware);
  const faceTrackingSupported = readNullableBoolean(value.faceTrackingSupported);
  const deviceModel = readNullableString(value.deviceModel);
  const depthDataObservedRatio =
    value.depthDataObservedRatio === null
      ? null
      : readFiniteNumber(value.depthDataObservedRatio);

  if (
    trueDepthHardware === undefined ||
    faceTrackingSupported === undefined ||
    deviceModel === undefined ||
    (depthDataObservedRatio === null &&
      value.depthDataObservedRatio !== null) ||
    (depthDataObservedRatio !== null &&
      (depthDataObservedRatio < 0 || depthDataObservedRatio > 1))
  ) {
    return null;
  }

  return {
    depthDataObservedRatio,
    deviceModel,
    faceTrackingSupported,
    trueDepthHardware,
  };
}

function parseCalibrationReceipt(value: unknown): Face3DCalibrationReceipt | null {
  if (!isRecord(value)) {
    return null;
  }

  const receiptId = readNonEmptyString(value.receiptId);
  const captureNonce = readNonEmptyString(value.captureNonce);
  const profileBindingSha256 = readSha256(value.profileBindingSha256);
  const collectionPolicyId = readNonEmptyString(value.collectionPolicyId);
  const gateVersion = readNonEmptyString(value.gateVersion);
  const appBuild = readNonEmptyString(value.appBuild);
  const issuedAtUtc = readNonEmptyString(value.issuedAtUtc);
  const expiresAtUtc = readNonEmptyString(value.expiresAtUtc);
  const subjectContextId = readNonEmptyString(value.subjectContextId);
  const reportContextId = readNonEmptyString(value.reportContextId);
  const approvalArtifactSha256 = readSha256(value.approvalArtifactSha256);
  const signatureAlgorithm = readNonEmptyString(value.signatureAlgorithm);
  const signingKeyId = readNonEmptyString(value.signingKeyId);
  const signature = readSha256(value.signature);
  const issuedAtMs = issuedAtUtc ? Date.parse(issuedAtUtc) : Number.NaN;
  const expiresAtMs = expiresAtUtc ? Date.parse(expiresAtUtc) : Number.NaN;

  if (
    !receiptId ||
    !captureNonce ||
    !profileBindingSha256 ||
    !collectionPolicyId ||
    gateVersion !== FACE_3D_GATE_VERSION_V2 ||
    !appBuild ||
    !issuedAtUtc ||
    !expiresAtUtc ||
    !subjectContextId ||
    !reportContextId ||
    !approvalArtifactSha256 ||
    signatureAlgorithm !== 'hmac-sha256-v1' ||
    !signingKeyId ||
    !signature ||
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    issuedAtMs >= expiresAtMs
  ) {
    return null;
  }

  return {
    appBuild,
    approvalArtifactSha256,
    captureNonce,
    collectionPolicyId,
    expiresAtUtc,
    gateVersion,
    issuedAtUtc,
    profileBindingSha256,
    receiptId,
    reportContextId,
    signature,
    signatureAlgorithm,
    signingKeyId,
    subjectContextId,
  };
}

function parseMetrics(
  metricsRecord: Record<string, unknown>,
  includeMillimeterFields: boolean,
): Face3DMetrics | null {
  const parsedMetrics = FACE_3D_REQUIRED_METRIC_KEYS.map(
    key =>
      [key, parseMetric(metricsRecord[key], includeMillimeterFields)] as const,
  );

  if (parsedMetrics.some(([, metric]) => metric === null)) {
    return null;
  }

  // Tier-2 optional 키: 있으면 파싱해 싣고, 없거나 형식이 깨졌으면 그 키만
  // 생략한다 — v1(필수 5지표) 프로필의 파싱 성공 여부에는 영향을 주지 않는다.
  const optionalMetrics: Partial<Record<Face3DOptionalMetricKey, Face3DMetric>> = {};
  for (const key of FACE_3D_OPTIONAL_METRIC_KEYS) {
    if (!(key in metricsRecord)) {
      continue;
    }

    const metric = parseMetric(metricsRecord[key], includeMillimeterFields);
    if (metric) {
      optionalMetrics[key] = metric;
    }
  }

  return {
    ...(Object.fromEntries(parsedMetrics) as Record<
      (typeof FACE_3D_REQUIRED_METRIC_KEYS)[number],
      Face3DMetric
    >),
    ...optionalMetrics,
  } as Face3DMetrics;
}

function parseFace3DProfileV1(
  value: Record<string, unknown>,
  metrics: Face3DMetrics,
): Face3DProfileV1 | null {
  const gateVersion = readNonEmptyString(value.gateVersion);
  const topologyFingerprint = readNonEmptyString(value.topologyFingerprint);
  const validFrameCount = readNonNegativeInteger(value.validFrameCount);
  const targetFrameCount = readNonNegativeInteger(value.targetFrameCount);

  if (
    gateVersion !== FACE_3D_GATE_VERSION ||
    !topologyFingerprint ||
    validFrameCount === null ||
    targetFrameCount === null
  ) {
    return null;
  }

  return {
    gateVersion,
    metrics,
    schemaVersion: FACE_3D_PROFILE_SCHEMA_VERSION,
    source: FACE_3D_PROFILE_SOURCE,
    targetFrameCount,
    topologyFingerprint,
    validFrameCount,
    warnings: readWarnings(value.warnings),
  };
}

function parseFace3DProfileV2(
  value: Record<string, unknown>,
  metrics: Face3DMetrics,
): Face3DProfileV2 | null {
  const aggregation = readNonEmptyString(value.aggregation);
  const captureWindowMs = readFiniteNumber(value.captureWindowMs);
  const collectionPolicyId = readNonEmptyString(value.collectionPolicyId);
  const completionRatio = readFiniteNumber(value.completionRatio);
  const confidenceCalibrationStatus = readNonEmptyString(
    value.confidenceCalibrationStatus,
  );
  const gateVersion = readNonEmptyString(value.gateVersion);
  const sampleMode = readNonEmptyString(value.sampleMode);
  const targetFrameCount = readNonNegativeInteger(value.targetFrameCount);
  const topologyFingerprint = readNonEmptyString(value.topologyFingerprint);
  const validFrameCount = readNonNegativeInteger(value.validFrameCount);
  const warnings = readWarnings(value.warnings);

  if (
    gateVersion !== FACE_3D_GATE_VERSION_V2 ||
    !topologyFingerprint ||
    !collectionPolicyId ||
    (sampleMode !== 'micro_burst' && sampleMode !== 'single_frame') ||
    (aggregation !== 'median_mad' && aggregation !== 'none') ||
    (confidenceCalibrationStatus !== 'uncalibrated' &&
      confidenceCalibrationStatus !== 'calibrated') ||
    captureWindowMs === null ||
    captureWindowMs < 0 ||
    completionRatio === null ||
    completionRatio < 0 ||
    completionRatio > 1 ||
    validFrameCount === null ||
    targetFrameCount === null ||
    targetFrameCount === 0 ||
    validFrameCount > targetFrameCount ||
    Math.abs(completionRatio - validFrameCount / targetFrameCount) > 0.0001 ||
    !isValidV2PolicyCombination({
      aggregation,
      captureWindowMs,
      collectionPolicyId,
      sampleMode,
      targetFrameCount,
      validFrameCount,
      warnings,
    }) ||
    Object.values(metrics).some(metric => metric.validFrameCount > validFrameCount)
  ) {
    return null;
  }

  return {
    aggregation,
    captureWindowMs,
    collectionPolicyId,
    completionRatio,
    confidenceCalibrationStatus,
    gateVersion,
    metrics,
    sampleMode,
    schemaVersion: FACE_3D_PROFILE_SCHEMA_VERSION_V2,
    source: FACE_3D_PROFILE_SOURCE,
    targetFrameCount,
    topologyFingerprint,
    validFrameCount,
    warnings,
  };
}

function isValidV2PolicyCombination(input: {
  aggregation: string;
  captureWindowMs: number;
  collectionPolicyId: string;
  sampleMode: string;
  targetFrameCount: number;
  validFrameCount: number;
  warnings: string[];
}): boolean {
  if (input.collectionPolicyId === UNIFIED_MICRO_BURST_POLICY_ID) {
    return (
      input.sampleMode === 'micro_burst' &&
      input.aggregation === 'median_mad' &&
      input.targetFrameCount === 8 &&
      input.validFrameCount >= 5 &&
      input.validFrameCount <= 8 &&
      input.captureWindowMs <= 500
    );
  }

  const exactTarget = DIAGNOSTICS_EXACT_POLICY_TARGETS.get(input.collectionPolicyId);
  if (exactTarget === undefined) {
    return false;
  }

  if (input.targetFrameCount !== exactTarget || input.validFrameCount !== exactTarget) {
    return false;
  }

  if (exactTarget === 1) {
    return (
      input.sampleMode === 'single_frame' &&
      input.aggregation === 'none' &&
      input.warnings.includes('single_frame_unaggregated')
    );
  }

  return input.sampleMode === 'micro_burst' && input.aggregation === 'median_mad';
}

function getV3MetricMinimumFrameCount(collectionPolicyId: string): number | null {
  if (collectionPolicyId === UNIFIED_MICRO_BURST_POLICY_ID) {
    return 5;
  }
  return DIAGNOSTICS_EXACT_POLICY_TARGETS.get(collectionPolicyId) ?? null;
}

function parseFace3DProfileV3(
  value: Record<string, unknown>,
  metrics: Face3DMetrics,
  metricsRecord: Record<string, unknown>,
): Face3DProfileV3 | null {
  const aggregation = readNonEmptyString(value.aggregation);
  const captureNonce = readNonEmptyString(value.captureNonce);
  const captureWindowMs = readFiniteNumber(value.captureWindowMs);
  const collectionPolicyId = readNonEmptyString(value.collectionPolicyId);
  const completionRatio = readFiniteNumber(value.completionRatio);
  const confidenceCalibrationStatus = readNonEmptyString(
    value.confidenceCalibrationStatus,
  );
  const gateVersion = readNonEmptyString(value.gateVersion);
  const sampleMode = readNonEmptyString(value.sampleMode);
  const targetFrameCount = readNonNegativeInteger(value.targetFrameCount);
  const topologyFingerprint = readNonEmptyString(value.topologyFingerprint);
  const validFrameCount = readNonNegativeInteger(value.validFrameCount);
  const warnings = readWarnings(value.warnings);
  const profileBindingSha256 =
    value.profileBindingSha256 === null
      ? null
      : readSha256(value.profileBindingSha256);
  const calibrationReceipt =
    value.calibrationReceipt === null
      ? null
      : parseCalibrationReceipt(value.calibrationReceipt);
  const sensorProvenance = parseSensorProvenance(value.sensorProvenance);
  const serverCalibrationReceiptStatus =
    value.serverCalibrationReceiptStatus === undefined
      ? undefined
      : readNonEmptyString(value.serverCalibrationReceiptStatus);
  const metricMinimumFrameCount = collectionPolicyId
    ? getV3MetricMinimumFrameCount(collectionPolicyId)
    : null;

  if (
    gateVersion !== FACE_3D_GATE_VERSION_V2 ||
    !captureNonce ||
    !topologyFingerprint ||
    !collectionPolicyId ||
    (sampleMode !== 'micro_burst' && sampleMode !== 'single_frame') ||
    (aggregation !== 'median_mad' && aggregation !== 'none') ||
    (confidenceCalibrationStatus !== 'uncalibrated' &&
      confidenceCalibrationStatus !== 'calibrated') ||
    captureWindowMs === null ||
    captureWindowMs < 0 ||
    completionRatio === null ||
    completionRatio < 0 ||
    completionRatio > 1 ||
    validFrameCount === null ||
    targetFrameCount === null ||
    targetFrameCount === 0 ||
    validFrameCount > targetFrameCount ||
    (value.profileBindingSha256 !== null && !profileBindingSha256) ||
    (value.calibrationReceipt !== null && !calibrationReceipt) ||
    (value.serverCalibrationReceiptStatus !== undefined &&
      !serverCalibrationReceiptStatus) ||
    !sensorProvenance ||
    Math.abs(completionRatio - validFrameCount / targetFrameCount) > 0.0001 ||
    !isValidV2PolicyCombination({
      aggregation,
      captureWindowMs,
      collectionPolicyId,
      sampleMode,
      targetFrameCount,
      validFrameCount,
      warnings,
    }) ||
    metricMinimumFrameCount === null ||
    FACE_3D_OPTIONAL_METRIC_KEYS.some(
      key => key in metricsRecord && metrics[key] === undefined,
    ) ||
    Object.values(metrics).some(
      metric =>
        metric.validFrameCount > validFrameCount ||
        metric.valueMm === undefined ||
        metric.valueMmConfidence === undefined ||
        metric.valueMmValidFrameCount === undefined ||
        metric.valueMmMad === undefined ||
        metric.valueMmValidFrameCount > validFrameCount ||
        (metric.valueMm !== null &&
          metric.valueMmValidFrameCount < metricMinimumFrameCount) ||
        (aggregation === 'median_mad' && metric.valueMmMad === null) ||
        (aggregation === 'none' &&
          (metric.valueMmConfidence !== 0 ||
            metric.valueMmMad !== null ||
            (metric.valueMm !== null &&
              metric.valueMmValidFrameCount !== 1))),
    ) ||
    (confidenceCalibrationStatus === 'uncalibrated' &&
      calibrationReceipt !== null) ||
    (confidenceCalibrationStatus === 'calibrated' &&
      (!profileBindingSha256 ||
        !calibrationReceipt ||
        calibrationReceipt.captureNonce !== captureNonce ||
        calibrationReceipt.profileBindingSha256 !== profileBindingSha256 ||
        calibrationReceipt.collectionPolicyId !== collectionPolicyId ||
        calibrationReceipt.gateVersion !== gateVersion))
  ) {
    return null;
  }

  return {
    aggregation,
    calibrationReceipt,
    captureNonce,
    captureWindowMs,
    collectionPolicyId,
    completionRatio,
    confidenceCalibrationStatus,
    gateVersion,
    metrics,
    profileBindingSha256,
    sampleMode,
    schemaVersion: FACE_3D_PROFILE_SCHEMA_VERSION_V3,
    ...(serverCalibrationReceiptStatus
      ? {serverCalibrationReceiptStatus}
      : {}),
    sensorProvenance,
    source: FACE_3D_PROFILE_SOURCE,
    targetFrameCount,
    topologyFingerprint,
    validFrameCount,
    warnings,
  };
}

export function parseFace3DProfile(value: unknown): Face3DProfile | null {
  if (!isRecord(value) || !isRecord(value.metrics)) {
    return null;
  }

  const metricsRecord = value.metrics;

  if (value.source !== FACE_3D_PROFILE_SOURCE) {
    return null;
  }

  if (value.schemaVersion === FACE_3D_PROFILE_SCHEMA_VERSION) {
    if (hasMillimeterMetricFields(metricsRecord)) {
      return null;
    }
    const metrics = parseMetrics(metricsRecord, false);
    if (!metrics) {
      return null;
    }
    return parseFace3DProfileV1(value, metrics);
  }

  if (value.schemaVersion === FACE_3D_PROFILE_SCHEMA_VERSION_V2) {
    const metrics = parseMetrics(metricsRecord, false);
    if (!metrics) {
      return null;
    }
    return parseFace3DProfileV2(value, metrics);
  }

  if (value.schemaVersion === FACE_3D_PROFILE_SCHEMA_VERSION_V3) {
    const metrics = parseMetrics(metricsRecord, true);
    if (!metrics) {
      return null;
    }
    return parseFace3DProfileV3(value, metrics, metricsRecord);
  }

  return null;
}

// v3 소수 프레임 프로필은 반복성 보정이 완료되고 product policy로 수집된 경우에만
// 사용자 보고서·AI 해석에 사용한다. diagnostics/single-frame/uncalibrated 결과는
// 검증 자료로 저장할 수 있지만 제품 해석에는 노출하지 않는다. 기존 v2는
// wire 호환 파싱만 허용하고 제품 해석에는 절대 승격하지 않는다.
export function isFace3DProfileAnalysisEligible(
  profile: Face3DProfile | null | undefined,
): profile is Face3DProfile {
  if (!profile) {
    return false;
  }

  if (profile.schemaVersion === FACE_3D_PROFILE_SCHEMA_VERSION) {
    return true;
  }

  if (profile.schemaVersion === FACE_3D_PROFILE_SCHEMA_VERSION_V2) {
    return false;
  }

  if (!FACE_3D_CALIBRATION_PROMOTION_ENABLED) {
    return false;
  }

  const approval = FACE_3D_CALIBRATION_APPROVAL_ALLOWLIST.get(
    profile.collectionPolicyId as typeof UNIFIED_MICRO_BURST_POLICY_ID,
  );
  const receipt = profile.calibrationReceipt;

  return (
    approval !== undefined &&
    approval.gateVersion === profile.gateVersion &&
    profile.confidenceCalibrationStatus === 'calibrated' &&
    profile.collectionPolicyId === UNIFIED_MICRO_BURST_POLICY_ID &&
    profile.sampleMode === 'micro_burst' &&
    profile.aggregation === 'median_mad' &&
    !profile.collectionPolicyId.startsWith('diagnostics-') &&
    profile.profileBindingSha256 !== null &&
    receipt !== null &&
    receipt.captureNonce === profile.captureNonce &&
    receipt.profileBindingSha256 === profile.profileBindingSha256 &&
    receipt.collectionPolicyId === profile.collectionPolicyId &&
    receipt.gateVersion === profile.gateVersion &&
    profile.serverCalibrationReceiptStatus === 'verified' &&
    approval.signingKeyIds.has(receipt.signingKeyId) &&
    approval.approvalArtifactSha256s.has(receipt.approvalArtifactSha256) &&
    profile.sensorProvenance.trueDepthHardware === true &&
    profile.sensorProvenance.faceTrackingSupported === true &&
    profile.sensorProvenance.depthDataObservedRatio !== null &&
    profile.sensorProvenance.depthDataObservedRatio > 0
  );
}

function parseMessagePayload(message: unknown): Record<string, unknown> | null {
  if (typeof message === 'string') {
    try {
      const parsed: unknown = JSON.parse(message);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isRecord(message) ? message : null;
}

export function parseFace3DEvent(message: unknown): Face3DEvent | null {
  const payload = parseMessagePayload(message);

  if (!payload) {
    return null;
  }

  const requestId = readNonEmptyString(payload.requestId);

  if (!requestId) {
    return null;
  }

  if (payload.type === 'face3d_status' || payload.type === 'face3DStatus') {
    const status = readStatus(payload.status);

    if (!status) {
      return null;
    }

    return {
      currentMaximumFaceCount:
        readNonNegativeInteger(payload.currentMaximumFaceCount) ?? undefined,
      message:
        readNonEmptyString(payload.message) ??
        readNonEmptyString(payload.detail) ??
        readNonEmptyString(payload.reason) ??
        undefined,
      meshIndexCount: readNonNegativeInteger(payload.meshIndexCount) ?? undefined,
      meshUvCount: readNonNegativeInteger(payload.meshUvCount) ?? undefined,
      meshVertexCount: readNonNegativeInteger(payload.meshVertexCount) ?? undefined,
      requestId,
      sessionSequence: readNonNegativeInteger(payload.sessionSequence) ?? undefined,
      status,
      supportedFaceCount: readNonNegativeInteger(payload.supportedFaceCount) ?? undefined,
      targetFrameCount: readNonNegativeInteger(payload.targetFrameCount) ?? 0,
      topologyFingerprint:
        readNonEmptyString(payload.topologyFingerprint) ?? undefined,
      type: 'face3d_status',
      validFrameCount: readNonNegativeInteger(payload.validFrameCount) ?? 0,
      warnings: readWarnings(payload.warnings),
    };
  }

  if (payload.type === 'face3d_analyzed' || payload.type === 'face3DAnalyzed') {
    const profile = parseFace3DProfile(payload.profile ?? payload.result);

    if (!profile) {
      return null;
    }

    return {
      profile,
      requestId,
      type: 'face3d_analyzed',
    };
  }

  return null;
}

export function createFace3DRequestId(now = Date.now()): string {
  const entropy = Math.random().toString(36).slice(2, 8);
  return `face3d-${now.toString(36)}-${entropy}`;
}

export function buildFace3DStartRequest(
  requestId = createFace3DRequestId(),
): Face3DStartRequest {
  return {
    ...DEFAULT_FACE_3D_REQUEST_OPTIONS,
    requestId,
  };
}
