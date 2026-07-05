import {
  getFloatingActionPresentation,
  getMainTabBarHostHeight,
  getMainTabBarMinHostHeight,
  shouldShowFloatingActionDismissLayer,
} from './MainTabNavigator';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getFloatingActionPresentation('arFilter'),
  'route',
  'AR filter floating action navigates directly',
);
expectEqual(
  getFloatingActionPresentation('makeupExtraction'),
  'makeupExtractionSheet',
  'makeup extraction floating action opens bottom sheet',
);
expectEqual(
  getFloatingActionPresentation('makeupFeedback'),
  'makeupFeedbackSheet',
  'makeup feedback floating action opens bottom sheet',
);
expectEqual(
  getFloatingActionPresentation('filterStore'),
  'route',
  'filter store floating action navigates directly',
);
expectEqual(
  getMainTabBarMinHostHeight(18),
  268,
  'main tab bar minimum host height includes footer and floating action space',
);
expectEqual(
  getMainTabBarHostHeight(874, 18),
  874,
  'main tab bar host can cover full screen for outside taps',
);
expectEqual(
  getMainTabBarHostHeight(220, 18),
  268,
  'main tab bar host keeps minimum footer interaction height',
);
expectEqual(
  shouldShowFloatingActionDismissLayer(true),
  true,
  'expanded floating action menu shows outside-tap dismiss layer',
);
expectEqual(
  shouldShowFloatingActionDismissLayer(false),
  false,
  'collapsed floating action menu hides outside-tap dismiss layer',
);
