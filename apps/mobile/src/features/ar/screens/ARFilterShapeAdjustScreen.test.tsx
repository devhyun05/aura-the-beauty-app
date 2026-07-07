import React from 'react';

import {
  ARFilterShapeAdjustScreen,
  getARFilterShapeAdjustAccentColor,
  getARFilterShapeAdjustCameraMode,
  getARFilterShapeAdjustControlGroupLabels,
  getARFilterShapeAdjustDefaultSymmetryEnabled,
  getARFilterShapeAdjustInteractionMode,
  getARFilterShapeAdjustTitle,
  getARFilterShapeAdjustSelectedTabOpacity,
  getShapePreviewColorOverlayLayers,
  getShapePointPanResponderDependencyMode,
} from './ARFilterShapeAdjustScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getShapePreviewColorOverlayLayers().length,
  0,
  'AR location preview color overlay layer count',
);
expectEqual(
  getARFilterShapeAdjustCameraMode(),
  'photo-preview',
  'AR location camera mode',
);
expectEqual(
  getARFilterShapeAdjustSelectedTabOpacity(),
  0.62,
  'AR location selected tab opacity',
);
expectEqual(
  getARFilterShapeAdjustTitle(),
  '핏 수정',
  'AR location adjust title',
);
expectEqual(
  getARFilterShapeAdjustInteractionMode(),
  'drag-shape-point',
  'AR shape adjust uses draggable shape points',
);
expectEqual(
  getShapePointPanResponderDependencyMode(),
  'shape-point-ids',
  'AR shape point pan responders depend on point ids only',
);
expectEqual(
  getARFilterShapeAdjustControlGroupLabels().join(','),
  '눈꼬리,윙 길이,오버립,아치',
  'AR fit warp exposes named precision control groups',
);
expectEqual(
  getARFilterShapeAdjustAccentColor(),
  '#D6A44C',
  'AR fit warp uses gold accent color',
);
expectEqual(
  getARFilterShapeAdjustDefaultSymmetryEnabled(),
  true,
  'AR fit warp symmetry starts enabled',
);

<ARFilterShapeAdjustScreen
  onBack={() => undefined}
  onSave={() => undefined}
/>;
