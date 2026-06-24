import type {ReactNode} from 'react';

import {feedbackColors} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

const feedbackScreenScaffoldProps = {
  backgroundColor: feedbackColors.background,
  bottomPadding: 'safeArea',
  contentGap: 0,
  horizontalPadding: 0,
  scroll: false,
  topPadding: 'safeArea',
} as const;

export function getFeedbackScreenScaffoldProps() {
  return feedbackScreenScaffoldProps;
}

type FeedbackScreenScaffoldProps = {
  children: ReactNode;
  topPadding?: 'safeArea' | 'none';
};

export function FeedbackScreenScaffold({
  children,
  topPadding = feedbackScreenScaffoldProps.topPadding,
}: FeedbackScreenScaffoldProps) {
  return (
    <AppScreen {...feedbackScreenScaffoldProps} topPadding={topPadding}>
      {children}
    </AppScreen>
  );
}
