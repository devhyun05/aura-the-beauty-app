import React from 'react';

import {
  AR_FILTER_CAMERA_BUTTON_INNER_COLOR,
  AR_FILTER_CAMERA_BUTTON_INNER_TREATMENT,
  AR_FILTER_CAMERA_BUTTON_SURFACE_VARIANT,
  AR_FILTER_CAMERA_CONTROL_ROW_HORIZONTAL_PADDING,
  AR_FILTER_CAMERA_CONTROL_DESIGN_TONE,
  AR_FILTER_CAMERA_CONTROL_ROW_BOTTOM_LIFT,
  AR_FILTER_CAMERA_CONTROL_ROW_TOP_PADDING,
  AR_FILTER_CAMERA_MODE_ACTIVE_BACKGROUND_COLOR,
  AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR,
  AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR,
  ARFilterCaptureControls,
  getARFilterCaptureButtonMetrics,
} from './ARFilterCaptureControls';
import {colors, spacing} from '../../../shared/theme';
import {CAMERA_CAPTURE_BUTTON_METRICS} from '../../../shared/ui';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

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
  AR_FILTER_CAMERA_BUTTON_SURFACE_VARIANT,
  'liquidGlass',
  'AR filter capture button uses liquid glass surface',
);
expectEqual(
  AR_FILTER_CAMERA_BUTTON_INNER_COLOR,
  'transparent',
  'AR filter capture button inner color is transparent',
);
expectEqual(
  AR_FILTER_CAMERA_BUTTON_INNER_TREATMENT,
  'transparent',
  'AR filter capture button inner treatment has no gray fill',
);
expectEqual(
  AR_FILTER_CAMERA_CONTROL_DESIGN_TONE,
  'bottomSheetGlass',
  'AR filter camera controls use bottom sheet glass tone',
);
expectEqual(
  AR_FILTER_CAMERA_CONTROL_ROW_BOTTOM_LIFT,
  spacing.md,
  'AR filter camera controls are lifted above the sheet bottom padding',
);
expectEqual(
  AR_FILTER_CAMERA_CONTROL_ROW_TOP_PADDING,
  spacing.xs,
  'AR filter camera controls sit close to the bottom action row',
);
expectEqual(
  AR_FILTER_CAMERA_CONTROL_ROW_HORIZONTAL_PADDING,
  0,
  'AR filter camera controls use sheet horizontal padding',
);
expectEqual(
  AR_FILTER_CAMERA_MODE_ACTIVE_BACKGROUND_COLOR,
  colors.textSecondary,
  'AR filter active camera mode uses a neutral gray selected surface',
);
expectEqual(
  AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR,
  colors.white,
  'AR filter active camera mode icon has strong contrast',
);
expectEqual(
  AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR,
  colors.textSecondary,
  'AR filter inactive camera mode icon is subdued',
);

<ARFilterCaptureControls
  cameraFacing="front"
  captureMode="photo"
  onCameraFacingToggle={() => undefined}
  onCaptureModeChange={() => undefined}
  onComplete={() => undefined}
/>;
