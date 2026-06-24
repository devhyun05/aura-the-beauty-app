import React from 'react';

import {
  ARMakeupFilterScreen,
  getARMakeupFilterCameraMode,
  getARMakeupFilterCaptureButtonMetrics,
  getARMakeupFilterCategoryTitle,
  getARMakeupFilterComparisonTabs,
  getARMakeupFilterModeTabHeight,
  getARMakeupFilterSelectedTabOpacity,
  getARMakeupFilterInitialColorId,
  getARMakeupFilterSelectedColor,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
  shouldShowARMakeupFilterHeaderCopy,
} from './ARMakeupFilterScreen';
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
  getARMakeupFilterCameraMode(),
  'live-camera',
  'AR makeup filter camera mode',
);
const expectedHeaderCopyVisibility: false = shouldShowARMakeupFilterHeaderCopy();

expectEqual(
  expectedHeaderCopyVisibility,
  false,
  'AR makeup filter header copy visibility',
);
expectEqual(
  getARMakeupFilterModeTabHeight(),
  32,
  'AR makeup filter mode tab height',
);
expectEqual(
  getARMakeupFilterSelectedTabOpacity(),
  0.62,
  'AR makeup filter selected tab opacity',
);
expectEqual(
  getARMakeupFilterCategoryTitle(),
  null,
  'AR makeup filter category title',
);
expectEqual(
  getARMakeupFilterComparisonTabs().join(','),
  '왼쪽,오른쪽',
  'AR makeup filter comparison tabs',
);
expectEqual(
  getARMakeupFilterCaptureButtonMetrics().outerSize,
  CAMERA_CAPTURE_BUTTON_METRICS.defaultSize,
  'AR makeup filter capture button outer size',
);
expectEqual(
  getARMakeupFilterCaptureButtonMetrics().innerScale,
  CAMERA_CAPTURE_BUTTON_METRICS.innerScale,
  'AR makeup filter capture button inner scale',
);
expectEqual(
  getARMakeupFilterSelectedColor([], 'missing').hex,
  colors.white,
  'AR makeup filter selected color fallback hex',
);
expectEqual(
  getARMakeupFilterSelectedColor([], 'missing').label,
  '기본',
  'AR makeup filter selected color fallback label',
);
expectEqual(
  getARMakeupFilterInitialColorId([]),
  '',
  'AR makeup filter initial color id fallback',
);

<ARMakeupFilterScreen
  initialGuideMode="basic"
  onBack={() => undefined}
  onOpenLocationAdjust={() => undefined}
  onOpenStyleAdjust={() => undefined}
/>;

<ARMakeupFilterScreen initialComparisonMode="left" initialGuideMode="half" />;
