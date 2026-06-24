import React from 'react';

import {
  ARFilterCustomLocationScreen,
  getARFilterCustomLocationCameraMode,
  getARFilterCustomLocationSelectedTabOpacity,
  getLocationPreviewColorOverlayLayers,
} from './ARFilterCustomLocationScreen';

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
  getARFilterCustomLocationCameraMode(),
  'live-camera',
  'AR location camera mode',
);
expectEqual(
  getARFilterCustomLocationSelectedTabOpacity(),
  0.62,
  'AR location selected tab opacity',
);

<ARFilterCustomLocationScreen
  onBack={() => undefined}
  onOpenStyleAdjust={() => undefined}
  onSave={() => undefined}
/>;
