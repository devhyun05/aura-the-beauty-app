import React from 'react';

import {
  APP_SCREEN_CONTENT_TOP_PADDING,
  getAppScreenBottomPadding,
  getAppScreenResolvedTopPadding,
  getAppScreenTopPadding,
  AppScreen,
  type AppScreenBottomPadding,
} from './AppScreen';
import {APP_HEADER_BASE_HEIGHT} from './AppHeader';

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
expectEqual(
  getAppScreenTopPadding('belowOverlayHeader', 47),
  47 + APP_HEADER_BASE_HEIGHT + APP_SCREEN_CONTENT_TOP_PADDING,
  'below overlay header app screen top padding',
);
expectEqual(
  getAppScreenTopPadding('safeArea', 47),
  47,
  'safe area app screen top padding',
);
expectEqual(getAppScreenTopPadding('none', 47), 0, 'none app screen top padding');
expectEqual(
  getAppScreenResolvedTopPadding('none', 47, 103),
  103,
  'overlay header height is applied to none app screen top padding',
);
expectEqual(
  getAppScreenResolvedTopPadding('belowShellHeader', 47, 103),
  103 + APP_SCREEN_CONTENT_TOP_PADDING,
  'overlay header height is applied to below shell header top padding',
);
expectEqual(
  getAppScreenResolvedTopPadding('belowOverlayHeader', 47, 103),
  47 + APP_HEADER_BASE_HEIGHT + APP_SCREEN_CONTENT_TOP_PADDING,
  'overlay header height is not doubled for below overlay header top padding',
);

expectEqual(
  getAppScreenBottomPadding(undefined, 34),
  58,
  'default app screen bottom padding',
);
expectEqual(
  getAppScreenBottomPadding('safeArea', 34),
  34,
  'safe area app screen bottom padding',
);
expectEqual(
  getAppScreenBottomPadding('floatingFooter', 34),
  102,
  'floating footer app screen bottom padding',
);
expectEqual(getAppScreenBottomPadding(0, 34), 0, 'custom app screen bottom padding');

const safeAreaBottomPadding: AppScreenBottomPadding = 'safeArea';
const floatingFooterBottomPadding: AppScreenBottomPadding = 'floatingFooter';

<AppScreen topPadding="belowShellHeader">content</AppScreen>;
<AppScreen topPadding="belowOverlayHeader">content</AppScreen>;
<AppScreen
  backgroundColor="transparent"
  bottomPadding={safeAreaBottomPadding}
  contentGap={0}
  horizontalPadding={0}
  topPadding="safeArea"
>
  content
</AppScreen>;
<AppScreen bottomPadding={floatingFooterBottomPadding}>content</AppScreen>;
