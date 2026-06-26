import React from 'react';

import {
  ARFilterScreen,
  getARFilterCameraMode,
  getARFilterCaptureButtonMetrics,
  getARFilterCategoryTitle,
  getARFilterComparisonTabs,
  getARFilterModeTabHeight,
  getARFilterOptionGroupLabels,
  getARFilterOriginalCardLabel,
  getARFilterSaveButtonLabel,
  getARFilterSelectedTabOpacity,
  getARFilterShapeEditButtonLabel,
  getARFilterShapeOptionLabels,
  getARFilterTotalMakeupLookIdAfterOptionEdit,
  getARFilterInitialColorId,
  getARFilterSelectedColor,
  isARFilterSaveEnabled,
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
  24,
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
  getARFilterOptionGroupLabels('all').join(','),
  '룩,형태',
  'AR filter all face option groups',
);
expectEqual(
  getARFilterOptionGroupLabels('lip').join(','),
  '룩,컬러,타입,질감,형태',
  'AR filter part option groups',
);
expectEqual(
  getARFilterOriginalCardLabel(),
  '원본',
  'AR filter original option card label',
);
expectEqual(
  getARFilterShapeOptionLabels('lip')[0],
  '기본 립',
  'AR filter shape option label',
);
expectEqual(
  getARFilterSaveButtonLabel(),
  '저장',
  'AR filter save button label',
);
expectEqual(
  getARFilterShapeEditButtonLabel(),
  '형태 수정',
  'AR filter shape edit button label',
);
expectEqual(
  getARFilterTotalMakeupLookIdAfterOptionEdit({
    selectedTotalMakeupLookId: 'daily-glow',
  }),
  null,
  'AR filter clears all style after option edit',
);
expectEqual(
  isARFilterSaveEnabled({hasUnsavedChanges: false}),
  false,
  'AR filter save disabled before custom edits',
);
expectEqual(
  isARFilterSaveEnabled({hasUnsavedChanges: true}),
  true,
  'AR filter save enabled after custom edits',
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
  onOpenShapeAdjust={() => undefined}
  onSave={() => undefined}
/>;

<ARFilterScreen initialComparisonMode="left" initialGuideMode="half" />;
