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
  getAppScreenTopPadding('safe', 47),
  63,
  'safe app screen top padding',
);
expectEqual(
  getAppScreenTopPadding('content', 47),
  APP_SCREEN_CONTENT_TOP_PADDING,
  'content app screen top padding',
);
expectEqual(getAppScreenTopPadding('none', 47), 0, 'none app screen top padding');

<AppScreen topPadding="content">content</AppScreen>;
