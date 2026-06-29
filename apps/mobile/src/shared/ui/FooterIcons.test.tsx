import React from 'react';

import {iconSize} from '../theme';
import {
  BrushFooterIcon,
  CameraFooterIcon,
  FOOTER_RECOMMENDATION_ICON_NAME,
  HomeFooterIcon,
} from './FooterIcons';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  FOOTER_RECOMMENDATION_ICON_NAME,
  'WandSparkles',
  'footer recommendation icon name',
);

<HomeFooterIcon color="#111111" size={iconSize.md} strokeWidth={2.1} />;
<CameraFooterIcon color="#111111" size={iconSize.lg} strokeWidth={2.1} />;
<BrushFooterIcon color="#111111" size={iconSize.md} strokeWidth={2.1} />;
