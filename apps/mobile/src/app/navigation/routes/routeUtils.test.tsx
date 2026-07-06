import {
  getMainTabHeaderBorderWidth,
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
  getMainTabHeaderBorderWidth('CommunityTab'),
  0,
  'community tab header border is hidden',
);
