import React from 'react';

import {
  ARFilterCustomStyleScreen,
  getStylePreviewColorOverlayLayers,
  getStylePreviewSummaryContent,
} from './ARFilterCustomStyleScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const expectedStylePreviewSummaryContent: null = getStylePreviewSummaryContent();

expectEqual(
  getStylePreviewColorOverlayLayers().length,
  0,
  'AR style preview color overlay layer count',
);
expectEqual(
  expectedStylePreviewSummaryContent,
  null,
  'AR style preview summary content',
);

<ARFilterCustomStyleScreen
  onBack={() => undefined}
  onOpenLocationAdjust={() => undefined}
  onSave={() => undefined}
/>;
