import React from 'react';

import type {FeedbackPoint} from '../types';
import {
  FeedbackTipScreen,
  getFeedbackTipHeaderPresentation,
} from './FeedbackTipScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headerPresentation = getFeedbackTipHeaderPresentation();
const point = {
  actionLabel: '수정팁',
  description: '오른쪽 꼬리가 왼쪽보다 조금 더 올라가 있어요',
  id: 'eyeline-point',
  kind: 'eye',
  title: '아이라인',
} satisfies FeedbackPoint;

expectEqual(headerPresentation.component, 'AppHeader', 'feedback tip header component');
expectEqual(headerPresentation.title, '수정팁', 'feedback tip header title');
expectEqual(headerPresentation.leftAction, 'back', 'feedback tip header left action');

<FeedbackTipScreen onBack={() => undefined} point={point} />;
