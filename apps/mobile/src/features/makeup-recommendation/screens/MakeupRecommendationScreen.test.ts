import {
  getScenarioCardEmphasis,
  makeupRecommendationDiscoveryCopy,
} from './ScenarioDiscoveryView';

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
