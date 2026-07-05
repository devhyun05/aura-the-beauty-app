import React from 'react';

import type {MakeupFeedbackCorrectionPoint} from '../types';
import {MakeupCorrectionTipScreen} from './MakeupCorrectionTipScreen';

const point = {
  actionLabel: '보완 포인트',
  description: '눈꼬리 끝 각도를 조금만 맞추면 눈매가 더 안정적으로 보여요.',
  id: 'eyeliner-point',
  kind: 'eye',
  title: '아이라인',
  topicId: 'eyeliner',
  topicLabel: '아이라인',
} satisfies MakeupFeedbackCorrectionPoint;

<MakeupCorrectionTipScreen onBack={() => undefined} point={point} />;