import {
  FACE_3D_EXPOSED_METRIC_KEYS,
  type Face3DMetricKey,
} from '../types';

export const FACE_3D_PHOTO_EVIDENCE_SCHEMA_VERSION =
  'aura.face3d-photo-evidence.v1' as const;

export type Face3DPhotoEvidenceRegionKey =
  | 'nose'
  | 'central'
  | 'malarLeft'
  | 'malarRight'
  | 'upperLip'
  | 'lowerLip'
  | 'chin';

export type Face3DPhotoEvidencePoint = {
  x: number;
  y: number;
};

export type Face3DPhotoEvidenceSample = Face3DPhotoEvidencePoint & {
  // Representative-frame relative depth only. This is intentionally not mm
  // and cannot be compared across captures.
  relativeDepth: number;
  // Signed distance from the capture's oriented midface reference plane,
  // normalized by face width. Added additively to v1 so stored legacy evidence
  // without this field remains readable.
  signedDepthNormalized?: number;
};

export type Face3DPhotoEvidencePin = Face3DPhotoEvidenceSample & {
  label: string;
  metricKey: Face3DMetricKey;
};

export type Face3DPhotoEvidenceGuide = {
  key: string;
  kind: 'contour' | 'distance' | 'length';
  label: string;
  metricKeys: Face3DMetricKey[];
  points: Face3DPhotoEvidencePoint[];
};

export type Face3DPhotoEvidenceRegion = {
  hull: Face3DPhotoEvidencePoint[];
  metricKeys: Face3DMetricKey[];
  pin: Face3DPhotoEvidencePin;
  samples: Face3DPhotoEvidenceSample[];
};

export type Face3DPhotoEvidence = {
  captureId: string;
  coordinateSpace: 'portrait_unmirrored_normalized';
  frame: {
    cameraFrameToken: string;
    faceNativeFrameToken: string;
    faceNativeTimestampMs: number;
  };
  guides: Face3DPhotoEvidenceGuide[];
  image: {height: number; width: number};
  regions: Partial<Record<Face3DPhotoEvidenceRegionKey, Face3DPhotoEvidenceRegion>>;
  schemaVersion: typeof FACE_3D_PHOTO_EVIDENCE_SCHEMA_VERSION;
  topologyFingerprint: string;
};

const REGION_KEYS: readonly Face3DPhotoEvidenceRegionKey[] = [
  'nose',
  'central',
  'malarLeft',
  'malarRight',
  'upperLip',
  'lowerLip',
  'chin',
];
const EXPOSED_KEYS = new Set<string>(FACE_3D_EXPOSED_METRIC_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown, max = 160): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function unit(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
}

function signedDepth(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number >= -2 && number <= 2 ? number : null;
}

function point(value: unknown): Face3DPhotoEvidencePoint | null {
  if (!isRecord(value)) return null;
  const x = unit(value.x);
  const y = unit(value.y);
  return x === null || y === null ? null : {x, y};
}

function sample(value: unknown): Face3DPhotoEvidenceSample | null {
  const parsedPoint = point(value);
  const relativeDepth = isRecord(value) ? unit(value.relativeDepth) : null;
  const parsedSignedDepth =
    isRecord(value) && value.signedDepthNormalized !== undefined
      ? signedDepth(value.signedDepthNormalized)
      : undefined;
  if (parsedSignedDepth === null) return null;
  return parsedPoint && relativeDepth !== null
    ? {
        ...parsedPoint,
        relativeDepth,
        ...(parsedSignedDepth !== undefined
          ? {signedDepthNormalized: parsedSignedDepth}
          : {}),
      }
    : null;
}

function metricKeys(value: unknown): Face3DMetricKey[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((key): key is string => typeof key === 'string' && EXPOSED_KEYS.has(key))
        .slice(0, FACE_3D_EXPOSED_METRIC_KEYS.length),
    ),
  ) as Face3DMetricKey[];
}

function parseRegion(value: unknown): Face3DPhotoEvidenceRegion | null {
  if (!isRecord(value) || !Array.isArray(value.samples) || !Array.isArray(value.hull)) {
    return null;
  }
  const samples = value.samples.map(sample).filter((v): v is Face3DPhotoEvidenceSample => v !== null).slice(0, 96);
  const hull = value.hull.map(point).filter((v): v is Face3DPhotoEvidencePoint => v !== null).slice(0, 48);
  const keys = metricKeys(value.metricKeys);
  if (!isRecord(value.pin)) return null;
  const parsedPin = sample(value.pin);
  const pinLabel = string(value.pin.label, 40);
  const pinMetricKeys = metricKeys([value.pin.metricKey]);
  if (
    samples.length < 3
    || hull.length < 3
    || keys.length === 0
    || !parsedPin
    || !pinLabel
    || pinMetricKeys.length !== 1
  ) {
    return null;
  }
  return {
    hull,
    metricKeys: keys,
    pin: {
      ...parsedPin,
      label: pinLabel,
      metricKey: pinMetricKeys[0],
    },
    samples,
  };
}

function parseGuide(value: unknown): Face3DPhotoEvidenceGuide | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const key = string(value.key, 80);
  const label = string(value.label, 80);
  const kind =
    value.kind === 'contour' || value.kind === 'distance' || value.kind === 'length'
      ? value.kind
      : null;
  const keys = metricKeys(value.metricKeys);
  const points = value.points.map(point).filter((v): v is Face3DPhotoEvidencePoint => v !== null).slice(0, 48);
  return key && label && kind && keys.length > 0 && points.length >= 2
    ? {key, kind, label, metricKeys: keys, points}
    : null;
}

export function parseFace3DPhotoEvidence(value: unknown): Face3DPhotoEvidence | null {
  if (
    !isRecord(value)
    || value.schemaVersion !== FACE_3D_PHOTO_EVIDENCE_SCHEMA_VERSION
    || value.coordinateSpace !== 'portrait_unmirrored_normalized'
    || !isRecord(value.frame)
    || !isRecord(value.image)
    || !isRecord(value.regions)
  ) {
    return null;
  }
  const captureId = string(value.captureId);
  const topologyFingerprint = string(value.topologyFingerprint, 256);
  const cameraFrameToken = string(value.frame.cameraFrameToken);
  const faceNativeFrameToken = string(value.frame.faceNativeFrameToken);
  const faceNativeTimestampMs = finite(value.frame.faceNativeTimestampMs);
  const width = positiveInteger(value.image.width);
  const height = positiveInteger(value.image.height);
  if (
    !captureId
    || !topologyFingerprint
    || !cameraFrameToken
    || !faceNativeFrameToken
    || faceNativeTimestampMs === null
    || faceNativeTimestampMs < 0
    || width === null
    || height === null
  ) {
    return null;
  }

  const regions: Face3DPhotoEvidence['regions'] = {};
  for (const key of REGION_KEYS) {
    const parsed = parseRegion(value.regions[key]);
    if (parsed) regions[key] = parsed;
  }
  if (Object.keys(regions).length === 0) return null;
  const guides = Array.isArray(value.guides)
    ? value.guides.map(parseGuide).filter((v): v is Face3DPhotoEvidenceGuide => v !== null).slice(0, 12)
    : [];

  return {
    captureId,
    coordinateSpace: 'portrait_unmirrored_normalized',
    frame: {cameraFrameToken, faceNativeFrameToken, faceNativeTimestampMs},
    guides,
    image: {height, width},
    regions,
    schemaVersion: FACE_3D_PHOTO_EVIDENCE_SCHEMA_VERSION,
    topologyFingerprint,
  };
}
