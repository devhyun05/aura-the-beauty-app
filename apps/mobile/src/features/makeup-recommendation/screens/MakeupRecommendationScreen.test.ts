import {
  getQuestionActionMode,
  getQuestionProgressSegments,
  makeupRecommendationDiscoveryCopy,
  makeupRecommendationResultRoleLabels,
  makeupRecommendationImageStatusCopy,
  makeupRecommendationFallbackCopy,
  shouldHandleMakeupRecommendationBack,
  toggleExpandedLookId,
} from './makeupRecommendationViewContracts';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  makeupRecommendationDiscoveryCopy.title,
  '어떤 모습이 끌리나요?',
  'discovery title',
);
expectEqual(
  makeupRecommendationDiscoveryCopy.refresh,
  '새로 보기',
  'refresh copy',
);
expectEqual(
  makeupRecommendationDiscoveryCopy.scenarioLoadError,
  '새 카드를 더 만들지 못했어요. 잠시 후 다시 눌러주세요.',
  'scenario load error copy',
);
expectEqual(makeupRecommendationDiscoveryCopy.profile, '내 분석 결과 반영', 'profile copy');
expectEqual(
  getQuestionActionMode({currentQuestionIndex: 0, questionCount: 2}),
  'advance',
  'early question advances',
);
expectEqual(
  getQuestionActionMode({currentQuestionIndex: 1, questionCount: 2}),
  'complete',
  'last question completes',
);
expectEqual(
  makeupRecommendationResultRoleLabels.anchor,
  '가장 잘 어울리는 메이크업',
  'anchor label',
);
expectEqual(
  makeupRecommendationResultRoleLabels.bold,
  '조금 더 과감한 메이크업',
  'bold label',
);
expectEqual(
  makeupRecommendationResultRoleLabels.discovery,
  '예상 밖의 발견',
  'discovery label',
);
expectEqual(
  makeupRecommendationImageStatusCopy.failedAction,
  '이미지 다시 만들기',
  'failed image retry action',
);
expectEqual(
  makeupRecommendationFallbackCopy.retryAction,
  'AI 추천 다시 연결하기',
  'local fallback retry action',
);
expectEqual(
  shouldHandleMakeupRecommendationBack('discovery'),
  false,
  'discovery back exits route',
);
expectEqual(
  shouldHandleMakeupRecommendationBack('question'),
  true,
  'question back returns to discovery',
);
expectEqual(
  shouldHandleMakeupRecommendationBack('results'),
  true,
  'results back returns to discovery',
);
expectEqual(
  getQuestionProgressSegments({currentQuestionIndex: 1, questionCount: 3}).join(','),
  'complete,complete,pending',
  'segmented question progress',
);
const opened = toggleExpandedLookId(new Set<string>(), 'look-a');
expectEqual(opened.has('look-a'), true, 'result detail opens');
expectEqual(toggleExpandedLookId(opened, 'look-a').has('look-a'), false, 'result detail closes');
