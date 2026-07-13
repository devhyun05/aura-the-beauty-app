import {
  FACE_3D_METRIC_KEYS,
  type Face3DEvent,
  type Face3DMetric,
  type Face3DMetrics,
  type Face3DProfile,
  type Face3DStartRequest,
  type Face3DStatus,
} from '../types';

export const FACE_3D_PROFILE_SCHEMA_VERSION = 'aura.face3d-profile.v1' as const;
export const FACE_3D_PROFILE_SOURCE = 'arkit_face_mesh' as const;
export const FACE_3D_GATE_VERSION = 'face3d-gate-v1' as const;

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

function parseMetric(value: unknown): Face3DMetric | null {
  if (!isRecord(value) || value.unit !== 'normalized') {
    return null;
  }

  const metricValue = value.value === null ? null : readFiniteNumber(value.value);
  const confidence = readFiniteNumber(value.confidence);
  const validFrameCount = readNonNegativeInteger(value.validFrameCount);
  const mad = value.mad === null ? null : readFiniteNumber(value.mad);

  if (
    (value.value !== null && metricValue === null) ||
    confidence === null ||
    confidence < 0 ||
    confidence > 1 ||
    validFrameCount === null ||
    (value.mad !== null && mad === null) ||
    (mad !== null && mad < 0)
  ) {
    return null;
  }

  return {
    confidence,
    mad,
    unit: 'normalized',
    validFrameCount,
    value: metricValue,
  };
}

export function parseFace3DProfile(value: unknown): Face3DProfile | null {
  if (!isRecord(value) || !isRecord(value.metrics)) {
    return null;
  }

  const metricsRecord = value.metrics;

  if (
    value.schemaVersion !== FACE_3D_PROFILE_SCHEMA_VERSION ||
    value.source !== FACE_3D_PROFILE_SOURCE
  ) {
    return null;
  }

  const gateVersion = readNonEmptyString(value.gateVersion);
  const topologyFingerprint = readNonEmptyString(value.topologyFingerprint);
  const validFrameCount = readNonNegativeInteger(value.validFrameCount);
  const targetFrameCount = readNonNegativeInteger(value.targetFrameCount);
  const parsedMetrics = FACE_3D_METRIC_KEYS.map(key => [
    key,
    parseMetric(metricsRecord[key]),
  ] as const);

  if (
    gateVersion !== FACE_3D_GATE_VERSION ||
    !topologyFingerprint ||
    validFrameCount === null ||
    targetFrameCount === null ||
    parsedMetrics.some(([, metric]) => metric === null)
  ) {
    return null;
  }

  const metrics = Object.fromEntries(parsedMetrics) as Face3DMetrics;

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
