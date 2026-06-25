import {
  getFooterTargetRoute,
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
expectEqual(getRouteChrome('ARMakeupFilter').kind, 'fullscreen', 'AR chrome');
expectEqual(getRouteChrome('ARMakeupFilter').depth, 'immersive', 'AR depth');
expectEqual(getFooterTargetRoute('home'), 'HomeTab', 'home footer target');
expectEqual(getFooterTargetRoute('custom'), 'CustomTab', 'custom footer target');
expectEqual(getFooterTargetRoute('capture'), 'ARMakeupFilter', 'capture footer action');
expectEqual(
  getRoutesByDepth('terminal').join(','),
  'FilterSaved,RecipeSaved',
  'terminal route order',
);
