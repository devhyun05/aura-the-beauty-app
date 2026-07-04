import {getPostLoginRouteForFlags} from './authRoutes';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const incompleteProfileRoute = getPostLoginRouteForFlags({
  hasCompletedInitialGuide: false,
  hasCompletedProfile: false,
  hasStoredProfile: false,
});

expectEqual(
  incompleteProfileRoute.routeName,
  'ProfileSetup',
  'post login route requires profile setup first',
);
expectEqual(
  incompleteProfileRoute.shouldShowBeautyJourneyGuide,
  false,
  'profile setup route does not show home guide yet',
);

const firstHomeRoute = getPostLoginRouteForFlags({
  hasCompletedInitialGuide: false,
  hasCompletedProfile: true,
  hasStoredProfile: true,
});

expectEqual(firstHomeRoute.routeName, 'MainTabs', 'post login first home route');
expectEqual(
  firstHomeRoute.shouldShowBeautyJourneyGuide,
  true,
  'first home route shows beauty journey guide',
);

const returningHomeRoute = getPostLoginRouteForFlags({
  hasCompletedInitialGuide: true,
  hasCompletedProfile: true,
  hasStoredProfile: true,
});

expectEqual(returningHomeRoute.routeName, 'MainTabs', 'post login returning home route');
expectEqual(
  returningHomeRoute.shouldShowBeautyJourneyGuide,
  false,
  'returning home route skips beauty journey guide',
);
