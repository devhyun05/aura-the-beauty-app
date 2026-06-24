import React from 'react';

import {colors, iconSize} from '../theme';
import {
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GearIcon,
  HeartIcon,
  LINE_ICON_LIBRARY_NAMES,
  MenuStackIcon,
  PencilIcon,
  XIcon,
} from './LineIcons';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  LINE_ICON_LIBRARY_NAMES.ChevronRightIcon,
  'ChevronRight',
  'chevron right icon library name',
);
expectEqual(
  LINE_ICON_LIBRARY_NAMES.ChevronLeftIcon,
  'ChevronLeft',
  'chevron left icon library name',
);
expectEqual(LINE_ICON_LIBRARY_NAMES.GearIcon, 'Settings', 'gear icon library name');
expectEqual(LINE_ICON_LIBRARY_NAMES.BookmarkIcon, 'Bookmark', 'bookmark icon library name');
expectEqual(LINE_ICON_LIBRARY_NAMES.HeartIcon, 'Heart', 'heart icon library name');
expectEqual(LINE_ICON_LIBRARY_NAMES.XIcon, 'X', 'x icon library name');
expectEqual(LINE_ICON_LIBRARY_NAMES.PencilIcon, 'Pencil', 'pencil icon library name');
expectEqual(LINE_ICON_LIBRARY_NAMES.MenuStackIcon, 'Menu', 'menu stack icon library name');

<ChevronRightIcon color={colors.textPrimary} size={iconSize.sm} />;
<ChevronLeftIcon color={colors.textPrimary} size={iconSize.sm} />;
<GearIcon color={colors.textPrimary} size={iconSize.md} />;
<BookmarkIcon color={colors.textPrimary} size={iconSize.md} />;
<HeartIcon color={colors.textPrimary} filled size={iconSize.sm} />;
<XIcon color={colors.textPrimary} size={iconSize.sm} />;
<PencilIcon color={colors.textPrimary} size={iconSize.sm} />;
<MenuStackIcon color={colors.textPrimary} size={iconSize.sm} />;
