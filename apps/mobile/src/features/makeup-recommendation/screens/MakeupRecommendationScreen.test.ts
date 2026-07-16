import {
  getQuestionActionMode,
  getQuestionProgressSegments,
  formatMakeupRecommendationHistoryDate,
  makeupRecommendationDiscoveryCopy,
  makeupRecommendationResultRoleLabels,
  makeupRecommendationImageStatusCopy,
  makeupRecommendationHistoryCopy,
  makeupRecommendationReportStatusCopy,
  shouldHandleMakeupRecommendationBack,
  toggleExpandedLookId,
} from './makeupRecommendationViewContracts';
import {getMakeupRecommendationAgentMessage} from '../services/makeupRecommendationAgentConversation';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  makeupRecommendationDiscoveryCopy.title,
  '지금 끌리는 한 문장에서 시작해보세요.',
  'discovery title',
);
expectEqual(makeupRecommendationDiscoveryCopy.description, '', 'discovery description is consolidated into title');
expectEqual(
  makeupRecommendationDiscoveryCopy.refresh,
  '새로 보기',
  'refresh copy',
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
expectEqual(makeupRecommendationHistoryCopy.title, '지난 추천', 'history title');
expectEqual(makeupRecommendationReportStatusCopy.saved, '보고서 저장됨', 'saved report status');
expectEqual(
  formatMakeupRecommendationHistoryDate('2026-07-14T12:34:56Z'),
  '2026. 07. 14.',
  'history date format',
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
  shouldHandleMakeupRecommendationBack('history'),
  true,
  'history back returns to discovery',
);
expectEqual(
  getQuestionProgressSegments({currentQuestionIndex: 1, questionCount: 3}).join(','),
  'complete,complete,pending',
  'segmented question progress',
);
const opened = toggleExpandedLookId(new Set<string>(), 'look-a');
expectEqual(opened.has('look-a'), true, 'result detail opens');
expectEqual(toggleExpandedLookId(opened, 'look-a').has('look-a'), false, 'result detail closes');

const loadingContext = {
  answerKeywords: [
    {dimension: 'occasion' as const, label: '출근할 때'},
    {dimension: 'mood' as const, label: '맑고 단정하게'},
    {dimension: 'boldness' as const, label: '자연스럽게'},
    {dimension: 'timeSkill' as const, label: '10분 안에'},
  ],
  personalColor: '여름 쿨톤',
  prompt: '회사에서 자연스러운 메이크업',
  useProfile: true,
};
const loadingMessages = Array.from({length: 40}, (_, index) =>
  getMakeupRecommendationAgentMessage(loadingContext, index),
);
expectEqual(
  loadingMessages.some(message => message.text.includes('맑고 단정하게')),
  true,
  'agent conversation includes reverse-question mood keyword',
);
expectEqual(
  loadingMessages.some(message => message.text.includes('10분 안에')),
  true,
  'agent conversation includes reverse-question routine keyword',
);
expectEqual(
  loadingMessages[39].text.length > 0,
  true,
  'agent conversation keeps producing messages during long generation',
);
