import React from 'react';

import {feedbackColors} from '../../../shared/theme';
import {
  MakeupFeedbackScreenScaffold,
  getMakeupFeedbackScreenScaffoldProps,
} from './MakeupFeedbackScreenScaffold';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const scaffoldProps = getMakeupFeedbackScreenScaffoldProps();

expectEqual(
  scaffoldProps.backgroundColor,
  feedbackColors.background,
  'makeup feedback scaffold background',
);
expectEqual(scaffoldProps.bottomPadding, 'safeArea', 'makeup feedback scaffold bottom padding');
expectEqual(scaffoldProps.contentGap, 0, 'makeup feedback scaffold content gap');
expectEqual(scaffoldProps.horizontalPadding, 0, 'makeup feedback scaffold horizontal padding');
expectEqual(scaffoldProps.scroll, false, 'makeup feedback scaffold scroll mode');
expectEqual(scaffoldProps.topPadding, 'safeArea', 'makeup feedback scaffold top padding');

<MakeupFeedbackScreenScaffold>content</MakeupFeedbackScreenScaffold>;
