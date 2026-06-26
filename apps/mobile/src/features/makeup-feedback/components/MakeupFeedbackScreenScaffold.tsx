import type {ReactNode} from 'react';

import {feedbackColors} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

const makeupFeedbackScreenScaffoldProps = {
  backgroundColor: feedbackColors.background,
  bottomPadding: 'safeArea',
  contentGap: 0,
  horizontalPadding: 0,
  scroll: false,
  topPadding: 'safeArea',
} as const;

export function getMakeupFeedbackScreenScaffoldProps() {
  return makeupFeedbackScreenScaffoldProps;
}

type MakeupFeedbackScreenScaffoldProps = {
  children: ReactNode;
  topPadding?: 'safeArea' | 'none';
};

export function MakeupFeedbackScreenScaffold({
  children,
  topPadding = makeupFeedbackScreenScaffoldProps.topPadding,
}: MakeupFeedbackScreenScaffoldProps) {
  return (
    <AppScreen {...makeupFeedbackScreenScaffoldProps} topPadding={topPadding}>
      {children}
    </AppScreen>
  );
}
