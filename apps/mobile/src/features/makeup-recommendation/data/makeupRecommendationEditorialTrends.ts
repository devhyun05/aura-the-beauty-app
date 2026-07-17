import {MAKEUP_SCENARIOS} from './makeupRecommendationCatalog';
import type {
  MakeupRecommendationDiscovery,
  MakeupScenarioPrompt,
  MakeupSituation,
  MakeupTrendKeyword,
} from '../types';

export const MAKEUP_RECOMMENDATION_EDITORIAL_TREND_INITIAL_COUNT = 6;

const wanghongGlass: MakeupScenarioPrompt = {
  id: 'wanghong-glass',
  displayText: '왕홍 레드 글래스',
  seedPrompt: '레드 음영과 루비 글로스 립으로 화면 속 선명도를 높인 왕홍 무드 룩',
  intentTags: ['wanghong', 'douyin', 'red', 'glow'],
  knownDimensions: ['mood'],
  tone: 'playful',
  source: 'curated',
  copyStyle: 'editorial',
  visualEmphasis: 'featured',
  palette: 'accent',
  preferredColumnSpan: 4,
};

function requireScenario(id: string): MakeupScenarioPrompt {
  const scenario = MAKEUP_SCENARIOS.find(item => item.id === id);
  if (!scenario) throw new Error(`Missing curated makeup scenario: ${id}`);
  return scenario;
}

export const MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS = [
  requireScenario('baseball-camera'),
  wanghongGlass,
  requireScenario('trend-my-way'),
  requireScenario('neon-two-am'),
  requireScenario('saved-look'),
  requireScenario('hip-point'),
  requireScenario('ex-wedding'),
  requireScenario('art-student'),
  requireScenario('camera-first'),
  requireScenario('concert-encore'),
  requireScenario('not-a-blind-date'),
  requireScenario('one-lip'),
] as const satisfies readonly MakeupScenarioPrompt[];

function situationKeywordToTrend(
  situation: MakeupSituation,
  keyword: MakeupTrendKeyword,
): MakeupScenarioPrompt {
  return {
    id: keyword.id,
    displayText: keyword.label,
    seedPrompt: keyword.seedPrompt,
    intentTags: keyword.tags,
    knownDimensions: [],
    tone: 'premium',
    source: 'personalized',
    copyStyle: 'editorial',
    visualEmphasis: 'compact',
    palette: 'soft',
    preferredColumnSpan: 4,
    keyword,
    situation,
  };
}

export function getMakeupRecommendationEditorialTrends(
  catalog: MakeupRecommendationDiscovery | null,
): readonly MakeupScenarioPrompt[] {
  const situationTrends = (catalog?.situations ?? []).flatMap(situation => {
    const keyword = situation.keywords[0];
    return keyword ? [situationKeywordToTrend(situation, keyword)] : [];
  });
  const [leadTrend, secondTrend, ...remainingEditorialTrends] =
    MAKEUP_RECOMMENDATION_EDITORIAL_TRENDS;
  const leadingSituationTrends = situationTrends.slice(0, 4);
  const remainingSituationTrends = situationTrends.slice(4);
  const combined = [
    ...leadingSituationTrends,
    leadTrend,
    secondTrend,
    ...remainingSituationTrends,
    ...remainingEditorialTrends,
  ].filter((trend): trend is MakeupScenarioPrompt => Boolean(trend));

  return combined.filter(
    (trend, index) =>
      combined.findIndex(candidate => candidate.displayText === trend.displayText) === index,
  );
}
