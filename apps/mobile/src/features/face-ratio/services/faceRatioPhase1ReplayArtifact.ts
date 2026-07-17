import type {
  FaceRatioPhase1ReplayCondition,
  FaceRatioPhase1ReplayValidation,
  VerticalThirdsKeypoint,
} from '../types';
import type {
  FaceRatioLandmark3D,
  FaceRatioTransformationMatrix,
} from './faceRatioPoseNormalization';

export const FACE_RATIO_PHASE1_REPLAY_SCHEMA_VERSION =
  'aura-face-ratio-phase1-replay/v1';

const SUBJECT_ID_PATTERN = /^subj_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CAPTURE_ID_PATTERN = /^cap_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const COHORT_ID_PATTERN = /^cohort_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SESSION_ID_PATTERN = /^session_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PHASE1_LOCAL_CAPTURE_FILE_PATTERN =
  /^aura-face-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:heic|jpe?g|png)$/i;

function normalizeFileUriPath(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (
      parsed.protocol !== 'file:' ||
      (parsed.hostname && parsed.hostname !== 'localhost') ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    const normalizedSegments: string[] = [];
    for (const segment of decodeURIComponent(parsed.pathname).split('/')) {
      if (!segment || segment === '.') {
        continue;
      }
      if (segment === '..') {
        if (normalizedSegments.length === 0) {
          return null;
        }
        normalizedSegments.pop();
        continue;
      }
      normalizedSegments.push(segment);
    }

    return `/${normalizedSegments.join('/')}`;
  } catch {
    return null;
  }
}

/**
 * Phase 1 카메라가 NSTemporaryDirectory에 만든 파일만 식별한다.
 * 일반 file URI, Documents/앨범 파일, 원격/content URI는 삭제 대상으로 삼지 않는다.
 */
export function isFaceRatioPhase1LocalCaptureUri(uri: string): boolean {
  const path = normalizeFileUriPath(uri);
  if (!path) {
    return false;
  }

  const separatorIndex = path.lastIndexOf('/');
  const parentPath = path.slice(0, separatorIndex);
  if (
    separatorIndex < 0 ||
    parentPath.endsWith('/tmp') === false ||
    parentPath.includes('/Containers/Data/Application/') === false
  ) {
    return false;
  }

  return PHASE1_LOCAL_CAPTURE_FILE_PATTERN.test(
    path.slice(separatorIndex + 1),
  );
}

type FaceRatioPhase1ReplayHairline = {
  confidence: number;
  provider: string;
  x: number;
  y: number;
  zProxy?: number;
};

export type FaceRatioPhase1ReplayCapture = {
  acquisition: FaceRatioPhase1ReplayValidation['acquisition'];
  captureId: string;
  capturedAtUtc: string;
  condition: FaceRatioPhase1ReplayCondition;
  hairline?: FaceRatioPhase1ReplayHairline;
  imageHeight: number;
  imageWidth: number;
  landmarks: FaceRatioLandmark3D[];
  subjectId: string;
  transformationMatrix: {
    layout: 'row-major';
    values: number[];
  };
};

export type FaceRatioPhase1ReplayArtifact = {
  artifactClass: 'local-validation-only';
  captures: FaceRatioPhase1ReplayCapture[];
  cohortId: string;
  privacy: {
    localOnly: true;
    productPayloadIncluded: false;
    pseudonymousSubjects: true;
    rawFaceDataIncluded: true;
    retention: {
      createdAtUtc: string;
      deleteAfterDays: number;
      deleteByUtc: string;
      deletionRequired: true;
    };
    sourceImagesIncluded: false;
  };
  schemaVersion: typeof FACE_RATIO_PHASE1_REPLAY_SCHEMA_VERSION;
  sessionId: string;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  for (const key of Object.keys(value)) {
    invariant(allowed.includes(key), `${label}.${key} is not allowed`);
  }
}

function finiteNumber(value: unknown, label: string): asserts value is number {
  invariant(
    typeof value === 'number' && Number.isFinite(value),
    `${label} must be finite`,
  );
}

function validUtc(value: unknown, label: string): asserts value is string {
  invariant(
    typeof value === 'string' && Number.isFinite(Date.parse(value)),
    `${label} must be an ISO timestamp`,
  );
}

function validateCondition(
  condition: unknown,
  label: string,
): asserts condition is FaceRatioPhase1ReplayCondition {
  invariant(isRecord(condition), `${label} must be an object`);
  exactKeys(
    condition,
    ['distanceLabel', 'isReference', 'poseLabel', 'repeatGroup', 'repeatIndex'],
    label,
  );
  invariant(
    typeof condition.distanceLabel === 'string' &&
      condition.distanceLabel.length > 0,
    `${label}.distanceLabel is required`,
  );
  invariant(
    typeof condition.isReference === 'boolean',
    `${label}.isReference is required`,
  );
  invariant(
    typeof condition.poseLabel === 'string' && condition.poseLabel.length > 0,
    `${label}.poseLabel is required`,
  );
  invariant(
    typeof condition.repeatGroup === 'string' &&
      condition.repeatGroup.length > 0,
    `${label}.repeatGroup is required`,
  );
  invariant(
    typeof condition.repeatIndex === 'number' &&
      Number.isInteger(condition.repeatIndex) &&
      condition.repeatIndex >= 1,
    `${label}.repeatIndex must be >= 1`,
  );
}

function validateAcquisition(
  value: unknown,
  label: string,
): asserts value is FaceRatioPhase1ReplayValidation['acquisition'] {
  invariant(isRecord(value), `${label} must be an object`);
  exactKeys(
    value,
    ['cameraFacing', 'captureImplementation', 'source'],
    label,
  );
  invariant(value.source === 'camera', `${label}.source must be camera`);
  invariant(
    value.captureImplementation === 'native',
    `${label}.captureImplementation must be native`,
  );
  invariant(
    value.cameraFacing === 'front',
    `${label}.cameraFacing must be front`,
  );
}

export function validateFaceRatioPhase1ReplayValidation(
  value: unknown,
): asserts value is FaceRatioPhase1ReplayValidation {
  invariant(isRecord(value), 'validationReplay must be an object');
  exactKeys(
    value,
    [
      'acquisition',
      'captureId',
      'cohortId',
      'condition',
      'retentionDays',
      'sessionId',
      'subjectId',
    ],
    'validationReplay',
  );
  validateAcquisition(value.acquisition, 'validationReplay.acquisition');
  invariant(
    typeof value.captureId === 'string' &&
      CAPTURE_ID_PATTERN.test(value.captureId),
    'validationReplay.captureId must be a pseudonymous cap_* identifier',
  );
  invariant(
    typeof value.cohortId === 'string' &&
      COHORT_ID_PATTERN.test(value.cohortId),
    'validationReplay.cohortId must be a pseudonymous cohort_* identifier',
  );
  invariant(
    typeof value.sessionId === 'string' &&
      SESSION_ID_PATTERN.test(value.sessionId),
    'validationReplay.sessionId must be a pseudonymous session_* identifier',
  );
  invariant(
    typeof value.subjectId === 'string' &&
      SUBJECT_ID_PATTERN.test(value.subjectId) &&
      !value.subjectId.startsWith('subj_user_') &&
      !value.subjectId.includes('@') &&
      !/\s/.test(value.subjectId),
    'validationReplay.subjectId must be a pseudonymous subj_* identifier',
  );
  invariant(
    typeof value.retentionDays === 'number' &&
      Number.isInteger(value.retentionDays) &&
      value.retentionDays >= 1 &&
      value.retentionDays <= 30,
    'validationReplay.retentionDays must be an integer in [1, 30]',
  );
  validateCondition(value.condition, 'validationReplay.condition');
}

function validateLandmarks(
  value: unknown,
  label: string,
): asserts value is FaceRatioLandmark3D[] {
  invariant(
    Array.isArray(value) && value.length === 478,
    `${label} must contain exactly 478 points`,
  );
  const indices = new Set<number>();

  value.forEach((point, position) => {
    invariant(isRecord(point), `${label}[${position}] must be an object`);
    exactKeys(point, ['i', 'x', 'y', 'z'], `${label}[${position}]`);
    invariant(
      Number.isInteger(point.i) &&
        Number(point.i) >= 0 &&
        Number(point.i) < 478 &&
        !indices.has(Number(point.i)),
      `${label}[${position}].i must be a unique index in [0, 477]`,
    );
    indices.add(Number(point.i));
    finiteNumber(point.x, `${label}[${position}].x`);
    finiteNumber(point.y, `${label}[${position}].y`);
    finiteNumber(point.z, `${label}[${position}].z`);
  });
  invariant(indices.size === 478, `${label} must contain every index exactly once`);
}

function validateMatrix(
  value: unknown,
  label: string,
): asserts value is FaceRatioPhase1ReplayCapture['transformationMatrix'] {
  invariant(isRecord(value), `${label} must be an object`);
  exactKeys(value, ['layout', 'values'], label);
  invariant(value.layout === 'row-major', `${label}.layout must be row-major`);
  invariant(
    Array.isArray(value.values) && value.values.length === 16,
    `${label}.values must contain exactly 16 entries`,
  );
  value.values.forEach((entry, index) =>
    finiteNumber(entry, `${label}.values[${index}]`),
  );
}

function validateHairline(
  value: unknown,
  label: string,
): asserts value is FaceRatioPhase1ReplayHairline {
  invariant(isRecord(value), `${label} must be an object`);
  exactKeys(value, ['confidence', 'provider', 'x', 'y', 'zProxy'], label);
  finiteNumber(value.confidence, `${label}.confidence`);
  finiteNumber(value.x, `${label}.x`);
  finiteNumber(value.y, `${label}.y`);
  invariant(
    value.confidence >= 0 && value.confidence <= 1,
    `${label}.confidence must be in [0, 1]`,
  );
  invariant(
    value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1,
    `${label}.x/y must be normalized to [0, 1]`,
  );
  invariant(
    typeof value.provider === 'string' && value.provider.length > 0,
    `${label}.provider is required`,
  );
  if (value.zProxy !== undefined) {
    finiteNumber(value.zProxy, `${label}.zProxy`);
  }
}

function validateCapture(
  value: unknown,
  index: number,
): asserts value is FaceRatioPhase1ReplayCapture {
  const label = `captures[${index}]`;
  invariant(isRecord(value), `${label} must be an object`);
  exactKeys(
    value,
    [
      'acquisition',
      'captureId',
      'capturedAtUtc',
      'condition',
      'hairline',
      'imageHeight',
      'imageWidth',
      'landmarks',
      'subjectId',
      'transformationMatrix',
    ],
    label,
  );
  validateAcquisition(value.acquisition, `${label}.acquisition`);
  invariant(
    typeof value.captureId === 'string' &&
      CAPTURE_ID_PATTERN.test(value.captureId),
    `${label}.captureId must be a pseudonymous cap_* identifier`,
  );
  invariant(
    typeof value.subjectId === 'string' &&
      SUBJECT_ID_PATTERN.test(value.subjectId) &&
      !value.subjectId.startsWith('subj_user_'),
    `${label}.subjectId must be a pseudonymous subj_* identifier`,
  );
  validUtc(value.capturedAtUtc, `${label}.capturedAtUtc`);
  validateCondition(value.condition, `${label}.condition`);
  finiteNumber(value.imageWidth, `${label}.imageWidth`);
  finiteNumber(value.imageHeight, `${label}.imageHeight`);
  invariant(
    value.imageWidth > 0 && value.imageHeight > 0,
    `${label} dimensions must be positive`,
  );
  validateLandmarks(value.landmarks, `${label}.landmarks`);
  validateMatrix(value.transformationMatrix, `${label}.transformationMatrix`);
  if (value.hairline !== undefined) {
    validateHairline(value.hairline, `${label}.hairline`);
  }
}

export function createFaceRatioPhase1ReplayArtifact({
  createdAtUtc,
  validation,
}: {
  createdAtUtc: string;
  validation: FaceRatioPhase1ReplayValidation;
}): FaceRatioPhase1ReplayArtifact {
  validateFaceRatioPhase1ReplayValidation(validation);
  validUtc(createdAtUtc, 'createdAtUtc');
  const createdAtMs = Date.parse(createdAtUtc);
  const deleteByUtc = new Date(
    createdAtMs + validation.retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    artifactClass: 'local-validation-only',
    captures: [],
    cohortId: validation.cohortId,
    privacy: {
      localOnly: true,
      productPayloadIncluded: false,
      pseudonymousSubjects: true,
      rawFaceDataIncluded: true,
      retention: {
        createdAtUtc: new Date(createdAtMs).toISOString(),
        deleteAfterDays: validation.retentionDays,
        deleteByUtc,
        deletionRequired: true,
      },
      sourceImagesIncluded: false,
    },
    schemaVersion: FACE_RATIO_PHASE1_REPLAY_SCHEMA_VERSION,
    sessionId: validation.sessionId,
  };
}

export function createFaceRatioPhase1ReplayCapture({
  capturedAtUtc,
  hairline,
  imageHeight,
  imageWidth,
  landmarks,
  transformationMatrix,
  validation,
  zProxy,
}: {
  capturedAtUtc: string;
  hairline: VerticalThirdsKeypoint | null;
  imageHeight: number;
  imageWidth: number;
  landmarks: readonly FaceRatioLandmark3D[];
  transformationMatrix: FaceRatioTransformationMatrix;
  validation: FaceRatioPhase1ReplayValidation;
  zProxy?: number;
}): FaceRatioPhase1ReplayCapture {
  validateFaceRatioPhase1ReplayValidation(validation);
  const capture: FaceRatioPhase1ReplayCapture = {
    acquisition: {...validation.acquisition},
    captureId: validation.captureId,
    capturedAtUtc,
    condition: {...validation.condition},
    imageHeight,
    imageWidth,
    landmarks: landmarks.map(point => ({...point})),
    subjectId: validation.subjectId,
    transformationMatrix: {
      layout: transformationMatrix.layout,
      values: [...transformationMatrix.values],
    },
    ...(hairline
      ? {
          hairline: {
            confidence: hairline.confidence,
            provider: hairline.provider,
            x: hairline.x / imageWidth,
            y: hairline.y / imageHeight,
            ...(typeof zProxy === 'number' && Number.isFinite(zProxy)
              ? {zProxy}
              : {}),
          },
        }
      : {}),
  };
  validateCapture(capture, 0);

  return capture;
}

export function validateFaceRatioPhase1ReplayArtifact(
  value: unknown,
): asserts value is FaceRatioPhase1ReplayArtifact {
  invariant(isRecord(value), 'artifact must be an object');
  exactKeys(
    value,
    [
      'artifactClass',
      'captures',
      'cohortId',
      'privacy',
      'schemaVersion',
      'sessionId',
    ],
    'artifact',
  );
  invariant(
    value.schemaVersion === FACE_RATIO_PHASE1_REPLAY_SCHEMA_VERSION,
    `schemaVersion must be ${FACE_RATIO_PHASE1_REPLAY_SCHEMA_VERSION}`,
  );
  invariant(
    value.artifactClass === 'local-validation-only',
    'artifactClass must be local-validation-only',
  );
  invariant(
    typeof value.cohortId === 'string' && COHORT_ID_PATTERN.test(value.cohortId),
    'cohortId must be a pseudonymous cohort_* identifier',
  );
  invariant(
    typeof value.sessionId === 'string' &&
      SESSION_ID_PATTERN.test(value.sessionId),
    'sessionId must be a pseudonymous session_* identifier',
  );
  invariant(isRecord(value.privacy), 'privacy must be an object');
  exactKeys(
    value.privacy,
    [
      'localOnly',
      'productPayloadIncluded',
      'pseudonymousSubjects',
      'rawFaceDataIncluded',
      'retention',
      'sourceImagesIncluded',
    ],
    'privacy',
  );
  invariant(value.privacy.localOnly === true, 'privacy.localOnly must be true');
  invariant(
    value.privacy.productPayloadIncluded === false,
    'privacy.productPayloadIncluded must be false',
  );
  invariant(
    value.privacy.pseudonymousSubjects === true,
    'privacy.pseudonymousSubjects must be true',
  );
  invariant(
    value.privacy.rawFaceDataIncluded === true,
    'privacy.rawFaceDataIncluded must be true',
  );
  invariant(
    value.privacy.sourceImagesIncluded === false,
    'privacy.sourceImagesIncluded must be false',
  );
  invariant(isRecord(value.privacy.retention), 'privacy.retention must be an object');
  exactKeys(
    value.privacy.retention,
    [
      'createdAtUtc',
      'deleteAfterDays',
      'deleteByUtc',
      'deletionRequired',
    ],
    'privacy.retention',
  );
  validUtc(value.privacy.retention.createdAtUtc, 'privacy.retention.createdAtUtc');
  validUtc(value.privacy.retention.deleteByUtc, 'privacy.retention.deleteByUtc');
  const deleteAfterDays = value.privacy.retention.deleteAfterDays;
  invariant(
    typeof deleteAfterDays === 'number' &&
      Number.isInteger(deleteAfterDays) &&
      deleteAfterDays >= 1 &&
      deleteAfterDays <= 30,
    'privacy.retention.deleteAfterDays must be in [1, 30]',
  );
  invariant(
    value.privacy.retention.deletionRequired === true,
    'privacy.retention.deletionRequired must be true',
  );
  const expectedDeleteBy =
    Date.parse(value.privacy.retention.createdAtUtc) +
    deleteAfterDays * 24 * 60 * 60 * 1000;
  invariant(
    Date.parse(value.privacy.retention.deleteByUtc) === expectedDeleteBy,
    'privacy.retention.deleteByUtc must match createdAtUtc + deleteAfterDays',
  );
  invariant(Array.isArray(value.captures), 'captures must be an array');
  value.captures.forEach(validateCapture);

  const captureIds = new Set<string>();
  for (const capture of value.captures) {
    invariant(
      !captureIds.has(capture.captureId),
      `duplicate captureId ${capture.captureId}`,
    );
    captureIds.add(capture.captureId);
  }
}

export function appendFaceRatioPhase1ReplayCapture(
  artifact: FaceRatioPhase1ReplayArtifact,
  capture: FaceRatioPhase1ReplayCapture,
): FaceRatioPhase1ReplayArtifact {
  validateFaceRatioPhase1ReplayArtifact(artifact);
  validateCapture(capture, artifact.captures.length);
  const existing = artifact.captures.find(
    candidate => candidate.captureId === capture.captureId,
  );

  if (existing) {
    if (canonicalJson(existing) === canonicalJson(capture)) {
      return artifact;
    }

    throw new Error(
      `captureId ${capture.captureId} already exists with a different payload`,
    );
  }

  const next: FaceRatioPhase1ReplayArtifact = {
    ...artifact,
    captures: [...artifact.captures, capture],
  };
  validateFaceRatioPhase1ReplayArtifact(next);

  return next;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function isFaceRatioPhase1ReplayArtifactExpired(
  artifact: FaceRatioPhase1ReplayArtifact,
  nowUtc: string,
): boolean {
  validateFaceRatioPhase1ReplayArtifact(artifact);
  validUtc(nowUtc, 'nowUtc');

  return (
    Date.parse(artifact.privacy.retention.deleteByUtc) <= Date.parse(nowUtc)
  );
}
