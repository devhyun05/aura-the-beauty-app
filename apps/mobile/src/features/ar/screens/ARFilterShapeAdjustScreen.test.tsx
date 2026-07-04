import React from 'react';

import {
  ARFilterShapeAdjustScreen,
  getARFilterShapeAdjustCameraMode,
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
  'live-camera',
  'AR location camera mode',
);
expectEqual(
  getARFilterShapeAdjustSelectedTabOpacity(),
  0.62,
  'AR location selected tab opacity',
);
expectEqual(
  getARFilterShapeAdjustTitle(),
  '형태 수정',
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

<ARFilterShapeAdjustScreen
  onBack={() => undefined}
  onSave={() => undefined}
/>;
