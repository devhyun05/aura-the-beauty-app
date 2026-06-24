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
};

export function FeedbackScreenScaffold({children}: FeedbackScreenScaffoldProps) {
  return <AppScreen {...feedbackScreenScaffoldProps}>{children}</AppScreen>;
}
