import type {ReactNode} from 'react';

import {consultingColors, consultingSpacing} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

type ConsultingScreenScaffoldProps = {
  children: ReactNode;
  scroll?: boolean;
  contentGap?: number;
  bottomPadding?: number | 'safeArea' | 'floatingFooter';
  backgroundColor?: string;
};

export function ConsultingScreenScaffold({
  children,
  scroll = true,
  contentGap = consultingSpacing.sectionGap,
  bottomPadding = 'safeArea',
  backgroundColor = consultingColors.background,
}: ConsultingScreenScaffoldProps) {
  return (
    <AppScreen
      backgroundColor={backgroundColor}
      bottomPadding={bottomPadding}
      contentGap={contentGap}
      horizontalPadding={consultingSpacing.screenX}
      scroll={scroll}
      topPadding="belowShellHeader">
      {children}
    </AppScreen>
  );
}
