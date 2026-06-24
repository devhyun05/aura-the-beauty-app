import React from 'react';

import {iconSize} from '../theme';
import {
  PROFILE_HEADER_ICON_HEAD_SIZE,
  PROFILE_HEADER_ICON_ROOT_SIZE,
  PROFILE_HEADER_ICON_SHOULDERS_WIDTH,
  ProfileHeaderIcon,
  SearchHeaderIcon,
} from './HeaderIcons';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  PROFILE_HEADER_ICON_ROOT_SIZE,
  iconSize.sm,
  'profile header icon root size',
);
expectEqual(PROFILE_HEADER_ICON_HEAD_SIZE, 9, 'profile header icon head size');
expectEqual(
  PROFILE_HEADER_ICON_SHOULDERS_WIDTH,
  18,
  'profile header icon shoulders width',
);

<SearchHeaderIcon color="#111111" />;
<ProfileHeaderIcon color="#111111" />;
