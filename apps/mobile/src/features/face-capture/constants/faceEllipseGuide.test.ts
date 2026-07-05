import {
  computeFaceEllipseGuideGeometry,
  FACE_ELLIPSE_GUIDE_TUNING,
} from './faceEllipseGuide';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectClose(actual: number, expected: number, tolerance: number, message: string) {
  expect(
    Math.abs(actual - expected) <= tolerance,
    `${message} (actual=${actual}, expected=${expected})`,
  );
}

const previewWidth = 390;
const previewHeight = 844;

// --- 기하: principal point 앵커 배치 (향후 ARKit 경로) ---

const anchored = computeFaceEllipseGuideGeometry({
  previewHeight,
  previewWidth,
  principalPointInPreview: {x: 195, y: 400},
});

const expectedHeight = previewHeight * FACE_ELLIPSE_GUIDE_TUNING.heightToPreviewHeightRatio;
const expectedWidth = expectedHeight * FACE_ELLIPSE_GUIDE_TUNING.widthToHeightRatio;
const expectedTop = 400 - expectedHeight * FACE_ELLIPSE_GUIDE_TUNING.snFromTopRatio;

expectClose(anchored.height, expectedHeight, 0.01, 'ellipse height follows tuning ratio');
expectClose(anchored.width, expectedWidth, 0.01, 'ellipse width follows tuning ratio');
expectClose(anchored.topDot.y, expectedTop, 0.01, 'top dot sits at the ellipse top vertex');
expectClose(
  anchored.bottomDot.y,
  expectedTop + expectedHeight,
  0.01,
  'bottom dot sits at the ellipse bottom vertex',
);
expect(
  anchored.snTarget.x === 195 && anchored.snTarget.y === 400,
  'sn target equals the principal point anchor',
);
expect(anchored.centerX === 195, 'ellipse centers on the principal point x');

// --- 기하: principal point 없을 때 화면 중앙 + verticalCenterRatio 배치 (현재 경로) ---

const centered = computeFaceEllipseGuideGeometry({
  previewHeight,
  previewWidth,
  principalPointInPreview: null,
});

expect(centered.centerX === previewWidth / 2, 'missing principal point centers x');
expectClose(
  centered.centerY,
  previewHeight * FACE_ELLIPSE_GUIDE_TUNING.verticalCenterRatio,
  0.01,
  'missing principal point uses verticalCenterRatio for y',
);
expectClose(
  centered.topDot.y,
  centered.centerY - centered.height / 2,
  0.01,
  'top dot is half a height above the center',
);
expectClose(
  centered.bottomDot.y,
  centered.centerY + centered.height / 2,
  0.01,
  'bottom dot is half a height below the center',
);

console.log('faceEllipseGuide tests passed');
