import {getHomeRecommendedFilterMoreRouteName} from './homeRoutes';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getHomeRecommendedFilterMoreRouteName(),
  'HomeFilterStore',
  'home recommended filter more route',
);
