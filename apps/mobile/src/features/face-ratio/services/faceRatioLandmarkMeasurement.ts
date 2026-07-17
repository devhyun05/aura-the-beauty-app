import type {FaceRatioLandmark3D} from './faceRatioPoseNormalization';

export type FaceRatioStructuralPointKey = 'glabella' | 'menton' | 'subnasale';

export type FaceRatioMeasurementGeometry = {
  debugPoints: Partial<Record<string, FaceRatioLandmark3D>>;
  keypoints: Partial<Record<FaceRatioStructuralPointKey, FaceRatioLandmark3D>>;
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function averagePoint(
  points: ReadonlyMap<number, FaceRatioLandmark3D>,
  indices: readonly number[],
  syntheticIndex: number,
): FaceRatioLandmark3D | null {
  const selected = indices
    .map(index => points.get(index))
    .filter((point): point is FaceRatioLandmark3D => Boolean(point));

  if (selected.length === 0) {
    return null;
  }

  return {
    i: syntheticIndex,
    x: selected.reduce((sum, point) => sum + point.x, 0) / selected.length,
    y: selected.reduce((sum, point) => sum + point.y, 0) / selected.length,
    z: selected.reduce((sum, point) => sum + point.z, 0) / selected.length,
  };
}

function medianPoint(
  points: readonly (FaceRatioLandmark3D | null | undefined)[],
  syntheticIndex: number,
): FaceRatioLandmark3D | null {
  const selected = points.filter(
    (point): point is FaceRatioLandmark3D => Boolean(point),
  );

  if (selected.length === 0) {
    return null;
  }

  return {
    i: syntheticIndex,
    x: median(selected.map(point => point.x)),
    y: median(selected.map(point => point.y)),
    z: median(selected.map(point => point.z)),
  };
}

function bottomContourPoint(
  centerCandidates: readonly (FaceRatioLandmark3D | null | undefined)[],
  bottomCandidates: readonly (FaceRatioLandmark3D | null | undefined)[],
  syntheticIndex: number,
): FaceRatioLandmark3D | null {
  const center = centerCandidates.filter(
    (point): point is FaceRatioLandmark3D => Boolean(point),
  );
  const bottom = bottomCandidates.filter(
    (point): point is FaceRatioLandmark3D => Boolean(point),
  );
  const xzSource = center.length > 0 ? center : bottom;

  if (xzSource.length === 0 || bottom.length === 0) {
    return null;
  }

  return {
    i: syntheticIndex,
    x: median(xzSource.map(point => point.x)),
    y: Math.max(...bottom.map(point => point.y)),
    z: median(xzSource.map(point => point.z)),
  };
}

export function extractFaceRatioMeasurementGeometry(
  landmarks: readonly FaceRatioLandmark3D[],
): FaceRatioMeasurementGeometry {
  const points = new Map<number, FaceRatioLandmark3D>();

  for (const landmark of landmarks) {
    if (
      Number.isInteger(landmark.i) &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      Number.isFinite(landmark.z)
    ) {
      points.set(landmark.i, landmark);
    }
  }

  const leftInnerBrow = averagePoint(points, [107, 55, 65], -107);
  const rightInnerBrow = averagePoint(points, [336, 285, 295], -336);
  const glabella = medianPoint(
    [points.get(9), points.get(151), leftInnerBrow, rightInnerBrow],
    -1,
  );
  const subnasale = medianPoint(
    [points.get(2), points.get(97), points.get(326)],
    -2,
  );
  const menton = bottomContourPoint(
    [points.get(148), points.get(152), points.get(377)],
    [
      points.get(148),
      points.get(152),
      points.get(176),
      points.get(377),
      points.get(400),
    ],
    -3,
  );
  const debugPoints: FaceRatioMeasurementGeometry['debugPoints'] = {};

  for (const index of [9, 10, 151, 234, 454, 2, 97, 326, 148, 152, 176, 377, 400]) {
    const point = points.get(index);
    if (point) {
      debugPoints[`idx${index}`] = point;
    }
  }
  if (leftInnerBrow) {
    debugPoints.leftInnerBrow = leftInnerBrow;
  }
  if (rightInnerBrow) {
    debugPoints.rightInnerBrow = rightInnerBrow;
  }

  return {
    debugPoints,
    keypoints: {
      ...(glabella ? {glabella} : {}),
      ...(menton ? {menton} : {}),
      ...(subnasale ? {subnasale} : {}),
    },
  };
}
