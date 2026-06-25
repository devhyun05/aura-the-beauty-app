import React from 'react';

import {
  ARFilterScreen,
  getARFilterCameraMode,
  getARFilterCaptureButtonMetrics,
  getARFilterCategoryTitle,
  getARFilterComparisonTabs,
  getARFilterModeTabHeight,
  getARFilterSelectedTabOpacity,
  getARFilterInitialColorId,
  getARFilterSelectedColor,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
  shouldShowARFilterHeaderCopy,
} from './ARFilterScreen';
import {colors} from '../../../shared/theme';
import {CAMERA_CAPTURE_BUTTON_METRICS} from '../../../shared/ui';

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
expectEqual(
  getARFilterCameraMode(),
  'live-camera',
  'AR filter camera mode',
);
const expectedHeaderCopyVisibility: false = shouldShowARFilterHeaderCopy();

expectEqual(
  expectedHeaderCopyVisibility,
  false,
  'AR filter header copy visibility',
);
expectEqual(
  getARFilterModeTabHeight(),
  32,
  'AR filter mode tab height',
);
expectEqual(
  getARFilterSelectedTabOpacity(),
  0.62,
  'AR filter selected tab opacity',
);
expectEqual(
  getARFilterCategoryTitle(),
  null,
  'AR filter category title',
);
expectEqual(
  getARFilterComparisonTabs().join(','),
  '왼쪽,오른쪽',
  'AR filter comparison tabs',
);
expectEqual(
  getARFilterCaptureButtonMetrics().outerSize,
  CAMERA_CAPTURE_BUTTON_METRICS.defaultSize,
  'AR filter capture button outer size',
);
expectEqual(
  getARFilterCaptureButtonMetrics().innerScale,
  CAMERA_CAPTURE_BUTTON_METRICS.innerScale,
  'AR filter capture button inner scale',
);
expectEqual(
  getARFilterSelectedColor([], 'missing').hex,
  colors.white,
  'AR filter selected color fallback hex',
);
expectEqual(
  getARFilterSelectedColor([], 'missing').label,
  '기본',
  'AR filter selected color fallback label',
);
expectEqual(
  getARFilterInitialColorId([]),
  '',
  'AR filter initial color id fallback',
);

<ARFilterScreen
  initialGuideMode="basic"
  onBack={() => undefined}
  onOpenLocationAdjust={() => undefined}
  onOpenStyleAdjust={() => undefined}
/>;

<ARFilterScreen initialComparisonMode="left" initialGuideMode="half" />;
