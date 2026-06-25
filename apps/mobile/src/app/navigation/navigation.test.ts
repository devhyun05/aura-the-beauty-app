import {
  getStatusBarStyleForNavigationState,
  resolveActiveRouteName,
} from './navigationState';
import {
  getFooterTargetRoute,
  getDetailRouteTitle,
  getRouteChrome,
  getRoutesByDepth,
} from './routeChrome';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(getRouteChrome('HomeTab').kind, 'mainTab', 'home tab chrome');
expectEqual(getRouteChrome('HomeTab').depth, 'main', 'home tab depth');
expectEqual(getRouteChrome('ProfileEdit').kind, 'detail', 'profile edit chrome');
expectEqual(getRouteChrome('ProfileEdit').category, 'form-edit', 'profile edit category');
expectEqual(getRouteChrome('FeedbackLoading').kind, 'detail', 'feedback loading chrome');
expectEqual(getRouteChrome('FeedbackLoading').category, 'progress', 'feedback loading category');
expectEqual(getRouteChrome('ARFilter').kind, 'fullscreen', 'AR chrome');
expectEqual(getRouteChrome('ARFilter').depth, 'immersive', 'AR depth');
expectEqual(
  getDetailRouteTitle('ImageAnalysisReportDetail'),
  '맞춤 분석 보고서',
  'detail route title',
);
expectEqual(getFooterTargetRoute('home'), 'HomeTab', 'home footer target');
expectEqual(getFooterTargetRoute('custom'), 'CustomTab', 'custom footer target');
expectEqual(getFooterTargetRoute('capture'), 'ARFilter', 'capture footer action');
expectEqual(
  getRoutesByDepth('terminal').join(','),
  'ExtractedMakeupLookSaveComplete,ExtractedMakeupLookRecipeSaveComplete',
  'terminal route order',
);
expectEqual(
  resolveActiveRouteName({
    index: 0,
    routes: [
      {
        name: 'MainTabs',
        state: {
          index: 1,
          routes: [{name: 'HomeTab'}, {name: 'CustomTab'}, {name: 'ProfileTab'}],
        },
      },
    ],
  }),
  'CustomTab',
  'nested active route',
);
expectEqual(
  getStatusBarStyleForNavigationState({
    index: 0,
    routes: [{name: 'FeedbackCapture'}],
  }),
  'light',
  'immersive status bar style',
);
expectEqual(
  getStatusBarStyleForNavigationState({
    index: 0,
    routes: [
      {
        name: 'MainTabs',
        state: {
          index: 0,
          routes: [{name: 'HomeTab'}],
        },
      },
    ],
  }),
  'dark',
  'main tab status bar style',
);
