import React from 'react';

import {
  ARFilterCustomLocationScreen,
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

<ARFilterCustomLocationScreen
  onBack={() => undefined}
  onOpenStyleAdjust={() => undefined}
  onSave={() => undefined}
/>;
