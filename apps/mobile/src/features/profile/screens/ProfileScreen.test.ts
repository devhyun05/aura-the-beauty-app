import {
  PROFILE_SCREEN_LAYOUT_MODE,
  PROFILE_SCREEN_PREVIEW_COLUMN_COUNT,
  PROFILE_SCREEN_REPORT_COLUMN_COUNT,
  PROFILE_SCREEN_REPORT_SCROLL_AXIS,
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
expectEqual(
  PROFILE_SCREEN_REPORT_COLUMN_COUNT,
  2,
  'profile report column count',
);
expectEqual(
  PROFILE_SCREEN_REPORT_SCROLL_AXIS,
  'horizontal',
  'profile report scroll axis',
);
