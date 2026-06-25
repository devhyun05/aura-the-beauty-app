import React from 'react';

import type {MakeupFeedbackCorrectionPoint} from '../types';
import {MakeupCorrectionTipScreen} from './MakeupCorrectionTipScreen';

const point = {
  actionLabel: '수정팁',
  description: '오른쪽 꼬리가 왼쪽보다 조금 더 올라가 있어요',
  id: 'eyeline-point',
  kind: 'eye',
  title: '아이라인',
} satisfies MakeupFeedbackCorrectionPoint;

<MakeupCorrectionTipScreen onBack={() => undefined} point={point} />;
