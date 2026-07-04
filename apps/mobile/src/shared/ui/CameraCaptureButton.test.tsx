import React from 'react';

import {
  CAMERA_CAPTURE_BUTTON_METRICS,
  CameraCaptureButton,
} from './CameraCaptureButton';
import {APP_FOOTER_CAPTURE_BUBBLE_SIZE} from './AppFooter';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  APP_FOOTER_CAPTURE_BUBBLE_SIZE,
  54,
  'footer capture button size is larger than the default camera button',
);
expectEqual(
  APP_FOOTER_CAPTURE_BUBBLE_SIZE,
  CAMERA_CAPTURE_BUTTON_METRICS.defaultSize + 4,
  'footer capture button size offset',
);
expectEqual(
  CAMERA_CAPTURE_BUTTON_METRICS.borderWidth,
  2,
  'camera capture button border width',
);
expectEqual(
  CAMERA_CAPTURE_BUTTON_METRICS.innerScale,
  0.56,
  'camera capture button inner scale',
);

<CameraCaptureButton
  accessibilityLabel="사진 촬영"
  disabled={false}
  onPress={() => undefined}
/>;
