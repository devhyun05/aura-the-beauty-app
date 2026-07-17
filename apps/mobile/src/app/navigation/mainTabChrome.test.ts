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
    showTitle: boolean;
    subtitle?: string;
    title?: string;
    usesBrandLogo: boolean;
  },
) {
  const actual = getMainHeaderCopy(routeName);

  expectEqual(actual.showTitle, expected.showTitle, `${routeName} show title`);
  expectEqual(actual.subtitle, expected.subtitle, `${routeName} subtitle`);
  expectEqual(actual.title, expected.title, `${routeName} title`);
  expectEqual(actual.usesBrandLogo, expected.usesBrandLogo, `${routeName} logo`);
}

expectEqual(getMainTabFooterState('HomeTab'), 'home', 'home tab footer state');
expectEqual(getMainTabFooterState('ProfileTab'), 'profile', 'profile tab footer state');
expectEqual(getMainTabFooterState('ConsultingTab'), 'consulting', 'consulting tab footer state');
expectEqual(getMainTabFooterState('MakeupJourneyTab'), 'journey', 'journey tab footer state');

expectMainHeader('HomeTab', {
  showTitle: true,
  subtitle: 'MAKEUP GUIDE',
  title: 'AI AR Makeup',
  usesBrandLogo: true,
});
expectMainHeader('ProfileTab', {
  showTitle: true,
  subtitle: 'MAKEUP GUIDE',
  title: 'AI AR Makeup',
  usesBrandLogo: true,
});
expectMainHeader('ConsultingTab', {
  showTitle: true,
  subtitle: 'MAKEUP GUIDE',
  title: 'AI AR Makeup',
  usesBrandLogo: true,
});
expectMainHeader('MakeupJourneyTab', {
  showTitle: true,
  usesBrandLogo: true,
});

const footerExpectations: Record<FooterTabKey, ReturnType<typeof getRootRouteForFooterTab>> = {
  consulting: 'ConsultingTab',
  home: 'HomeTab',
  journey: 'MakeupJourneyTab',
  profile: 'ProfileTab',
};

for (const [tab, expectedRoute] of Object.entries(footerExpectations)) {
  expectEqual(
    getRootRouteForFooterTab(tab as FooterTabKey),
    expectedRoute,
    `${tab} footer route`,
  );
}
