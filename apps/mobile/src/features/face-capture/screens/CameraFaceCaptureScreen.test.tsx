import React from 'react';

import {
  CameraFaceCaptureScreen,
  getCameraFaceCaptureCloseButtonPosition,
  getCameraFaceCaptureCameraMode,
  shouldClearCameraFaceCaptureValidationMessage,
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
  47,
  'camera face capture close button sits near the top edge',
);
expectEqual(
  getCameraFaceCaptureCloseButtonPosition(47).right,
  8,
  'camera face capture close button sits near the right edge',
);
expectEqual(
  getCameraFaceCaptureCloseButtonPosition(47).position,
  'absolute',
  'camera face capture close button host is absolutely positioned',
);

expectEqual(
  shouldClearCameraFaceCaptureValidationMessage(
    '조금 가까이서 촬영해주세요',
    null,
  ),
  true,
  'a passing realtime frame clears a stale blocked-capture message',
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
