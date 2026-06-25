import React from 'react';

import type {FeedbackPhotoSelection} from '../types';
import {
  FeedbackLoadingScreen,
  getFeedbackLoadingHeaderPresentation,
} from './FeedbackLoadingScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headerPresentation = getFeedbackLoadingHeaderPresentation();
const selection = {source: 'camera'} satisfies FeedbackPhotoSelection;

expectEqual(headerPresentation.component, 'AppHeader', 'feedback loading header component');
expectEqual(headerPresentation.title, '메이크업 피드백', 'feedback loading header title');
expectEqual(headerPresentation.leftAction, 'back', 'feedback loading header left action');

<FeedbackLoadingScreen
  onBack={() => undefined}
  onComplete={() => undefined}
  selection={selection}
/>;
