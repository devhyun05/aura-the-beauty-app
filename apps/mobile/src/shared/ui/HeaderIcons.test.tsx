import React from 'react';

import {
  HEADER_ICON_LIBRARY_NAMES,
  ProfileHeaderIcon,
  SearchHeaderIcon,
} from './HeaderIcons';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  HEADER_ICON_LIBRARY_NAMES.SearchHeaderIcon,
  'Search',
  'search header icon library name',
);
expectEqual(
  HEADER_ICON_LIBRARY_NAMES.ProfileHeaderIcon,
  'UserRound',
  'profile header icon library name',
);

<SearchHeaderIcon color="#111111" />;
<ProfileHeaderIcon color="#111111" />;
