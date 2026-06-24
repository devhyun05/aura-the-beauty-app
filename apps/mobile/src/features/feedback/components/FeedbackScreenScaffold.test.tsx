import React from 'react';

import {feedbackColors} from '../../../shared/theme';
import {
  FeedbackScreenScaffold,
  getFeedbackScreenScaffoldProps,
} from './FeedbackScreenScaffold';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const scaffoldProps = getFeedbackScreenScaffoldProps();

expectEqual(
  scaffoldProps.backgroundColor,
  feedbackColors.background,
  'feedback scaffold background',
);
expectEqual(scaffoldProps.bottomPadding, 'safeArea', 'feedback scaffold bottom padding');
expectEqual(scaffoldProps.contentGap, 0, 'feedback scaffold content gap');
expectEqual(scaffoldProps.horizontalPadding, 0, 'feedback scaffold horizontal padding');
expectEqual(scaffoldProps.scroll, false, 'feedback scaffold scroll mode');
expectEqual(scaffoldProps.topPadding, 'safeArea', 'feedback scaffold top padding');

<FeedbackScreenScaffold>content</FeedbackScreenScaffold>;
