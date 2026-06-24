import React from 'react';

import {
  APP_SCREEN_CONTENT_TOP_PADDING,
  getAppScreenTopPadding,
  AppScreen,
} from './AppScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getAppScreenTopPadding('standalone', 47),
  63,
  'standalone app screen top padding',
);
expectEqual(
  getAppScreenTopPadding('belowShellHeader', 47),
  APP_SCREEN_CONTENT_TOP_PADDING,
  'below shell header app screen top padding',
);
expectEqual(getAppScreenTopPadding('none', 47), 0, 'none app screen top padding');

<AppScreen topPadding="belowShellHeader">content</AppScreen>;
<AppScreen
  backgroundColor="transparent"
  bottomPadding={0}
  contentGap={0}
  horizontalPadding={0}
  topPadding="none"
>
  content
</AppScreen>;
