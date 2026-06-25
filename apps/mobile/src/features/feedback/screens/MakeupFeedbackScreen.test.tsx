import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import {
  MakeupFeedbackScreen,
  getMakeupFeedbackHeaderPresentation,
} from './MakeupFeedbackScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headerPresentation = getMakeupFeedbackHeaderPresentation();
const result = createMockMakeupFeedback({source: 'camera'});

expectEqual(headerPresentation.component, 'AppHeader', 'makeup feedback header component');
expectEqual(headerPresentation.title, '메이크업 피드백', 'makeup feedback header title');
expectEqual(headerPresentation.leftAction, 'back', 'makeup feedback header left action');

<MakeupFeedbackScreen
  onBack={() => undefined}
  onOpenGuide={() => undefined}
  onOpenTip={() => undefined}
  onRetake={() => undefined}
  onUploadAgain={() => undefined}
  result={result}
/>;
