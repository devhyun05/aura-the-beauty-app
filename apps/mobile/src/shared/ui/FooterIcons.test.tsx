import React from 'react';

import {iconSize} from '../theme';
import {
  CommunityFooterIcon,
  ConsultingFooterIcon,
  FloatingActionFooterIcon,
  FOOTER_ACTION_ICON_NAME,
  FOOTER_CONSULTING_ICON_NAME,
  HomeFooterIcon,
  ProfileFooterIcon,
} from './FooterIcons';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  FOOTER_ACTION_ICON_NAME,
  'Sparkles',
  'footer action icon name',
);
expectEqual(
  FOOTER_CONSULTING_ICON_NAME,
  'Compass',
  'footer consulting icon name',
);

<HomeFooterIcon color="#111111" size={iconSize.md} strokeWidth={2.1} />;
<ProfileFooterIcon color="#111111" size={iconSize.md} strokeWidth={2.1} />;
<CommunityFooterIcon color="#111111" size={iconSize.md} strokeWidth={2.1} />;
<ConsultingFooterIcon color="#111111" size={iconSize.md} strokeWidth={2.1} />;
<FloatingActionFooterIcon color="#111111" size={iconSize.lg} strokeWidth={2.1} />;
