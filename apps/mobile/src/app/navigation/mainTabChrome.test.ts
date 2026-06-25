import type {FooterTabKey} from '../../shared/ui';
import type {MainTabRouteName} from './routeTypes';
import {
  getMainHeaderCopy,
  getMainTabFooterState,
  getRootRouteForFooterTab,
} from './mainTabChrome';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectMainHeader(
  routeName: MainTabRouteName,
  expected: {
    subtitle: string;
    title: string;
    usesBrandLogo: boolean;
  },
) {
  const actual = getMainHeaderCopy(routeName);

  expectEqual(actual.subtitle, expected.subtitle, `${routeName} subtitle`);
  expectEqual(actual.title, expected.title, `${routeName} title`);
  expectEqual(actual.usesBrandLogo, expected.usesBrandLogo, `${routeName} logo`);
}

expectEqual(getMainTabFooterState('HomeTab'), 'home', 'home tab footer state');
expectEqual(getMainTabFooterState('CustomTab'), 'custom', 'custom tab footer state');
expectEqual(getMainTabFooterState('MyPageTab'), undefined, 'profile tab footer state');

expectMainHeader('HomeTab', {
  subtitle: 'MAKEUP GUIDE',
  title: 'AI AR Makeup',
  usesBrandLogo: true,
});
expectMainHeader('CustomTab', {
  subtitle: 'AI PRODUCT MATCH',
  title: '추천 제품',
  usesBrandLogo: false,
});
expectMainHeader('MyPageTab', {
  subtitle: 'MAKEUP GUIDE',
  title: 'AI AR Makeup',
  usesBrandLogo: false,
});

const footerExpectations: Record<FooterTabKey, ReturnType<typeof getRootRouteForFooterTab>> = {
  capture: 'ARMakeupFilter',
  custom: 'CustomTab',
  home: 'HomeTab',
};

for (const [tab, expectedRoute] of Object.entries(footerExpectations)) {
  expectEqual(
    getRootRouteForFooterTab(tab as FooterTabKey),
    expectedRoute,
    `${tab} footer route`,
  );
}
