import React from 'react';

import {
  getLiveCameraPermissionAction,
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
expectEqual(
  getLiveCameraPermissionAction({granted: false, canAskAgain: true}),
  'request',
  'camera permission action when permission can be requested',
);
expectEqual(
  getLiveCameraPermissionAction({granted: false, canAskAgain: false}),
  'settings',
  'camera permission action when permission is permanently denied',
);
expectEqual(
  getLiveCameraPermissionAction({granted: true, canAskAgain: false}, true),
  null,
  'camera permission action is hidden for mount errors',
);

<LiveCameraLayer facing="front" />;
