import React from 'react';

import {
  CameraFaceCaptureScreen,
  getCameraFaceCaptureCloseButtonPosition,
  getCameraFaceCaptureCameraMode,
  shouldValidateCameraFaceCapture,
} from './CameraFaceCaptureScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getCameraFaceCaptureCameraMode(),
  'live-camera',
  'camera face capture camera mode',
);
expectEqual(
  shouldValidateCameraFaceCapture('face'),
  true,
  'face capture mode validates face position',
);
expectEqual(
  shouldValidateCameraFaceCapture('reference'),
  false,
  'reference capture mode skips face validation',
);
expectEqual(
  getCameraFaceCaptureCloseButtonPosition(47).top,
  55,
  'camera face capture close button sits near the top edge',
);
expectEqual(
  getCameraFaceCaptureCloseButtonPosition(47).right,
  8,
  'camera face capture close button sits near the right edge',
);

<CameraFaceCaptureScreen
  captureMode="face"
  onCapture={() => undefined}
  onClose={() => undefined}
  onPickImage={() => undefined}
  onToggleCamera={() => undefined}
/>;

<CameraFaceCaptureScreen
  captureMode="reference"
  onCapture={() => undefined}
  onClose={() => undefined}
  onPickImage={() => undefined}
  onToggleCamera={() => undefined}
/>;
