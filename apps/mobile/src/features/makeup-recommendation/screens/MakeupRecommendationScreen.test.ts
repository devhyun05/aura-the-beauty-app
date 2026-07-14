import {
  getScenarioCardEmphasis,
  makeupRecommendationDiscoveryCopy,
} from './ScenarioDiscoveryView';
import {getQuestionActionMode} from './RecommendationQuestionView';
import {makeupRecommendationResultRoleLabels} from './RecommendationResultsView';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  makeupRecommendationDiscoveryCopy.title,
  '오늘, 어떤 내가 되어볼까요?',
  'discovery title',
);
expectEqual(
  makeupRecommendationDiscoveryCopy.refresh,
  '새로운 시나리오 보여줘',
  'refresh copy',
);
expectEqual(getScenarioCardEmphasis(0), 'featured', 'first card emphasis');
expectEqual(getScenarioCardEmphasis(1), 'regular', 'second card emphasis');
expectEqual(getScenarioCardEmphasis(6), 'featured', 'seventh card emphasis');
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
  '가장 잘 어울리는 룩',
  'anchor label',
);
expectEqual(
  makeupRecommendationResultRoleLabels.bold,
  '조금 더 과감한 룩',
  'bold label',
);
expectEqual(
  makeupRecommendationResultRoleLabels.discovery,
  '예상 밖의 발견',
  'discovery label',
);
