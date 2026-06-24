import React from 'react';

import {
  ARFilterCustomStyleScreen,
  getARFilterCustomStyleCameraMode,
  getARFilterCustomStyleSelectedColor,
  getARFilterCustomStyleSelectedTabOpacity,
  getStylePreviewColorOverlayLayers,
  getStylePreviewSummaryContent,
} from './ARFilterCustomStyleScreen';
import {colors} from '../../../shared/theme';

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
expectEqual(
  getARFilterCustomStyleCameraMode(),
  'live-camera',
  'AR style camera mode',
);
expectEqual(
  getARFilterCustomStyleSelectedTabOpacity(),
  0.62,
  'AR style selected tab opacity',
);
expectEqual(
  getARFilterCustomStyleSelectedColor([], 'missing').hex,
  colors.white,
  'AR style selected color fallback hex',
);
expectEqual(
  getARFilterCustomStyleSelectedColor([], 'missing').label,
  '기본',
  'AR style selected color fallback label',
);

<ARFilterCustomStyleScreen
  onBack={() => undefined}
  onOpenLocationAdjust={() => undefined}
  onSave={() => undefined}
/>;
