import {
  applyFaceRatioPoseTransform,
  FACE_RATIO_POSE_NORMALIZATION_VALIDATION_FLAG,
  normalizeFaceRatioLandmarks,
  resolveFaceRatioPoseNormalizationEnabled,
  type FaceRatioLandmark3D,
  type FaceRatioTransformationMatrix,
} from './faceRatioPoseNormalization';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectClose(
  actual: number,
  expected: number,
  tolerance: number,
  message: string,
) {
  expect(
    Math.abs(actual - expected) <= tolerance,
    `${message} (actual=${actual}, expected=${expected})`,
  );
}

function rotationMatrix({
  pitchDeg,
  rollDeg,
  yawDeg,
}: {
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
}): FaceRatioTransformationMatrix {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);

  // Rz(roll) * Ry(yaw) * Rx(pitch), row-major.
  return {
    layout: 'row-major',
    values: [
      cz * cy,
      cz * sy * sx - sz * cx,
      cz * sy * cx + sz * sx,
      0,
      sz * cy,
      sz * sy * sx + cz * cx,
      sz * sy * cx - cz * sx,
      0,
      -sy,
      cy * sx,
      cy * cx,
      0,
      0,
      0,
      0,
      1,
    ],
  };
}

function makeFrontalLandmarks(): FaceRatioLandmark3D[] {
  return Array.from({length: 478}, (_, i) => ({
    i,
    x: 0.5 + ((i % 23) - 11) * 0.002,
    y: 0.5 + ((Math.floor(i / 23) % 21) - 10) * 0.0025,
    z: ((i % 17) - 8) * 0.0015,
  }));
}

function poseLandmarks(
  frontal: readonly FaceRatioLandmark3D[],
  matrix: FaceRatioTransformationMatrix,
  imageWidth: number,
  imageHeight: number,
): FaceRatioLandmark3D[] {
  const values = matrix.values;
  const center = frontal.reduce(
    (sum, point) => ({
      x: sum.x + point.x * imageWidth,
      y: sum.y + point.y * imageHeight,
      z: sum.z + point.z * imageWidth,
    }),
    {x: 0, y: 0, z: 0},
  );
  center.x /= frontal.length;
  center.y /= frontal.length;
  center.z /= frontal.length;

  return frontal.map(point => {
    const x = point.x * imageWidth - center.x;
    const y = -(point.y * imageHeight - center.y);
    const z = point.z * imageWidth - center.z;
    const posedX = values[0] * x + values[1] * y + values[2] * z;
    const posedY = values[4] * x + values[5] * y + values[6] * z;
    const posedZ = values[8] * x + values[9] * y + values[10] * z;

    return {
      i: point.i,
      x: (center.x + posedX) / imageWidth,
      y: (center.y - posedY) / imageHeight,
      z: (center.z + posedZ) / imageWidth,
    };
  });
}

expect(
  !resolveFaceRatioPoseNormalizationEnabled(undefined) &&
    !resolveFaceRatioPoseNormalizationEnabled('1') &&
    !resolveFaceRatioPoseNormalizationEnabled('true') &&
    resolveFaceRatioPoseNormalizationEnabled(
      FACE_RATIO_POSE_NORMALIZATION_VALIDATION_FLAG,
    ),
  'Pose normalization must remain OFF unless the explicit validation-only flag is used.',
);

const imageWidth = 1080;
const imageHeight = 1440;
const matrix = rotationMatrix({pitchDeg: 10, yawDeg: -7, rollDeg: 4});
const frontal = makeFrontalLandmarks();
const posed = poseLandmarks(frontal, matrix, imageWidth, imageHeight);
const normalized = normalizeFaceRatioLandmarks({
  enabled: true,
  imageHeight,
  imageWidth,
  matrix,
  points: posed,
});

expect(normalized.outcome.applied, 'A complete finite 478-point sample must normalize.');
expect(
  normalized.outcome.confidencePolicy === 'diagnostic_only_unvalidated',
  'Normalization diagnostics must not masquerade as calibrated landmark confidence.',
);
expect(
  normalized.outcome.diagnostics.landmarkCount === 478 &&
    (normalized.outcome.diagnostics.roundTripRmsPx ?? 1) < 1e-8,
  'Normalization must retain all points and round-trip through the matrix.',
);

for (const index of [0, 2, 9, 10, 97, 152, 234, 326, 454, 477]) {
  expectClose(normalized.points[index].x, frontal[index].x, 1e-10, `x ${index}`);
  expectClose(normalized.points[index].y, frontal[index].y, 1e-10, `y ${index}`);
  expectClose(normalized.points[index].z, frontal[index].z, 1e-10, `z ${index}`);
}

const disabled = normalizeFaceRatioLandmarks({
  enabled: false,
  imageHeight,
  imageWidth,
  matrix,
  points: posed,
});
expect(
  !disabled.outcome.applied &&
    disabled.outcome.skippedReason === 'disabled' &&
    disabled.points[10].x === posed[10].x,
  'Default-OFF path must preserve the original landmark frame.',
);

const missingPoint = normalizeFaceRatioLandmarks({
  enabled: true,
  imageHeight,
  imageWidth,
  matrix,
  points: posed.slice(0, 477),
});
expect(
  !missingPoint.outcome.applied &&
    missingPoint.outcome.skippedReason === 'landmark_count_invalid',
  'Correction must fail closed unless all 478 unique landmarks are present.',
);

const missingMatrix = normalizeFaceRatioLandmarks({
  enabled: true,
  imageHeight,
  imageWidth,
  matrix: null,
  points: posed,
});
expect(
  !missingMatrix.outcome.applied &&
    missingMatrix.outcome.skippedReason === 'matrix_missing',
  'Correction must fail closed when the facial transformation matrix is absent.',
);

const syntheticHairline = applyFaceRatioPoseTransform(
  {...posed[10], i: -10, y: posed[10].y - 0.04},
  normalized.transform!,
);
expect(
  Number.isFinite(syntheticHairline.x) &&
    Number.isFinite(syntheticHairline.y) &&
    Number.isFinite(syntheticHairline.z),
  'The same transform must support an external hairline point with an explicit z proxy.',
);

console.log('faceRatioPoseNormalization tests passed');
