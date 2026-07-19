import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import type {MakeupFeedbackResult} from '../types';
import {MakeupFeedbackResultScreen} from './MakeupFeedbackResultScreen';

const result = createMockMakeupFeedback({photoSource: 'camera'});

<MakeupFeedbackResultScreen
  onOpenMakeupJourney={() => undefined}
  result={result}
/>;

const legacyResult: MakeupFeedbackResult = {
  ...result,
  scoreBreakdown: undefined,
};

<MakeupFeedbackResultScreen
  onOpenMakeupJourney={() => undefined}
  result={legacyResult}
/>;

const correctionGuide = {
  amount: '브러시 끝에 한 번 묻힌 양',
  coverage: '눈꼬리 바깥쪽 3분의 1 범위',
  steps: ['손등에 한 번 덜어냅니다.', '눈꼬리부터 짧게 연결합니다.'],
  stopCondition: '정면에서 양쪽 끝 방향이 자연스럽게 이어질 때 멈춥니다.',
  targetArea: '양쪽 눈꼬리 끝',
  tool: '납작한 아이라인 브러시',
  why: '라인 끝을 정리하면 얼굴 전체의 시선 흐름이 안정됩니다.',
};
const v2Result: MakeupFeedbackResult = {
  ...result,
  evaluations: result.evaluations.map((evaluation, index) =>
    index === 0 ? {...evaluation, correctionGuide, scoreImpact: 'high'} : evaluation,
  ),
  points: result.points.map((point, index) =>
    index === 0 ? {...point, correctionGuide} : point,
  ),
  scoreBreakdown: {
    axes: [
      {
        evidenceIds: [],
        id: 'application-finish',
        label: '적용 완성도',
        maxScore: 30,
        reason: '경계와 피부 표현이 정돈됐어요.',
        score: 25,
      },
      {
        evidenceIds: [],
        id: 'placement-balance',
        label: '배치·형태 균형',
        maxScore: 25,
        reason: '선과 면의 위치가 안정적이에요.',
        score: 20,
      },
      {
        evidenceIds: [],
        id: 'color-value-harmony',
        label: '색·명암 조화',
        maxScore: 20,
        reason: '색과 명암의 연결이 자연스러워요.',
        score: 17,
      },
      {
        evidenceIds: [],
        id: 'overall-goal-fit',
        label: '전체 조화·목표 적합도',
        maxScore: 25,
        reason: '요청한 분위기와 전체 인상이 잘 맞아요.',
        score: 22,
      },
    ],
    formula: '적용 완성도 25/30 + 배치·형태 균형 20/25 + 색·명암 조화 17/20 + 전체 조화·목표 적합도 22/25 = 84/100',
    maxScore: 100,
  },
};

<MakeupFeedbackResultScreen
  onOpenMakeupJourney={() => undefined}
  result={v2Result}
/>;
