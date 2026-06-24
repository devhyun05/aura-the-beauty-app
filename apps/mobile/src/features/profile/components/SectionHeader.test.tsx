import React from 'react';

import {PROFILE_SECTION_HEADER_ACTION_ICON_NAME, SectionHeader} from './SectionHeader';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  PROFILE_SECTION_HEADER_ACTION_ICON_NAME,
  'ChevronRight',
  'profile section header action icon name',
);

<SectionHeader actionLabel="전체보기" title="최근 분석" />;
