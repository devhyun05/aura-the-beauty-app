import React from 'react';

import {
  FeedbackDetailHeader,
  getFeedbackDetailHeaderTitle,
} from './FeedbackDetailHeader';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getFeedbackDetailHeaderTitle('result'),
  '메이크업 피드백',
  'feedback result header title',
);
expectEqual(
  getFeedbackDetailHeaderTitle('tip'),
  '수정팁',
  'feedback tip header title',
);
expectEqual(
  getFeedbackDetailHeaderTitle('guide'),
  '가이드 오버레이',
  'feedback guide header title',
);

<FeedbackDetailHeader onBack={() => undefined} variant="result" />;
<FeedbackDetailHeader onBack={() => undefined} variant="tip" />;
<FeedbackDetailHeader onBack={() => undefined} variant="guide" />;
