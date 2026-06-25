import React from 'react';

import {
  ARFilterShapeAdjustScreen,
  getARFilterShapeAdjustCameraMode,
  getARFilterShapeAdjustTitle,
  getARFilterShapeAdjustSelectedTabOpacity,
  getShapePreviewColorOverlayLayers,
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

<ARFilterShapeAdjustScreen
  onBack={() => undefined}
  onSave={() => undefined}
/>;
