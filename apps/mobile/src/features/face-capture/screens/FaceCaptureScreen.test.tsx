import React from 'react';

import {
  FaceCaptureScreen,
  getFaceCaptureCameraMode,
} from './FaceCaptureScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getFaceCaptureCameraMode(),
  'live-camera',
  'face capture camera mode',
);

<FaceCaptureScreen
  onCapture={() => undefined}
  onClose={() => undefined}
  onPickImage={() => undefined}
  onToggleCamera={() => undefined}
/>;
