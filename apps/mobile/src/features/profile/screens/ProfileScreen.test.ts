import {
  PROFILE_SCREEN_LAYOUT_MODE,
  PROFILE_SCREEN_PREVIEW_COLUMN_COUNT,
} from './ProfileScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  PROFILE_SCREEN_LAYOUT_MODE,
  'dashboard',
  'profile screen layout mode',
);
expectEqual(
  PROFILE_SCREEN_PREVIEW_COLUMN_COUNT,
  2,
  'profile screen preview column count',
);
