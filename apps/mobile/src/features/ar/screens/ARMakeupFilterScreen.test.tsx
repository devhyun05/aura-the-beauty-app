import React from 'react';

import {
  ARMakeupFilterScreen,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
} from './ARMakeupFilterScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getMakeupPreviewColorOverlayLayers().length,
  0,
  'AR preview color overlay layer count',
);
const expectedPreviewBadgeContent: null = getMakeupPreviewBadgeContent();

expectEqual(
  expectedPreviewBadgeContent,
  null,
  'AR preview status badge content',
);

<ARMakeupFilterScreen
  initialGuideMode="basic"
  onBack={() => undefined}
  onOpenLocationAdjust={() => undefined}
  onOpenStyleAdjust={() => undefined}
/>;

<ARMakeupFilterScreen initialComparisonMode="left" initialGuideMode="half" />;
