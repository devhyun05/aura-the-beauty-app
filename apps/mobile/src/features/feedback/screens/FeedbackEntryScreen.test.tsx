import React from 'react';

import {
  FeedbackEntryScreen,
  getFeedbackEntryHeaderPresentation,
} from './FeedbackEntryScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headerPresentation = getFeedbackEntryHeaderPresentation();

expectEqual(headerPresentation.component, 'AppHeader', 'feedback entry header component');
expectEqual(headerPresentation.title, '메이크업 피드백', 'feedback entry header title');
expectEqual(headerPresentation.rightAction, 'close', 'feedback entry header right action');

<FeedbackEntryScreen onClose={() => undefined} onPressAiFeedback={() => undefined} />;
