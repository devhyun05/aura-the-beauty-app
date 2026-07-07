import React from 'react';

import {
  AR_FILTER_BOTTOM_SHEET_BACKGROUND_COLOR,
  AR_FILTER_BOTTOM_SHEET_BOTTOM_OFFSET,
  AR_FILTER_BOTTOM_SHEET_CONTENT_BOTTOM_PADDING,
  AR_FILTER_BOTTOM_SHEET_CONTENT_GAP,
  AR_FILTER_BOTTOM_SHEET_PANEL_MAX_HEIGHT,
  AR_FILTER_BOTTOM_SHEET_PANEL_HORIZONTAL_PADDING,
  AR_FILTER_BOTTOM_SHEET_PANEL_GAP,
  AR_FILTER_BOTTOM_SHEET_PANEL_TOP_PADDING,
  AR_FILTER_BOTTOM_SHEET_PADDING,
  AR_FILTER_BOTTOM_SHEET_SCROLL_MAX_HEIGHT,
  AR_FILTER_BOTTOM_SHEET_SCROLL_POLICY,
  AR_FILTER_BOTTOM_ACTIONS_PLACEMENT,
  AR_FILTER_CAMERA_CONTROLS_BOTTOM_POSITION,
  AR_FILTER_CAMERA_CONTROLS_HOME_INDICATOR_CLEARANCE,
  AR_FILTER_CAPTURE_CONTROLS_BOTTOM_PADDING,
  AR_FILTER_FLOATING_SHEET_CONTROLS_JUSTIFY_CONTENT,
  AR_FILTER_FLOATING_SHEET_CONTROLS_LEFT_PADDING,
  AR_FILTER_FLOATING_SHEET_ACTIONS_FLEX,
  AR_FILTER_FLOATING_SHEET_CONTROLS_GAP,
  AR_FILTER_FLOATING_SHEET_CONTROLS_BOTTOM_GAP,
  AR_FILTER_FLOATING_SHEET_CONTROLS_RIGHT_PADDING,
  AR_FILTER_GALLERY_PICKER_ALLOWS_EDITING,
  AR_FILTER_GALLERY_PICKER_MEDIA_TYPES,
  AR_FILTER_GALLERY_PREVIEW_BEHAVIOR,
  AR_FILTER_BOTTOM_SHEET_TOGGLE_PLACEMENT,
  AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE,
  AR_FILTER_SHEET_TOGGLE_ALIGNMENT,
  AR_FILTER_SHEET_TOGGLE_BORDER_COLOR,
  AR_FILTER_SHEET_TOGGLE_BACKGROUND_COLOR,
  AR_FILTER_SHEET_TOGGLE_LEFT_OFFSET,
  AR_FILTER_SHEET_TOGGLE_MARGIN_SOURCE,
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
import {colors, spacing} from '../../../shared/theme';
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
  '룩,핏',
  'AR filter all face option groups',
);
expectEqual(
  getARFilterOptionGroupLabels('lip').join(','),
  '룩,컬러,타입,질감,핏',
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
  '핏 수정',
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
expectEqual(
  AR_FILTER_BOTTOM_SHEET_BOTTOM_OFFSET,
  0,
  'AR filter bottom sheet is flush with screen bottom',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_TOGGLE_PLACEMENT,
  'aboveSheet',
  'AR filter bottom sheet toggle placement',
);
expectEqual(
  AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE,
  36,
  'AR filter bottom sheet toggle button is circular',
);
expectEqual(
  AR_FILTER_SHEET_TOGGLE_BACKGROUND_COLOR,
  colors.arFilterBottomSheetSurface,
  'AR filter bottom sheet toggle button is translucent',
);
expectEqual(
  AR_FILTER_SHEET_TOGGLE_BORDER_COLOR,
  colors.border,
  'AR filter bottom sheet toggle button uses the shared icon action border',
);
expectEqual(
  AR_FILTER_SHEET_TOGGLE_LEFT_OFFSET,
  0,
  'AR filter bottom sheet toggle relies on the floating controls left padding',
);
expectEqual(
  AR_FILTER_SHEET_TOGGLE_MARGIN_SOURCE,
  'floatingControlsPadding',
  'AR filter bottom sheet toggle margin source',
);
expectEqual(
  AR_FILTER_SHEET_TOGGLE_ALIGNMENT,
  'sheetContentStart',
  'AR filter bottom sheet toggle follows sheet content start alignment',
);
expectEqual(
  AR_FILTER_BOTTOM_ACTIONS_PLACEMENT,
  'aboveSheet',
  'AR filter shape and save actions float above the bottom sheet',
);
expectEqual(
  AR_FILTER_FLOATING_SHEET_CONTROLS_GAP,
  spacing.xs,
  'AR filter floating sheet controls use compact spacing',
);
expectEqual(
  AR_FILTER_FLOATING_SHEET_CONTROLS_BOTTOM_GAP,
  spacing.md,
  'AR filter floating sheet controls leave breathing room above the bottom sheet',
);
expectEqual(
  AR_FILTER_FLOATING_SHEET_CONTROLS_RIGHT_PADDING,
  spacing.md,
  'AR filter floating sheet controls give the save button more right breathing room',
);
expectEqual(
  AR_FILTER_FLOATING_SHEET_CONTROLS_LEFT_PADDING,
  spacing.md,
  'AR filter floating sheet controls give the sheet toggle more left breathing room',
);
expectEqual(
  AR_FILTER_FLOATING_SHEET_CONTROLS_JUSTIFY_CONTENT,
  'space-between',
  'AR filter floating sheet controls pin sheet toggle and actions to opposite edges',
);
expectEqual(
  AR_FILTER_FLOATING_SHEET_ACTIONS_FLEX,
  1,
  'AR filter floating shape and save actions fill the row beside the sheet toggle',
);
expectEqual(
  AR_FILTER_CAPTURE_CONTROLS_BOTTOM_PADDING,
  AR_FILTER_CAMERA_CONTROLS_HOME_INDICATOR_CLEARANCE,
  'AR filter camera controls use home indicator clearance',
);
expectEqual(
  AR_FILTER_CAMERA_CONTROLS_HOME_INDICATOR_CLEARANCE,
  spacing.xxl * 5,
  'AR filter camera controls are clearly raised from the screen bottom',
);
expectEqual(
  AR_FILTER_CAMERA_CONTROLS_BOTTOM_POSITION,
  'raised',
  'AR filter camera controls are not attached to the bottom edge',
);
expectEqual(
  AR_FILTER_GALLERY_PICKER_MEDIA_TYPES.join(','),
  'images',
  'AR filter gallery picker opens image assets',
);
expectEqual(
  AR_FILTER_GALLERY_PICKER_ALLOWS_EDITING,
  false,
  'AR filter gallery picker does not crop selected makeup source',
);
expectEqual(
  AR_FILTER_GALLERY_PREVIEW_BEHAVIOR,
  'replaceLiveCameraPreview',
  'AR filter gallery selection replaces the live camera preview',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_PANEL_TOP_PADDING,
  spacing.xl + 2,
  'AR filter bottom sheet panel top padding is nudged down slightly',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_PANEL_HORIZONTAL_PADDING,
  AR_FILTER_BOTTOM_SHEET_PADDING,
  'AR filter bottom sheet horizontal padding matches sheet padding',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_PANEL_GAP,
  spacing.xs,
  'AR filter bottom sheet action-to-camera gap is compact',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_CONTENT_GAP,
  spacing.sm,
  'AR filter bottom sheet content gap is compact',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_CONTENT_BOTTOM_PADDING,
  AR_FILTER_BOTTOM_SHEET_PADDING,
  'AR filter bottom sheet content bottom padding matches sheet padding',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_BACKGROUND_COLOR,
  colors.bottomSheetSurface,
  'AR filter bottom sheet uses shared app bottom sheet surface opacity',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_PANEL_MAX_HEIGHT,
  640,
  'AR filter bottom sheet is tall enough for filter controls',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_SCROLL_MAX_HEIGHT,
  380,
  'AR filter bottom sheet avoids default filter control scrolling',
);
expectEqual(
  AR_FILTER_BOTTOM_SHEET_SCROLL_POLICY,
  'fitsDefaultFilterControls',
  'AR filter bottom sheet default controls fit without scrolling',
);

<ARFilterScreen
  initialGuideMode="basic"
  onBack={() => undefined}
  onOpenDetailEdit={() => undefined}
  onOpenShapeAdjust={() => undefined}
  onSave={() => undefined}
/>;

<ARFilterScreen initialComparisonMode="left" initialGuideMode="half" />;

<ARFilterScreen
  initialComparisonMode="left"
  initialGuideMode="half"
  initialMakeupFilterId="filter-douyin-pink"
  initialSource="recommendedFilter"
  onOpenDetailEdit={() => undefined}
  onOpenShapeAdjust={() => undefined}
  onSave={() => undefined}
/>;
