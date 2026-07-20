import {
  getConsultingHistoryBackAction,
  getMainTabResetState,
  getMainTabHeaderBorderWidth,
  goBackToPreviousOrMainTab,
  navigateMainTab,
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
    dispatch: (action: {type?: string}) => stackedBackCalls.push(action.type ?? 'dispatch'),
    getState: () => ({index: 1, routes: [{name: 'MainTabs'}, {name: 'ProductRecommendation'}]}),
    goBack: () => stackedBackCalls.push('goBack'),
    navigate: () => stackedBackCalls.push('navigate'),
  } as unknown as RootNavigation,
  'ProfileTab',
);
expectEqual(
  stackedBackCalls.join(','),
  'POP',
  'profile child dispatches a real stack pop instead of navigating to another profile',
);

const fallbackBackCalls: string[] = [];
let fallbackResetState: unknown = null;
goBackToPreviousOrMainTab(
  {
    canGoBack: () => false,
    dispatch: (action: {type?: string}) => fallbackBackCalls.push(action.type ?? 'dispatch'),
    getState: () => ({index: 0, routes: [{name: 'MainTabs'}]}),
    goBack: () => fallbackBackCalls.push('goBack'),
    navigate: (routeName: string) => fallbackBackCalls.push(routeName),
    reset: (state: unknown) => {
      fallbackBackCalls.push('reset');
      fallbackResetState = state;
    },
  } as unknown as RootNavigation,
  'ProfileTab',
);
expectEqual(
  fallbackBackCalls.join(','),
  'reset',
  'profile child resets to the profile tab when no previous screen exists',
);
expectEqual(
  JSON.stringify(fallbackResetState),
  JSON.stringify(getMainTabResetState('ProfileTab')),
  'profile child fallback reset leaves only MainTabs/ProfileTab in the stack',
);

const navigateMainTabCalls: string[] = [];
navigateMainTab(
  {
    reset: (state: unknown) => {
      navigateMainTabCalls.push(JSON.stringify(state));
    },
  } as unknown as RootNavigation,
  'HomeTab',
);
expectEqual(
  navigateMainTabCalls.join(','),
  JSON.stringify(getMainTabResetState('HomeTab')),
  'main tab fallback must reset instead of stacking another MainTabs route',
);
