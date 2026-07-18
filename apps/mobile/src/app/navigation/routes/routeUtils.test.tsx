import {
  getConsultingHistoryBackAction,
  getMainTabHeaderBorderWidth,
  goBackToPreviousOrMainTab,
  type RootNavigation,
} from './routeUtils';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getMainTabHeaderBorderWidth('HomeTab'),
  0,
  'home tab header border is hidden',
);
expectEqual(
  getMainTabHeaderBorderWidth('ProfileTab'),
  0,
  'profile tab header border is hidden',
);
expectEqual(
  getMainTabHeaderBorderWidth('ConsultingTab'),
  0,
  'consulting tab header border is hidden',
);
expectEqual(
  getConsultingHistoryBackAction('profile', true).kind,
  'goBack',
  'consulting history pops the current route when a previous screen exists',
);
expectEqual(
  JSON.stringify(getConsultingHistoryBackAction('profile', false)),
  JSON.stringify({kind: 'mainTab', screen: 'ProfileTab'}),
  'consulting history falls back to profile only when there is no back stack',
);
expectEqual(
  JSON.stringify(getConsultingHistoryBackAction(undefined, false)),
  JSON.stringify({kind: 'mainTab', screen: 'ConsultingTab'}),
  'consulting history keeps consulting as the default fallback',
);

const stackedBackCalls: string[] = [];
goBackToPreviousOrMainTab(
  {
    canGoBack: () => true,
    goBack: () => stackedBackCalls.push('goBack'),
    navigate: () => stackedBackCalls.push('navigate'),
  } as unknown as RootNavigation,
  'ProfileTab',
);
expectEqual(
  stackedBackCalls.join(','),
  'goBack',
  'profile child pops the existing screen instead of navigating to another profile',
);

const fallbackBackCalls: string[] = [];
goBackToPreviousOrMainTab(
  {
    canGoBack: () => false,
    goBack: () => fallbackBackCalls.push('goBack'),
    navigate: (routeName: string) => fallbackBackCalls.push(routeName),
  } as unknown as RootNavigation,
  'ProfileTab',
);
expectEqual(
  fallbackBackCalls.join(','),
  'MainTabs',
  'profile child only opens the profile tab when no previous screen exists',
);
