export type FaceRatioLandmark3D = {
  i: number;
  x: number;
  y: number;
  z: number;
};

declare const process: {
  env: {
    EXPO_PUBLIC_AURA_FACE_RATIO_POSE_NORMALIZATION?: string;
  };
};

export type FaceRatioTransformationMatrix = {
  layout: 'row-major';
  values: readonly number[];
};

export type FaceRatioPoseNormalizationSkippedReason =
  | 'disabled'
  | 'dimension_invalid'
  | 'landmark_count_invalid'
  | 'landmark_value_invalid'
  | 'matrix_missing'
  | 'matrix_non_affine'
  | 'matrix_non_orthogonal'
  | 'matrix_non_uniform_scale'
  | 'matrix_round_trip_invalid'
  | 'matrix_value_invalid'
  | 'matrix_singular'
  | 'matrix_reflection';

export type FaceRatioPoseNormalizationDiagnostics = {
  correctionMaxPx: number | null;
  correctionRmsPx: number | null;
  landmarkCount: number;
  matrixOrthogonalityResidual: number | null;
  matrixRotationDeterminant: number | null;
  matrixScaleSpread: number | null;
  roundTripRmsPx: number | null;
  zSpanPx: number | null;
};

export type FaceRatioPoseNormalizationOutcome = {
  applied: boolean;
  confidencePolicy: 'diagnostic_only_unvalidated';
  diagnostics: FaceRatioPoseNormalizationDiagnostics;
  method: 'mediapipe_facial_transformation_matrix' | 'none';
  requested: boolean;
  skippedReason?: FaceRatioPoseNormalizationSkippedReason;
};

type Vector3 = readonly [number, number, number];

export type FaceRatioPoseTransform = {
  axisX: Vector3;
  axisY: Vector3;
  axisZ: Vector3;
  centerPx: {x: number; y: number; z: number};
  imageHeight: number;
  imageWidth: number;
};

export type FaceRatioPoseNormalizationResult = {
  outcome: FaceRatioPoseNormalizationOutcome;
  points: FaceRatioLandmark3D[];
  transform: FaceRatioPoseTransform | null;
};

export const FACE_RATIO_POSE_NORMALIZATION_VALIDATION_FLAG = 'validation-only';

// MediaPipe describes the face pose as a rigid canonical-to-runtime mapping.
// Float32 noise should be far below these deliberately generous validation
// bounds. Uniform similarity scale is allowed; shear and axis-specific scale
// are rejected before Gram-Schmidt can hide them.
const MAX_MATRIX_ORTHOGONALITY_RESIDUAL = 0.02;
const MAX_MATRIX_ROTATION_DETERMINANT_ERROR = 0.02;
const MAX_MATRIX_SCALE_SPREAD = 0.02;
const MAX_MATRIX_AFFINE_BOTTOM_ROW_RESIDUAL = 1e-5;
const MAX_ROUND_TRIP_RMS_PX = 0.25;

export function resolveFaceRatioPoseNormalizationEnabled(
  flagValue: string | undefined,
): boolean {
  // Gate 전 제품 승격을 막기 위해 일반적인 "1"/"true"는 의도적으로 받지 않는다.
  // paired replay 관문 세션에서만 명시적인 validation-only 값을 사용한다.
  return flagValue === FACE_RATIO_POSE_NORMALIZATION_VALIDATION_FLAG;
}

export function isFaceRatioPoseNormalizationEnabled(): boolean {
  return resolveFaceRatioPoseNormalizationEnabled(
    process.env.EXPO_PUBLIC_AURA_FACE_RATIO_POSE_NORMALIZATION,
  );
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function magnitude(vector: Vector3): number {
  return Math.sqrt(dot(vector, vector));
}

function normalizeVector(vector: Vector3): Vector3 | null {
  const length = magnitude(vector);

  if (!Number.isFinite(length) || length <= 1e-12) {
    return null;
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function multiply(vector: Vector3, scalar: number): Vector3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : null;
}

function emptyDiagnostics(landmarkCount: number): FaceRatioPoseNormalizationDiagnostics {
  return {
    correctionMaxPx: null,
    correctionRmsPx: null,
    landmarkCount,
    matrixOrthogonalityResidual: null,
    matrixRotationDeterminant: null,
    matrixScaleSpread: null,
    roundTripRmsPx: null,
    zSpanPx: null,
  };
}

function skippedResult({
  points,
  reason,
  requested,
}: {
  points: readonly FaceRatioLandmark3D[];
  reason: FaceRatioPoseNormalizationSkippedReason;
  requested: boolean;
}): FaceRatioPoseNormalizationResult {
  return {
    outcome: {
      applied: false,
      confidencePolicy: 'diagnostic_only_unvalidated',
      diagnostics: emptyDiagnostics(points.length),
      method: 'none',
      requested,
      skippedReason: reason,
    },
    points: points.map(point => ({...point})),
    transform: null,
  };
}

function validateLandmarks(
  points: readonly FaceRatioLandmark3D[],
): FaceRatioPoseNormalizationSkippedReason | null {
  if (points.length !== 478) {
    return 'landmark_count_invalid';
  }

  const indices = new Set<number>();

  for (const point of points) {
    if (
      !Number.isInteger(point.i) ||
      point.i < 0 ||
      point.i >= 478 ||
      indices.has(point.i)
    ) {
      return 'landmark_count_invalid';
    }

    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      return 'landmark_value_invalid';
    }

    indices.add(point.i);
  }

  return indices.size === 478 ? null : 'landmark_count_invalid';
}

function buildTransform({
  imageHeight,
  imageWidth,
  matrix,
  points,
}: {
  imageHeight: number;
  imageWidth: number;
  matrix: FaceRatioTransformationMatrix;
  points: readonly FaceRatioLandmark3D[];
}):
  | {
      diagnostics: Pick<
        FaceRatioPoseNormalizationDiagnostics,
        | 'matrixOrthogonalityResidual'
        | 'matrixRotationDeterminant'
        | 'matrixScaleSpread'
      >;
      transform: FaceRatioPoseTransform;
    }
  | FaceRatioPoseNormalizationSkippedReason {
  if (
    matrix.layout !== 'row-major' ||
    matrix.values.length !== 16 ||
    matrix.values.some(value => !Number.isFinite(value))
  ) {
    return 'matrix_value_invalid';
  }

  const values = matrix.values;
  const affineBottomRowResidual = Math.max(
    Math.abs(values[12]),
    Math.abs(values[13]),
    Math.abs(values[14]),
    Math.abs(values[15] - 1),
  );
  if (affineBottomRowResidual > MAX_MATRIX_AFFINE_BOTTOM_ROW_RESIDUAL) {
    return 'matrix_non_affine';
  }

  // Unity Matrix4x4의 m00..m33을 row-major로 직렬화한다. 회전축은 열벡터다.
  const columnX: Vector3 = [values[0], values[4], values[8]];
  const columnY: Vector3 = [values[1], values[5], values[9]];
  const columnZ: Vector3 = [values[2], values[6], values[10]];
  const scaleX = magnitude(columnX);
  const scaleY = magnitude(columnY);
  const scaleZ = magnitude(columnZ);
  const normalizedX = normalizeVector(columnX);
  const normalizedY = normalizeVector(columnY);
  const normalizedZ = normalizeVector(columnZ);

  if (!normalizedX || !normalizedY || !normalizedZ) {
    return 'matrix_singular';
  }

  const rawDeterminant = dot(normalizedX, cross(normalizedY, normalizedZ));
  const orthogonalityResidual = Math.max(
    Math.abs(dot(normalizedX, normalizedY)),
    Math.abs(dot(normalizedX, normalizedZ)),
    Math.abs(dot(normalizedY, normalizedZ)),
  );
  const maxScale = Math.max(scaleX, scaleY, scaleZ);
  const minScale = Math.min(scaleX, scaleY, scaleZ);
  const scaleSpread = maxScale > 0 ? (maxScale - minScale) / maxScale : 0;

  if (rawDeterminant <= 0) {
    return 'matrix_reflection';
  }
  if (
    orthogonalityResidual > MAX_MATRIX_ORTHOGONALITY_RESIDUAL ||
    Math.abs(rawDeterminant - 1) > MAX_MATRIX_ROTATION_DETERMINANT_ERROR
  ) {
    return 'matrix_non_orthogonal';
  }
  if (scaleSpread > MAX_MATRIX_SCALE_SPREAD) {
    return 'matrix_non_uniform_scale';
  }

  // FaceLandmarker 행렬은 rigid/similarity transform이어야 한다. 수치 오차는
  // 위 fail-closed 검사를 통과한 뒤에만 Gram-Schmidt로 제거한다.
  const yWithoutX = subtract(normalizedY, multiply(normalizedX, dot(normalizedY, normalizedX)));
  const axisY = normalizeVector(yWithoutX);

  if (!axisY) {
    return 'matrix_singular';
  }

  const axisX = normalizedX;
  const axisZ = normalizeVector(cross(axisX, axisY));

  if (!axisZ) {
    return 'matrix_singular';
  }

  // reflection은 "정면화" 회전으로 해석할 수 없으므로 조용히 적용하지 않는다.
  if (dot(axisZ, normalizedZ) <= 0) {
    return 'matrix_reflection';
  }

  // m03/m13/m23 translation은 canonical metric 좌표계의 값이고, 여기의
  // landmark는 image-normalized 좌표다. 서로 다른 단위를 섞지 않고 관측점
  // centroid를 중심으로 R^T만 적용한다. 평행이동은 shape/ratio에 영향을 주지
  // 않으며, rigid affine 여부는 bottom row 검사로 별도 fail-closed 한다.
  const centerPx = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x * imageWidth,
      y: sum.y + point.y * imageHeight,
      z: sum.z + point.z * imageWidth,
    }),
    {x: 0, y: 0, z: 0},
  );
  centerPx.x /= points.length;
  centerPx.y /= points.length;
  centerPx.z /= points.length;

  return {
    diagnostics: {
      matrixOrthogonalityResidual: finiteOrNull(orthogonalityResidual),
      matrixRotationDeterminant: finiteOrNull(rawDeterminant),
      matrixScaleSpread: finiteOrNull(scaleSpread),
    },
    transform: {
      axisX,
      axisY,
      axisZ,
      centerPx,
      imageHeight,
      imageWidth,
    },
  };
}

function toCenteredYUpVector(
  point: Pick<FaceRatioLandmark3D, 'x' | 'y' | 'z'>,
  transform: FaceRatioPoseTransform,
): Vector3 {
  return [
    point.x * transform.imageWidth - transform.centerPx.x,
    -(point.y * transform.imageHeight - transform.centerPx.y),
    point.z * transform.imageWidth - transform.centerPx.z,
  ];
}

function fromCenteredYUpVector(
  vector: Vector3,
  transform: FaceRatioPoseTransform,
): Pick<FaceRatioLandmark3D, 'x' | 'y' | 'z'> {
  return {
    x: (transform.centerPx.x + vector[0]) / transform.imageWidth,
    y: (transform.centerPx.y - vector[1]) / transform.imageHeight,
    z: (transform.centerPx.z + vector[2]) / transform.imageWidth,
  };
}

export function applyFaceRatioPoseTransform<T extends FaceRatioLandmark3D>(
  point: T,
  transform: FaceRatioPoseTransform,
): T {
  const observed = toCenteredYUpVector(point, transform);
  // observed = R * frontal 이므로 frontal = R^T * observed.
  const frontal: Vector3 = [
    dot(transform.axisX, observed),
    dot(transform.axisY, observed),
    dot(transform.axisZ, observed),
  ];

  return {
    ...point,
    ...fromCenteredYUpVector(frontal, transform),
  };
}

function forwardProject(
  point: Pick<FaceRatioLandmark3D, 'x' | 'y' | 'z'>,
  transform: FaceRatioPoseTransform,
): Pick<FaceRatioLandmark3D, 'x' | 'y' | 'z'> {
  const frontal = toCenteredYUpVector(point, transform);
  const observed: Vector3 = [
    transform.axisX[0] * frontal[0] +
      transform.axisY[0] * frontal[1] +
      transform.axisZ[0] * frontal[2],
    transform.axisX[1] * frontal[0] +
      transform.axisY[1] * frontal[1] +
      transform.axisZ[1] * frontal[2],
    transform.axisX[2] * frontal[0] +
      transform.axisY[2] * frontal[1] +
      transform.axisZ[2] * frontal[2],
  ];

  return fromCenteredYUpVector(observed, transform);
}

function pointDistancePx(
  a: Pick<FaceRatioLandmark3D, 'x' | 'y' | 'z'>,
  b: Pick<FaceRatioLandmark3D, 'x' | 'y' | 'z'>,
  imageWidth: number,
  imageHeight: number,
): number {
  const dx = (a.x - b.x) * imageWidth;
  const dy = (a.y - b.y) * imageHeight;
  const dz = (a.z - b.z) * imageWidth;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function normalizeFaceRatioLandmarks({
  enabled,
  imageHeight,
  imageWidth,
  matrix,
  points,
}: {
  enabled: boolean;
  imageHeight: number;
  imageWidth: number;
  matrix: FaceRatioTransformationMatrix | null | undefined;
  points: readonly FaceRatioLandmark3D[];
}): FaceRatioPoseNormalizationResult {
  if (!enabled) {
    return skippedResult({points, reason: 'disabled', requested: false});
  }

  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return skippedResult({points, reason: 'dimension_invalid', requested: true});
  }

  const landmarkValidation = validateLandmarks(points);
  if (landmarkValidation) {
    return skippedResult({points, reason: landmarkValidation, requested: true});
  }

  if (!matrix) {
    return skippedResult({points, reason: 'matrix_missing', requested: true});
  }

  const built = buildTransform({imageHeight, imageWidth, matrix, points});
  if (typeof built === 'string') {
    return skippedResult({points, reason: built, requested: true});
  }

  const normalizedPoints = points.map(point =>
    applyFaceRatioPoseTransform(point, built.transform),
  );
  let correctionSquaredSum = 0;
  let correctionMax = 0;
  let roundTripSquaredSum = 0;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  normalizedPoints.forEach((point, index) => {
    const original = points[index];
    const correction = pointDistancePx(
      point,
      original,
      imageWidth,
      imageHeight,
    );
    // 같은 승인된 R/R^T 구현의 수치적 역연산 진단일 뿐, matrix와 landmark가
    // 독립적으로 서로 대응한다는 증거는 아니다.
    const reprojected = forwardProject(point, built.transform);
    const roundTrip = pointDistancePx(
      reprojected,
      original,
      imageWidth,
      imageHeight,
    );
    correctionSquaredSum += correction * correction;
    correctionMax = Math.max(correctionMax, correction);
    roundTripSquaredSum += roundTrip * roundTrip;
    minZ = Math.min(minZ, original.z * imageWidth);
    maxZ = Math.max(maxZ, original.z * imageWidth);
  });

  const roundTripRmsPx = Math.sqrt(roundTripSquaredSum / normalizedPoints.length);
  if (
    !Number.isFinite(roundTripRmsPx) ||
    roundTripRmsPx > MAX_ROUND_TRIP_RMS_PX
  ) {
    return skippedResult({
      points,
      reason: 'matrix_round_trip_invalid',
      requested: true,
    });
  }

  return {
    outcome: {
      applied: true,
      confidencePolicy: 'diagnostic_only_unvalidated',
      diagnostics: {
        correctionMaxPx: finiteOrNull(correctionMax),
        correctionRmsPx: finiteOrNull(
          Math.sqrt(correctionSquaredSum / normalizedPoints.length),
        ),
        landmarkCount: normalizedPoints.length,
        ...built.diagnostics,
        roundTripRmsPx: finiteOrNull(roundTripRmsPx),
        zSpanPx: finiteOrNull(maxZ - minZ),
      },
      method: 'mediapipe_facial_transformation_matrix',
      requested: true,
    },
    points: normalizedPoints,
    transform: built.transform,
  };
}
