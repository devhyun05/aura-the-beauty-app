export const GOLDEN_MASK_SCHEMA_VERSION = 'aura.golden-mask.v1' as const;
export const GOLDEN_MASK_CONTENT_TYPE = 'application/vnd.aura.golden-mask' as const;
export const GOLDEN_MASK_MEDIA_KIND = 'golden-mask' as const;

const MAX_GOLDEN_MASK_BYTES = 1_048_576;
const MAX_GOLDEN_MASK_CAPTURE_ID_LENGTH = 200;
const MAX_GOLDEN_MASK_VERTEX_COUNT = 4_096;
const MAX_GOLDEN_MASK_INDEX_COUNT = 32_768;

export type GoldenMaskMeshMetadata = {
  byteSize: number;
  captureId: string;
  createdAtUnixMs: number;
  schemaVersion: typeof GOLDEN_MASK_SCHEMA_VERSION;
  topologyFingerprint: string;
  triangleIndexCount: number;
  trueDepthHardware: true;
  uvCount: number;
  vertexCount: number;
};

export type GoldenMaskCaptureArtifact = GoldenMaskMeshMetadata & {
  uri: string;
};

export type GoldenMaskReportDescriptor = GoldenMaskMeshMetadata & {
  available: true;
  contentType: typeof GOLDEN_MASK_CONTENT_TYPE;
  createdAt: string;
  downloadUrl?: string;
  expiresInSeconds?: number;
  indexCount: number;
  mediaId: string;
  source: 'arkit_face_mesh';
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readPositiveInteger(value: unknown, maximum: number): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum
    ? value
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function parseMetadata(value: UnknownRecord): GoldenMaskMeshMetadata | null {
  const byteSize = readPositiveInteger(value.byteSize, MAX_GOLDEN_MASK_BYTES);
  const captureId = readNonEmptyString(value.captureId);
  const createdAtUnixMs = readNonNegativeInteger(value.createdAtUnixMs);
  const topologyFingerprint = readNonEmptyString(value.topologyFingerprint);
  const triangleIndexCount = readPositiveInteger(
    value.triangleIndexCount ?? value.indexCount,
    MAX_GOLDEN_MASK_INDEX_COUNT,
  );
  const uvCount = readPositiveInteger(value.uvCount, MAX_GOLDEN_MASK_VERTEX_COUNT);
  const vertexCount = readPositiveInteger(
    value.vertexCount,
    MAX_GOLDEN_MASK_VERTEX_COUNT,
  );

  if (
    value.schemaVersion !== GOLDEN_MASK_SCHEMA_VERSION ||
    byteSize === null ||
    !captureId ||
    createdAtUnixMs === null ||
    !topologyFingerprint ||
    captureId.length > MAX_GOLDEN_MASK_CAPTURE_ID_LENGTH ||
    !/^[0-9a-f]{64}$/i.test(topologyFingerprint) ||
    triangleIndexCount === null ||
    triangleIndexCount % 3 !== 0 ||
    value.trueDepthHardware !== true ||
    uvCount === null ||
    vertexCount === null ||
    uvCount !== vertexCount
  ) {
    return null;
  }

  return {
    byteSize,
    captureId,
    createdAtUnixMs,
    schemaVersion: GOLDEN_MASK_SCHEMA_VERSION,
    topologyFingerprint,
    triangleIndexCount,
    trueDepthHardware: true,
    uvCount,
    vertexCount,
  };
}

export function parseGoldenMaskCaptureArtifact(
  value: unknown,
): GoldenMaskCaptureArtifact | null {
  if (!isRecord(value)) {
    return null;
  }

  const metadata = parseMetadata(value);
  const uri = readNonEmptyString(value.uri ?? value.localUri);

  if (!metadata || !uri || (!uri.startsWith('file:') && !uri.startsWith('content:'))) {
    return null;
  }

  return {...metadata, uri};
}

export function parseGoldenMaskReportDescriptor(
  value: unknown,
): GoldenMaskReportDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const indexCount = readPositiveInteger(
    value.indexCount ?? value.triangleIndexCount,
    MAX_GOLDEN_MASK_INDEX_COUNT,
  );
  const createdAt = readNonEmptyString(value.createdAt);
  const createdAtUnixMs = createdAt ? Date.parse(createdAt) : Number.NaN;
  const metadata = parseMetadata({
    ...value,
    createdAtUnixMs,
    triangleIndexCount: indexCount,
  });
  const mediaId = readNonEmptyString(value.mediaId);
  const downloadUrl = readNonEmptyString(
    value.downloadUrl ?? value.signedDownloadUrl,
  );

  const expiresInSeconds =
    value.expiresInSeconds === undefined
      ? null
      : readPositiveInteger(value.expiresInSeconds, 86_400);

  if (
    value.available !== true ||
    value.contentType !== GOLDEN_MASK_CONTENT_TYPE ||
    value.source !== 'arkit_face_mesh' ||
    !metadata ||
    !mediaId ||
    !createdAt ||
    !Number.isFinite(createdAtUnixMs) ||
    indexCount === null ||
    (value.expiresInSeconds !== undefined && expiresInSeconds === null)
  ) {
    return null;
  }

  return {
    ...metadata,
    available: true,
    contentType: GOLDEN_MASK_CONTENT_TYPE,
    createdAt,
    ...(downloadUrl ? {downloadUrl} : {}),
    ...(expiresInSeconds !== null ? {expiresInSeconds} : {}),
    indexCount,
    mediaId,
    source: 'arkit_face_mesh',
  };
}
