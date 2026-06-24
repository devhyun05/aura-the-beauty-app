import React from 'react';

import {
  getLiveCameraPermissionCopy,
  shouldMirrorLiveCamera,
  LiveCameraLayer,
} from './LiveCameraLayer';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  shouldMirrorLiveCamera('front'),
  true,
  'front camera mirror state',
);
expectEqual(
  shouldMirrorLiveCamera('back'),
  false,
  'back camera mirror state',
);
expectEqual(
  getLiveCameraPermissionCopy('permission').title,
  '카메라 권한이 필요해요',
  'camera permission title',
);
expectEqual(
  getLiveCameraPermissionCopy('mountError').title,
  '카메라를 사용할 수 없어요',
  'camera mount error title',
);

<LiveCameraLayer facing="front" />;
