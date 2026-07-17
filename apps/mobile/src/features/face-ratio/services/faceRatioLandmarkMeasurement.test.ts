import {extractFaceRatioMeasurementGeometry} from './faceRatioLandmarkMeasurement';
import type {FaceRatioLandmark3D} from './faceRatioPoseNormalization';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const points: FaceRatioLandmark3D[] = Array.from({length: 478}, (_, i) => ({
  i,
  x: 0.5,
  y: 0.5,
  z: 0,
}));

function set(index: number, x: number, y: number, z = 0) {
  points[index] = {i: index, x, y, z};
}

set(9, 0.49, 0.3, -0.01);
set(151, 0.51, 0.32, 0.01);
set(107, 0.46, 0.31);
set(55, 0.47, 0.31);
set(65, 0.48, 0.31);
set(336, 0.52, 0.31);
set(285, 0.53, 0.31);
set(295, 0.54, 0.31);
set(2, 0.5, 0.6, -0.02);
set(97, 0.49, 0.61, -0.01);
set(326, 0.51, 0.59, -0.03);
set(148, 0.48, 0.88, 0);
set(152, 0.5, 0.9, 0.01);
set(176, 0.47, 0.89, 0.02);
set(377, 0.52, 0.87, -0.01);
set(400, 0.53, 0.92, 0.03);
set(234, 0.2, 0.55);
set(454, 0.8, 0.55);

const geometry = extractFaceRatioMeasurementGeometry(points);
expect(
  geometry.keypoints.glabella?.x === 0.5 &&
    geometry.keypoints.glabella?.y === 0.31,
  'Glabella must use the median of idx9/151 and the two inner-brow group means.',
);
expect(
  geometry.keypoints.subnasale?.x === 0.5 &&
    geometry.keypoints.subnasale?.y === 0.6 &&
    geometry.keypoints.subnasale?.z === -0.02,
  'Subnasale must use the coordinate-wise median of idx2/97/326.',
);
expect(
  geometry.keypoints.menton?.x === 0.5 &&
    geometry.keypoints.menton?.y === 0.92 &&
    geometry.keypoints.menton?.z === 0,
  'Menton must combine center-contour median x/z with the bottom-contour maximum y.',
);
expect(
  geometry.debugPoints.idx234?.x === 0.2 &&
    geometry.debugPoints.idx454?.x === 0.8 &&
    !('hApprox' in geometry.keypoints),
  'Face-width anchors must be preserved and the removed hApprox key must not return.',
);

console.log('faceRatioLandmarkMeasurement tests passed');
