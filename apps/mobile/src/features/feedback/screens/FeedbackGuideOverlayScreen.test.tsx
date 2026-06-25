import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import {
  FeedbackGuideOverlayScreen,
  getFeedbackGuideOverlayHeaderPresentation,
} from './FeedbackGuideOverlayScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headerPresentation = getFeedbackGuideOverlayHeaderPresentation();
const result = createMockMakeupFeedback({source: 'gallery'});

expectEqual(headerPresentation.component, 'AppHeader', 'feedback guide header component');
expectEqual(headerPresentation.title, '가이드 오버레이', 'feedback guide header title');
expectEqual(headerPresentation.leftAction, 'back', 'feedback guide header left action');

<FeedbackGuideOverlayScreen onBack={() => undefined} result={result} />;
