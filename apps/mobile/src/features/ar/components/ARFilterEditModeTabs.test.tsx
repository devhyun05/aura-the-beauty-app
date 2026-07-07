import React from 'react';

import {
  ARFilterEditModeTabs,
  getARFilterEditModeTabHeight,
  getARFilterEditModeTabLabels,
} from './ARFilterEditModeTabs';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getARFilterEditModeTabLabels().join(','),
  '제품 수정,핏 수정',
  'AR filter edit mode tab labels',
);
expectEqual(
  getARFilterEditModeTabHeight(),
  24,
  'AR filter edit mode tab height',
);

<ARFilterEditModeTabs
  activeMode="product"
  onBack={() => undefined}
  onModeChange={() => undefined}
  onSave={() => undefined}
  topInset={0}
/>;
