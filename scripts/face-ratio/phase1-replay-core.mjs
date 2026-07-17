import {
  PHASE1_REPLAY_SHOTS,
  phase1ReplayConditionsMatch,
} from './phase1-replay-shot-plan.mjs';

export const PHASE1_REPLAY_SCHEMA_VERSION =
  'aura-face-ratio-phase1-replay/v1';

const SUBJECT_ID_PATTERN = /^subj_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CAPTURE_ID_PATTERN = /^cap_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const COHORT_ID_PATTERN = /^cohort_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SESSION_ID_PATTERN = /^session_[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function isLocalPseudonymousSubjectId(value) {
  return (
    typeof value === 'string' &&
    SUBJECT_ID_PATTERN.test(value) &&
    !value.startsWith('subj_user_') &&
    !value.includes('@') &&
    !/\s/.test(value)
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function exactKeys(record, allowed, label) {
  for (const key of Object.keys(record)) {
    invariant(allowed.includes(key), `${label}.${key} is not allowed`);
  }
}

function finiteNumber(value, label) {
  invariant(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
}

function utcTimestamp(value, label) {
  invariant(
    typeof value === 'string' && Number.isFinite(Date.parse(value)),
    `${label} must be an ISO timestamp`,
  );
}

export function createEmptyPhase1ReplayArtifact({
  cohortId,
  createdAtUtc = new Date().toISOString(),
  deleteAfterDays = 30,
  sessionId,
}) {
  invariant(COHORT_ID_PATTERN.test(cohortId), 'cohortId must be pseudonymous cohort_*');
  invariant(
    SESSION_ID_PATTERN.test(sessionId),
    'sessionId must be pseudonymous session_*',
  );
  utcTimestamp(createdAtUtc, 'createdAtUtc');
  invariant(
    Number.isInteger(deleteAfterDays) &&
      deleteAfterDays >= 1 &&
      deleteAfterDays <= 30,
    'deleteAfterDays must be an integer in [1, 30]',
  );
  const createdAtMs = Date.parse(createdAtUtc);

  return {
    schemaVersion: PHASE1_REPLAY_SCHEMA_VERSION,
    artifactClass: 'local-validation-only',
    cohortId,
    sessionId,
    privacy: {
      localOnly: true,
      productPayloadIncluded: false,
      pseudonymousSubjects: true,
      rawFaceDataIncluded: true,
      sourceImagesIncluded: false,
      retention: {
        createdAtUtc: new Date(createdAtMs).toISOString(),
        deleteAfterDays,
        deleteByUtc: new Date(
          createdAtMs + deleteAfterDays * 24 * 60 * 60 * 1000,
        ).toISOString(),
        deletionRequired: true,
      },
    },
    captures: [],
  };
}

function validatePrivacy(privacy) {
  invariant(isRecord(privacy), 'privacy must be an object');
  exactKeys(
    privacy,
    [
      'localOnly',
      'productPayloadIncluded',
      'pseudonymousSubjects',
      'rawFaceDataIncluded',
      'sourceImagesIncluded',
      'retention',
    ],
    'privacy',
  );
  invariant(privacy.localOnly === true, 'privacy.localOnly must be true');
  invariant(
    privacy.productPayloadIncluded === false,
    'privacy.productPayloadIncluded must be false',
  );
  invariant(
    privacy.pseudonymousSubjects === true,
    'privacy.pseudonymousSubjects must be true',
  );
  invariant(
    privacy.rawFaceDataIncluded === true,
    'privacy.rawFaceDataIncluded must acknowledge raw face data',
  );
  invariant(
    privacy.sourceImagesIncluded === false,
    'privacy.sourceImagesIncluded must be false',
  );
  invariant(isRecord(privacy.retention), 'privacy.retention must be an object');
  exactKeys(
    privacy.retention,
    ['createdAtUtc', 'deleteAfterDays', 'deleteByUtc', 'deletionRequired'],
    'privacy.retention',
  );
  utcTimestamp(
    privacy.retention.createdAtUtc,
    'privacy.retention.createdAtUtc',
  );
  utcTimestamp(privacy.retention.deleteByUtc, 'privacy.retention.deleteByUtc');
  invariant(
    Number.isInteger(privacy.retention.deleteAfterDays) &&
      privacy.retention.deleteAfterDays >= 1 &&
      privacy.retention.deleteAfterDays <= 30,
    'privacy.retention.deleteAfterDays must be in [1, 30]',
  );
  invariant(
    privacy.retention.deletionRequired === true,
    'privacy.retention.deletionRequired must be true',
  );
  invariant(
    Date.parse(privacy.retention.deleteByUtc) ===
      Date.parse(privacy.retention.createdAtUtc) +
        privacy.retention.deleteAfterDays * 24 * 60 * 60 * 1000,
    'privacy.retention.deleteByUtc must match createdAtUtc + deleteAfterDays',
  );
}

function validateCondition(condition, label) {
  invariant(isRecord(condition), `${label} must be an object`);
  exactKeys(
    condition,
    ['distanceLabel', 'isReference', 'poseLabel', 'repeatGroup', 'repeatIndex'],
    label,
  );
  invariant(
    typeof condition.distanceLabel === 'string' && condition.distanceLabel.length > 0,
    `${label}.distanceLabel is required`,
  );
  invariant(typeof condition.isReference === 'boolean', `${label}.isReference is required`);
  invariant(
    typeof condition.poseLabel === 'string' && condition.poseLabel.length > 0,
    `${label}.poseLabel is required`,
  );
  invariant(
    typeof condition.repeatGroup === 'string' && condition.repeatGroup.length > 0,
    `${label}.repeatGroup is required`,
  );
  invariant(
    Number.isInteger(condition.repeatIndex) && condition.repeatIndex >= 1,
    `${label}.repeatIndex must be >= 1`,
  );
}

function validateAcquisition(acquisition, label) {
  invariant(isRecord(acquisition), `${label} must be an object`);
  exactKeys(
    acquisition,
    ['cameraFacing', 'captureImplementation', 'source'],
    label,
  );
  invariant(acquisition.source === 'camera', `${label}.source must be camera`);
  invariant(
    acquisition.captureImplementation === 'native',
    `${label}.captureImplementation must be native`,
  );
  invariant(
    acquisition.cameraFacing === 'front',
    `${label}.cameraFacing must be front`,
  );
}

function validateMatrix(matrix, label) {
  invariant(isRecord(matrix), `${label} must be an object`);
  exactKeys(matrix, ['layout', 'values'], label);
  invariant(matrix.layout === 'row-major', `${label}.layout must be row-major`);
  invariant(
    Array.isArray(matrix.values) && matrix.values.length === 16,
    `${label}.values must have 16 entries`,
  );
  matrix.values.forEach((value, index) =>
    finiteNumber(value, `${label}.values[${index}]`),
  );
}

function validateLandmarks(landmarks, label) {
  invariant(
    Array.isArray(landmarks) && landmarks.length === 478,
    `${label} must contain exactly 478 points`,
  );
  const indices = new Set();

  landmarks.forEach((landmark, position) => {
    invariant(isRecord(landmark), `${label}[${position}] must be an object`);
    exactKeys(landmark, ['i', 'x', 'y', 'z'], `${label}[${position}]`);
    invariant(
      Number.isInteger(landmark.i) && landmark.i >= 0 && landmark.i < 478,
      `${label}[${position}].i must be in [0, 477]`,
    );
    invariant(!indices.has(landmark.i), `${label} contains duplicate index ${landmark.i}`);
    indices.add(landmark.i);
    finiteNumber(landmark.x, `${label}[${position}].x`);
    finiteNumber(landmark.y, `${label}[${position}].y`);
    finiteNumber(landmark.z, `${label}[${position}].z`);
  });
  invariant(indices.size === 478, `${label} must contain every index exactly once`);
}

function validateHairline(hairline, label) {
  invariant(isRecord(hairline), `${label} must be an object`);
  exactKeys(hairline, ['confidence', 'provider', 'x', 'y', 'zProxy'], label);
  finiteNumber(hairline.x, `${label}.x`);
  finiteNumber(hairline.y, `${label}.y`);
  invariant(
    hairline.x >= 0 &&
      hairline.x <= 1 &&
      hairline.y >= 0 &&
      hairline.y <= 1,
    `${label}.x/y must be normalized to [0, 1]`,
  );
  finiteNumber(hairline.confidence, `${label}.confidence`);
  invariant(
    hairline.confidence >= 0 && hairline.confidence <= 1,
    `${label}.confidence must be in [0, 1]`,
  );
  invariant(
    typeof hairline.provider === 'string' && hairline.provider.length > 0,
    `${label}.provider is required`,
  );
  if (hairline.zProxy !== undefined) {
    finiteNumber(hairline.zProxy, `${label}.zProxy`);
  }
}

function validateCapture(capture, index) {
  const label = `captures[${index}]`;
  invariant(isRecord(capture), `${label} must be an object`);
  exactKeys(
    capture,
    [
      'acquisition',
      'captureId',
      'capturedAtUtc',
      'subjectId',
      'condition',
      'imageWidth',
      'imageHeight',
      'landmarks',
      'transformationMatrix',
      'hairline',
    ],
    label,
  );
  validateAcquisition(capture.acquisition, `${label}.acquisition`);
  invariant(
    CAPTURE_ID_PATTERN.test(capture.captureId),
    `${label}.captureId must be pseudonymous cap_*`,
  );
  utcTimestamp(capture.capturedAtUtc, `${label}.capturedAtUtc`);
  invariant(
    isLocalPseudonymousSubjectId(capture.subjectId),
    `${label}.subjectId must be a local pseudonymous subj_* identifier and must not use subj_user_*`,
  );
  validateCondition(capture.condition, `${label}.condition`);
  finiteNumber(capture.imageWidth, `${label}.imageWidth`);
  finiteNumber(capture.imageHeight, `${label}.imageHeight`);
  invariant(
    capture.imageWidth > 0 && capture.imageHeight > 0,
    `${label} dimensions must be positive`,
  );
  validateLandmarks(capture.landmarks, `${label}.landmarks`);
  validateMatrix(capture.transformationMatrix, `${label}.transformationMatrix`);
  if (capture.hairline !== undefined) {
    validateHairline(capture.hairline, `${label}.hairline`);
  }
}

export function validatePhase1ReplayArtifact(
  value,
  {requireReplayReady = false} = {},
) {
  invariant(isRecord(value), 'artifact must be an object');
  exactKeys(
    value,
    [
      'schemaVersion',
      'artifactClass',
      'cohortId',
      'sessionId',
      'privacy',
      'captures',
    ],
    'artifact',
  );
  invariant(
    value.schemaVersion === PHASE1_REPLAY_SCHEMA_VERSION,
    `schemaVersion must be ${PHASE1_REPLAY_SCHEMA_VERSION}`,
  );
  invariant(
    value.artifactClass === 'local-validation-only',
    'artifactClass must be local-validation-only',
  );
  invariant(COHORT_ID_PATTERN.test(value.cohortId), 'cohortId must be pseudonymous cohort_*');
  invariant(
    SESSION_ID_PATTERN.test(value.sessionId),
    'sessionId must be pseudonymous session_*',
  );
  validatePrivacy(value.privacy);
  invariant(Array.isArray(value.captures), 'captures must be an array');
  value.captures.forEach(validateCapture);

  const captureIds = new Set();
  const bySubject = new Map();
  for (const capture of value.captures) {
    invariant(!captureIds.has(capture.captureId), `duplicate captureId ${capture.captureId}`);
    captureIds.add(capture.captureId);
    const subjectCaptures = bySubject.get(capture.subjectId) ?? [];
    subjectCaptures.push(capture);
    bySubject.set(capture.subjectId, subjectCaptures);
  }

  if (requireReplayReady) {
    invariant(
      bySubject.size > 0,
      'replay requires at least one complete 10-shot subject',
    );
    for (const [subjectId, captures] of bySubject) {
      invariant(
        captures.length === 10,
        `${subjectId} requires exactly 10 ordered Phase 1 captures`,
      );
      captures.forEach((capture, index) => {
        const expectedShot = PHASE1_REPLAY_SHOTS[index];
        invariant(
          phase1ReplayConditionsMatch(
            capture.condition,
            expectedShot.condition,
          ),
          `${subjectId} capture ${index + 1} condition must match canonical ` +
            `Phase 1 shot ${expectedShot.collection.shotId}; ` +
            `expected ${JSON.stringify(expectedShot.condition)}, ` +
            `received ${JSON.stringify(capture.condition)}`,
        );
      });
      const references = captures.filter(
        capture => capture.condition.isReference,
      );
      invariant(
        references.length === 2,
        `${subjectId} requires exactly two frontal/standard reference captures (A/B)`,
      );
      invariant(
        captures[0].condition.isReference &&
          captures[captures.length - 1].condition.isReference,
        `${subjectId} reference A/B must be the first and tenth captures`,
      );
      invariant(
        references.every(
          capture =>
            capture.condition.distanceLabel === 'standard' &&
            capture.condition.poseLabel === 'frontal',
        ),
        `${subjectId} reference A/B must both be frontal at standard distance`,
      );
      invariant(
        new Set(
          references.map(capture => capture.condition.repeatGroup),
        ).size === 1 &&
          references
            .map(capture => capture.condition.repeatIndex)
            .sort((left, right) => left - right)
            .join(',') === '1,2',
        `${subjectId} reference A/B must share one repeatGroup with indices 1 and 2`,
      );
    }
  }

  return value;
}

export function appendPhase1ReplayCapture(artifact, capture) {
  validatePhase1ReplayArtifact(artifact);
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

  const next = {
    ...artifact,
    captures: [...artifact.captures, capture],
  };
  validatePhase1ReplayArtifact(next);
  return next;
}

export function isPhase1ReplayArtifactExpired(
  artifact,
  nowUtc = new Date().toISOString(),
) {
  validatePhase1ReplayArtifact(artifact);
  utcTimestamp(nowUtc, 'nowUtc');
  return (
    Date.parse(nowUtc) >=
    Date.parse(artifact.privacy.retention.deleteByUtc)
  );
}

function canonicalJson(value) {
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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mad(values) {
  if (values.length === 0) {
    return null;
  }
  const center = median(values);
  return median(values.map(value => Math.abs(value - center)));
}

function mean(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function round(value) {
  return value === null || value === undefined ? null : Number(value.toFixed(8));
}

function measurementsFor({
  applyTransform,
  geometry,
  hairline,
  imageHeight,
  imageWidth,
  transform,
}) {
  const G = geometry.keypoints.glabella;
  const Sn = geometry.keypoints.subnasale;
  const Me = geometry.keypoints.menton;
  const left = geometry.debugPoints.idx234;
  const right = geometry.debugPoints.idx454;
  const output = {};

  if (G && Sn && Me) {
    const middlePx = (Sn.y - G.y) * imageHeight;
    const lowerPx = (Me.y - Sn.y) * imageHeight;
    if (middlePx > 0 && lowerPx > 0) {
      output.lowerToMiddleRatio = lowerPx / middlePx;
    }
  }

  let measurementHairline = hairline;
  if (hairline && transform) {
    invariant(
      typeof hairline.zProxy === 'number' && Number.isFinite(hairline.zProxy),
      'pose-normalized replay requires hairline.zProxy from the raw capture frame',
    );
    measurementHairline = applyTransform(
      {i: -10, x: hairline.x, y: hairline.y, z: hairline.zProxy},
      transform,
    );
  }

  if (G && measurementHairline) {
    const upperPx = (G.y - measurementHairline.y) * imageHeight;
    const middlePx = Sn ? (Sn.y - G.y) * imageHeight : 0;
    if (upperPx > 0 && middlePx > 0) {
      output.upperToMiddleRatio = upperPx / middlePx;
    }
  }

  if (Me && measurementHairline && left && right) {
    const heightPx = (Me.y - measurementHairline.y) * imageHeight;
    const widthPx = Math.abs(right.x - left.x) * imageWidth;
    if (heightPx > 0 && widthPx > 0) {
      output.faceLengthRatio = heightPx / widthPx;
    }
  }

  const anchorPixels = {};
  for (const [key, point] of Object.entries({G, Me, Sn})) {
    if (point) {
      anchorPixels[key] = {
        x: point.x * imageWidth,
        y: point.y * imageHeight,
      };
    }
  }

  return {anchorPixels, values: output};
}

function summarizeMetric(subjectCaptures, metricName) {
  const references = subjectCaptures.filter(capture => capture.isReference);
  const rawValues = subjectCaptures
    .map(capture => capture.raw.values[metricName])
    .filter(Number.isFinite);
  const normalizedValues = subjectCaptures
    .map(capture => capture.normalized.values[metricName])
    .filter(Number.isFinite);
  const rawReferenceValues = references
    .map(capture => capture.raw.values[metricName])
    .filter(Number.isFinite);
  const normalizedReferenceValues = references
    .map(capture => capture.normalized.values[metricName])
    .filter(Number.isFinite);

  if (
    rawValues.length !== subjectCaptures.length ||
    normalizedValues.length !== subjectCaptures.length ||
    rawReferenceValues.length !== 2 ||
    normalizedReferenceValues.length !== 2
  ) {
    return null;
  }

  const rawReference = median(rawReferenceValues);
  const normalizedReference = median(normalizedReferenceValues);
  return {
    rawMad: mad(rawValues),
    normalizedMad: mad(normalizedValues),
    rawMaeToReference: mean(
      subjectCaptures.map(capture =>
        Math.abs(capture.raw.values[metricName] - rawReference),
      ),
    ),
    normalizedMaeToReference: mean(
      subjectCaptures.map(capture =>
        Math.abs(capture.normalized.values[metricName] - normalizedReference),
      ),
    ),
    rawReferencePairDrift: Math.abs(
      rawReferenceValues[0] - rawReferenceValues[1],
    ),
    normalizedReferencePairDrift: Math.abs(
      normalizedReferenceValues[0] - normalizedReferenceValues[1],
    ),
  };
}

function summarizeJitter(subjectCaptures) {
  const groups = new Map();
  for (const capture of subjectCaptures) {
    const list = groups.get(capture.repeatGroup) ?? [];
    list.push(capture);
    groups.set(capture.repeatGroup, list);
  }

  const raw = [];
  const normalized = [];
  for (const captures of groups.values()) {
    if (captures.length < 2) {
      continue;
    }
    for (const anchor of ['G', 'Sn', 'Me']) {
      const rawPoints = captures.map(capture => capture.raw.anchorPixels[anchor]);
      const normalizedPoints = captures.map(
        capture => capture.normalized.anchorPixels[anchor],
      );
      if (rawPoints.every(Boolean) && normalizedPoints.every(Boolean)) {
        raw.push(
          Math.hypot(
            mad(rawPoints.map(point => point.x)),
            mad(rawPoints.map(point => point.y)),
          ),
        );
        normalized.push(
          Math.hypot(
            mad(normalizedPoints.map(point => point.x)),
            mad(normalizedPoints.map(point => point.y)),
          ),
        );
      }
    }
  }

  return {
    rawAnchorMadPx: mean(raw),
    normalizedAnchorMadPx: mean(normalized),
    evaluatedAnchorGroups: raw.length,
  };
}

export function evaluatePhase1ReplayArtifact(
  artifact,
  {
    applyFaceRatioPoseTransform,
    extractFaceRatioMeasurementGeometry,
    normalizeFaceRatioLandmarks,
  },
) {
  validatePhase1ReplayArtifact(artifact, {requireReplayReady: true});
  const evaluated = [];
  let maxRoundTripRmsPx = 0;

  for (const capture of artifact.captures) {
    const normalization = normalizeFaceRatioLandmarks({
      enabled: true,
      imageHeight: capture.imageHeight,
      imageWidth: capture.imageWidth,
      matrix: capture.transformationMatrix,
      points: capture.landmarks,
    });
    invariant(
      normalization.outcome.applied && normalization.transform,
      `${capture.captureId} normalization failed: ${
        normalization.outcome.skippedReason ?? 'unknown'
      }`,
    );
    maxRoundTripRmsPx = Math.max(
      maxRoundTripRmsPx,
      normalization.outcome.diagnostics.roundTripRmsPx ?? 0,
    );
    const rawGeometry = extractFaceRatioMeasurementGeometry(capture.landmarks);
    const normalizedGeometry = extractFaceRatioMeasurementGeometry(
      normalization.points,
    );
    evaluated.push({
      captureId: capture.captureId,
      isReference: capture.condition.isReference,
      repeatGroup: capture.condition.repeatGroup,
      subjectId: capture.subjectId,
      raw: measurementsFor({
        applyTransform: applyFaceRatioPoseTransform,
        geometry: rawGeometry,
        hairline: capture.hairline ?? null,
        imageHeight: capture.imageHeight,
        imageWidth: capture.imageWidth,
        transform: null,
      }),
      normalized: measurementsFor({
        applyTransform: applyFaceRatioPoseTransform,
        geometry: normalizedGeometry,
        hairline: capture.hairline ?? null,
        imageHeight: capture.imageHeight,
        imageWidth: capture.imageWidth,
        transform: normalization.transform,
      }),
    });
  }

  const bySubject = new Map();
  for (const capture of evaluated) {
    const list = bySubject.get(capture.subjectId) ?? [];
    list.push(capture);
    bySubject.set(capture.subjectId, list);
  }

  const metricNames = [
    'lowerToMiddleRatio',
    'upperToMiddleRatio',
    'faceLengthRatio',
  ];
  const subjectSummaries = [];
  for (const [subjectId, captures] of bySubject) {
    const metrics = {};
    for (const metricName of metricNames) {
      const summary = summarizeMetric(captures, metricName);
      if (summary) {
        metrics[metricName] = Object.fromEntries(
          Object.entries(summary).map(([key, value]) => [key, round(value)]),
        );
      }
    }
    const jitter = summarizeJitter(captures);
    subjectSummaries.push({
      subjectId,
      metrics,
      jitter: {
        evaluatedAnchorGroups: jitter.evaluatedAnchorGroups,
        rawAnchorMadPx: round(jitter.rawAnchorMadPx),
        normalizedAnchorMadPx: round(jitter.normalizedAnchorMadPx),
      },
    });
  }

  const aggregateMetrics = {};
  for (const metricName of metricNames) {
    const summaries = subjectSummaries
      .map(subject => subject.metrics[metricName])
      .filter(Boolean);
    if (summaries.length === 0) {
      continue;
    }
    aggregateMetrics[metricName] = {
      rawMad: round(mean(summaries.map(summary => summary.rawMad))),
      normalizedMad: round(
        mean(summaries.map(summary => summary.normalizedMad)),
      ),
      rawMaeToReference: round(
        mean(summaries.map(summary => summary.rawMaeToReference)),
      ),
      normalizedMaeToReference: round(
        mean(summaries.map(summary => summary.normalizedMaeToReference)),
      ),
      rawReferencePairDrift: round(
        mean(summaries.map(summary => summary.rawReferencePairDrift)),
      ),
      normalizedReferencePairDrift: round(
        mean(summaries.map(summary => summary.normalizedReferencePairDrift)),
      ),
    };
  }

  const requiredMetrics = ['lowerToMiddleRatio', 'faceLengthRatio'];
  const missingMetrics = requiredMetrics.filter(
    metricName => !aggregateMetrics[metricName],
  );
  const regressions = [];
  const nonImprovements = [];

  for (const [metricName, summary] of Object.entries(aggregateMetrics)) {
    const madDelta = summary.normalizedMad - summary.rawMad;
    const maeDelta =
      summary.normalizedMaeToReference - summary.rawMaeToReference;
    if (madDelta > 0 || maeDelta > 0) {
      regressions.push(metricName);
    } else if (!(madDelta < 0 && maeDelta < 0)) {
      nonImprovements.push(metricName);
    }
  }

  const status =
    missingMetrics.length > 0
      ? 'INSUFFICIENT_DATA'
      : regressions.length > 0 || nonImprovements.length > 0
        ? 'NO_GO'
        : 'GO';

  return {
    schemaVersion: 'aura-face-ratio-phase1-replay-report/v1',
    sourceSchemaVersion: artifact.schemaVersion,
    cohortId: artifact.cohortId,
    generatedFromLocalRawArtifact: true,
    productPayloadIncluded: false,
    subjectCount: bySubject.size,
    captureCount: evaluated.length,
    diagnostics: {
      maxRoundTripRmsPx: round(maxRoundTripRmsPx),
    },
    aggregateMetrics,
    subjectSummaries,
    gate: {
      status,
      missingMetrics,
      regressions,
      nonImprovements,
      rule:
        'GO requires both MAD and MAE-to-the-median-of-own-frontal-reference-A/B to strictly decrease for every evaluable metric; both references are included in the MAE denominator and no absolute confidence is inferred.',
    },
  };
}
