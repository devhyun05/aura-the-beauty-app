import React from 'react';

import {
  AR_FILTER_CAMERA_BUTTON_INNER_COLOR,
  AR_FILTER_CAMERA_BUTTON_INNER_TREATMENT,
  AR_FILTER_CAMERA_BUTTON_SURFACE_VARIANT,
  AR_FILTER_CAMERA_CONTROL_ROW_HORIZONTAL_PADDING,
  AR_FILTER_CAMERA_CONTROL_ROW_COMPONENT,
  AR_FILTER_CAMERA_CONTROL_DESIGN_TONE,
  AR_FILTER_CAMERA_FACING_TOGGLE_ICON_SOURCE,
  AR_FILTER_CAMERA_GALLERY_BUTTON_PLACEMENT,
  AR_FILTER_CAMERA_GALLERY_ICON_SOURCE,
  AR_FILTER_CAMERA_CONTROL_ROW_BOTTOM_LIFT,
  AR_FILTER_CAMERA_CONTROL_ROW_TOP_PADDING,
  AR_FILTER_CAMERA_MODE_ACTIVE_BACKGROUND_COLOR,
  AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR,
  AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR,
  ARFilterCaptureControls,
  getARFilterCaptureButtonMetrics,
} from './ARFilterCaptureControls';
import {colors, spacing} from '../../../shared/theme';
import {
  CAMERA_CAPTURE_BUTTON_METRICS,
  CAMERA_FACING_TOGGLE_BUTTON_ICON_NAME,
  CAMERA_GALLERY_BUTTON_ICON_NAME,
} from '../../../shared/ui';

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
  AR_FILTER_CAMERA_CONTROL_ROW_COMPONENT,
  'CameraCaptureControlRow',
  'AR filter camera controls use the shared face capture row',
);
expectEqual(
  AR_FILTER_CAMERA_BUTTON_SURFACE_VARIANT,
  'dark',
  'AR filter capture button uses the face capture dark ring surface',
);
expectEqual(
  AR_FILTER_CAMERA_BUTTON_INNER_COLOR,
  colors.white,
  'AR filter capture button inner dot is white like face capture controls',
);
expectEqual(
  AR_FILTER_CAMERA_BUTTON_INNER_TREATMENT,
  'solidDot',
  'AR filter capture button uses the face capture inner dot treatment',
);
expectEqual(
  AR_FILTER_CAMERA_CONTROL_DESIGN_TONE,
  'faceCaptureControls',
  'AR filter camera controls match the face capture control tone',
);
expectEqual(
  AR_FILTER_CAMERA_GALLERY_BUTTON_PLACEMENT,
  'leftOfCaptureModeToggle',
  'AR filter gallery button sits left of the photo/video toggle',
);
expectEqual(
  AR_FILTER_CAMERA_GALLERY_ICON_SOURCE,
  CAMERA_GALLERY_BUTTON_ICON_NAME,
  'AR filter gallery button uses the shared face capture gallery icon',
);
expectEqual(
  AR_FILTER_CAMERA_FACING_TOGGLE_ICON_SOURCE,
  CAMERA_FACING_TOGGLE_BUTTON_ICON_NAME,
  'AR filter camera toggle uses the shared face capture camera switch icon',
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
  colors.liquidGlassSurface,
  'AR filter active camera mode uses the liquid glass selected surface',
);
expectEqual(
  AR_FILTER_CAMERA_MODE_ACTIVE_ICON_COLOR,
  colors.black,
  'AR filter active camera mode icon has strong contrast on white',
);
expectEqual(
  AR_FILTER_CAMERA_MODE_INACTIVE_ICON_COLOR,
  colors.white,
  'AR filter inactive camera mode icon follows face capture utility buttons',
);

<ARFilterCaptureControls
  cameraFacing="front"
  captureMode="photo"
  onCameraFacingToggle={() => undefined}
  onCaptureModeChange={() => undefined}
  onComplete={() => undefined}
  onOpenGallery={() => undefined}
/>;
