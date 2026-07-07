import React from 'react';
import {StyleSheet} from 'react-native';

import {
  AR_FILTER_COMPARISON_DIVIDER_BOTTOM,
  AR_FILTER_COMPARISON_DIVIDER_TOP,
  AR_FILTER_COMPARISON_DIVIDER_VERTICAL_SPAN,
  AR_FILTER_COMPARISON_DIVIDER_WIDTH,
  AR_FILTER_HALF_GUIDE_SIDE_SHADE_VISIBILITY,
  AR_FILTER_MOCK_MAKEUP_OVERLAY_VISIBILITY,
  AR_FILTER_SOURCE_IMAGE_PREVIEW_MODE,
  ARFilterCameraPreview,
  getARFilterCameraMode,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
  shouldShowARFilterComparisonSideShade,
  shouldShowARFilterHeaderCopy,
  shouldShowARFilterMockMakeupOverlays,
} from './ARFilterCameraPreview';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  AR_FILTER_COMPARISON_DIVIDER_WIDTH,
  StyleSheet.hairlineWidth,
  'AR filter comparison divider uses the thinnest native line',
);
expectEqual(
  AR_FILTER_COMPARISON_DIVIDER_VERTICAL_SPAN,
  'guideModeControlToBottom',
  'AR filter comparison divider starts at the guide mode control',
);
expectEqual(
  AR_FILTER_COMPARISON_DIVIDER_TOP,
  49,
  'AR filter comparison divider touches the guide mode tab',
);
expectEqual(
  AR_FILTER_COMPARISON_DIVIDER_BOTTOM,
  0,
  'AR filter comparison divider reaches the bottom edge',
);
expectEqual(
  AR_FILTER_MOCK_MAKEUP_OVERLAY_VISIBILITY,
  'hidden',
  'AR filter temporary mock makeup overlays are hidden',
);
expectEqual(
  AR_FILTER_SOURCE_IMAGE_PREVIEW_MODE,
  'photo-image-over-camera',
  'AR filter selected photo image replaces the live camera preview',
);
expectEqual(
  shouldShowARFilterMockMakeupOverlays(),
  false,
  'AR filter temporary mock makeup overlays are not rendered',
);
expectEqual(
  AR_FILTER_HALF_GUIDE_SIDE_SHADE_VISIBILITY,
  'hidden',
  'AR filter half guide does not darken one side',
);
expectEqual(
  shouldShowARFilterComparisonSideShade(),
  false,
  'AR filter half guide side shade is not rendered',
);
expectEqual(
  getARFilterCameraMode(),
  'live-camera',
  'AR filter camera mode',
);
expectEqual(
  getMakeupPreviewColorOverlayLayers().length,
  0,
  'AR preview color overlay layer count',
);
expectEqual(
  getMakeupPreviewBadgeContent(),
  null,
  'AR preview status badge content',
);
expectEqual(
  shouldShowARFilterHeaderCopy(),
  false,
  'AR filter header copy visibility',
);

<ARFilterCameraPreview
  cameraFacing="front"
  guideMode="half"
  previewColorHex="#FFFFFF"
  selectedComparisonMode="left"
  sourceImageUri="file:///selected-filter-source.jpg"
/>;
