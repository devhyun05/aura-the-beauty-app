import React from 'react';

import {
  ARFilterLocationAdjustScreen,
  getARFilterLocationAdjustCameraMode,
  getARFilterLocationAdjustTitle,
  getARFilterLocationAdjustSelectedTabOpacity,
  getLocationPreviewColorOverlayLayers,
} from './ARFilterLocationAdjustScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getLocationPreviewColorOverlayLayers().length,
  0,
  'AR location preview color overlay layer count',
);
expectEqual(
  getARFilterLocationAdjustCameraMode(),
  'live-camera',
  'AR location camera mode',
);
expectEqual(
  getARFilterLocationAdjustSelectedTabOpacity(),
  0.62,
  'AR location selected tab opacity',
);
expectEqual(
  getARFilterLocationAdjustTitle(),
  '형태 수정',
  'AR location adjust title',
);

<ARFilterLocationAdjustScreen
  onBack={() => undefined}
  onSave={() => undefined}
/>;
