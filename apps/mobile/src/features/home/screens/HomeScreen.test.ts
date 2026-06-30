import {
  filterRecommendedMakeupFiltersByHomeCategory,
  getHeroCarouselInitialOffset,
  getHeroCarouselLoopResetOffset,
  getHeroCarouselRenderItems,
  createHeroCarouselLoopResetHandlers,
  getRecommendedFilterCategoryLabels,
  getRecommendedFilterGridColumnCount,
  getRecommendedFilterAccessibilityLabel,
  getRecommendedFilterRouteParams,
  heroCtaLabel,
  getHomeQuickActionPressHandler,
  getHeroTrendHeadline,
  heroTrendTitleMainTextStyle,
  heroTrendTitleReadableTextStyle,
  recommendedFilterSectionDescription,
  recommendedFilterSectionTitle,
} from './HomeScreen';
import {mapFaceAnalysisReportsToHomeSavedMakeupLooks} from '../services/homeService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {typography} from '../../../shared/theme';
import {
  getRecommendedMakeupFilterById,
  getRecommendedMakeupFilters,
} from '../../../shared/services/makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headline = getHeroTrendHeadline({
  title: '클린 오피스',
  tone: '뉴트럴 브라운',
} as const);

const expectedHeadline: '뉴트럴 브라운 무드의\n클린 오피스' = headline;
const expectedTitleColor: '#111111' = heroTrendTitleReadableTextStyle.color;
const expectedShadowColor: 'rgba(255, 255, 255, 0.30)' =
  heroTrendTitleReadableTextStyle.textShadowColor;
const expectedShadowRadius: 8 = heroTrendTitleReadableTextStyle.textShadowRadius;
const expectedShadowOffsetY: 2 = heroTrendTitleReadableTextStyle.textShadowOffset.height;
const expectedHeroCtaLabel: '보러가기' = heroCtaLabel;
const expectedRecommendedFilterSectionTitle: '추천 메이크업 필터' =
  recommendedFilterSectionTitle;
const expectedRecommendedFilterSectionDescription:
  '얼굴 무드에 맞춰 바로 적용해볼 수 있어요.' =
    recommendedFilterSectionDescription;
const expectedHeroTitleMainFontFamily: typeof typography.fontFamily.semibold =
  heroTrendTitleMainTextStyle.fontFamily;
const recommendedFilterCategoryLabels = getRecommendedFilterCategoryLabels();
const recommendedFilters = getRecommendedMakeupFilters();
const allRecommendedFilters = filterRecommendedMakeupFiltersByHomeCategory(
  recommendedFilters,
  'all',
);
const redRecommendedFilters = filterRecommendedMakeupFiltersByHomeCategory(
  recommendedFilters,
  'red',
);
const expectedRecommendedFilterGridColumnCount: 2 =
  getRecommendedFilterGridColumnCount();
const heroCarouselItems = [
  {id: 'first', title: '첫 카드'},
  {id: 'second', title: '두번째 카드'},
  {id: 'third', title: '마지막 카드'},
] as const;
const loopedHeroCarouselItems = getHeroCarouselRenderItems(heroCarouselItems);
const heroCarouselSnapInterval = 320;
const heroCarouselScrollEndHandler = () => undefined;
const heroCarouselLoopResetHandlers =
  createHeroCarouselLoopResetHandlers(heroCarouselScrollEndHandler);
const cleanSmokyFilter = getRecommendedMakeupFilterById('filter-clean-smoky-city');
const cleanSmokyRouteParams = getRecommendedFilterRouteParams(cleanSmokyFilter.id);

expectEqual(headline, expectedHeadline, 'weekly trend headline');
expectEqual(
  heroTrendTitleReadableTextStyle.color,
  expectedTitleColor,
  'weekly trend title color',
);
expectEqual(
  heroTrendTitleReadableTextStyle.textShadowColor,
  expectedShadowColor,
  'weekly trend title shadow color',
);
expectEqual(
  heroTrendTitleReadableTextStyle.textShadowRadius,
  expectedShadowRadius,
  'weekly trend title shadow radius',
);
expectEqual(
  heroTrendTitleReadableTextStyle.textShadowOffset.height,
  expectedShadowOffsetY,
  'weekly trend title shadow offset',
);
expectEqual(heroCtaLabel, expectedHeroCtaLabel, 'hero CTA label');
expectEqual(
  recommendedFilterSectionTitle,
  expectedRecommendedFilterSectionTitle,
  'recommended filter section title',
);
expectEqual(
  recommendedFilterSectionDescription,
  expectedRecommendedFilterSectionDescription,
  'recommended filter section description',
);
expectEqual(
  heroTrendTitleMainTextStyle.fontFamily,
  expectedHeroTitleMainFontFamily,
  'weekly trend main title font family',
);
expectEqual(
  recommendedFilterCategoryLabels.join(','),
  '전체,레드,글로우,스모키,브라운,핑크,트렌드,유니크',
  'recommended filter category labels',
);
expectEqual(
  allRecommendedFilters.length,
  recommendedFilters.length,
  'recommended filter all category count',
);
expectEqual(
  redRecommendedFilters.some(filter => filter.id === 'filter-wanghong-glass-pink'),
  true,
  'recommended filter red category includes Wanghong filter',
);
expectEqual(
  getRecommendedFilterGridColumnCount(),
  expectedRecommendedFilterGridColumnCount,
  'recommended filter grid column count',
);
expectEqual(
  loopedHeroCarouselItems[0].id,
  'third',
  'hero carousel leading loop card',
);
expectEqual(
  loopedHeroCarouselItems[loopedHeroCarouselItems.length - 1].id,
  'first',
  'hero carousel trailing loop card',
);
expectEqual(
  getHeroCarouselInitialOffset({
    itemCount: heroCarouselItems.length,
    snapInterval: heroCarouselSnapInterval,
  }),
  heroCarouselSnapInterval,
  'hero carousel initial offset',
);
expectEqual(
  getHeroCarouselLoopResetOffset({
    itemCount: heroCarouselItems.length,
    scrollOffsetX: 0,
    snapInterval: heroCarouselSnapInterval,
  }),
  heroCarouselSnapInterval * heroCarouselItems.length,
  'hero carousel first-to-last loop offset',
);
expectEqual(
  getHeroCarouselLoopResetOffset({
    itemCount: heroCarouselItems.length,
    scrollOffsetX: heroCarouselSnapInterval * (heroCarouselItems.length + 1),
    snapInterval: heroCarouselSnapInterval,
  }),
  heroCarouselSnapInterval,
  'hero carousel last-to-first loop offset',
);
expectEqual(
  getHeroCarouselLoopResetOffset({
    itemCount: 1,
    scrollOffsetX: 0,
    snapInterval: heroCarouselSnapInterval,
  }),
  null,
  'single hero carousel card does not loop',
);
expectEqual(
  heroCarouselLoopResetHandlers.onMomentumScrollEnd,
  heroCarouselScrollEndHandler,
  'hero carousel momentum end reset handler',
);
expectEqual(
  heroCarouselLoopResetHandlers.onScrollEndDrag,
  heroCarouselScrollEndHandler,
  'hero carousel drag end reset handler',
);
expectEqual(
  getRecommendedFilterAccessibilityLabel(cleanSmokyFilter),
  '차가운 도시의 클린 스모키, 96퍼센트 추천',
  'recommended filter accessibility label',
);
expectEqual(
  cleanSmokyRouteParams.initialMakeupFilterId,
  cleanSmokyFilter.id,
  'recommended filter route id',
);
expectEqual(
  cleanSmokyRouteParams.initialGuideMode,
  'half',
  'recommended filter route guide mode',
);
expectEqual(
  cleanSmokyRouteParams.source,
  'recommendedFilter',
  'recommended filter route source',
);

let selectedQuickAction: 'community' | 'consulting' | 'recommendation' | null = null;

const recommendationPressHandler = getHomeQuickActionPressHandler('recommendation', {
  onPressProductRecommendations: () => {
    selectedQuickAction = 'recommendation';
  },
});

if (!recommendationPressHandler) {
  throw new Error('product recommendation quick action should have a press handler');
}

recommendationPressHandler();

expectEqual(selectedQuickAction, 'recommendation', 'product recommendation quick action target');

const communityPressHandler = getHomeQuickActionPressHandler('community', {
  onPressCommunity: () => {
    selectedQuickAction = 'community';
  },
});

if (!communityPressHandler) {
  throw new Error('community quick action should have a press handler');
}

communityPressHandler();

expectEqual(selectedQuickAction, 'community', 'community quick action target');

const consultingPressHandler = getHomeQuickActionPressHandler('consulting', {
  onPressConsulting: () => {
    selectedQuickAction = 'consulting';
  },
});

if (!consultingPressHandler) {
  throw new Error('consulting quick action should have a press handler');
}

consultingPressHandler();

expectEqual(selectedQuickAction, 'consulting', 'consulting quick action target');

const completeReport: FaceAnalysisReport = {
  analyzedAt: '2026-06-29T07:00:00.000Z',
  avoidedMakeups: [],
  baseMakeupGuide: '얇은 베이스',
  environmentLabel: '촬영 이미지',
  faceShape: '계란형',
  id: 'analysis-complete',
  imageSource: {uri: 'https://example.com/source.png'},
  makeupGuideline: {
    brow: '브라운 눈썹',
    blush: '로지 치크',
    highlight: '은은한 하이라이트',
    eyeshadow: '뉴트럴 섀도우',
    eyeliner: '브라운 라인',
    lip: '로지 립',
  },
  personalColor: '봄웜',
  recommendedMakeups: [
    {
      description: '첫 번째 추천',
      id: 'look-1',
      imageSource: {uri: 'https://example.com/look-1.png'},
      subtitle: '맑은 코랄',
      tags: [],
      title: '추천 룩 1',
    },
    {
      description: '두 번째 추천',
      id: 'look-2',
      imageSource: {uri: 'https://example.com/look-2.png'},
      subtitle: '로지 데일리',
      tags: [],
      title: '추천 룩 2',
    },
    {
      description: '세 번째 추천',
      id: 'look-3',
      imageSource: {uri: 'https://example.com/look-3.png'},
      subtitle: '브라운 무드',
      tags: [],
      title: '추천 룩 3',
    },
  ],
  recommendedMood: '맑은 코랄 글로우',
  reportTitle: '맞춤 분석 보고서',
  shortSummary: '요약',
  skinAnalysisSummary: '피부 요약',
  skinType: '복합성',
  summary: '분석 요약',
  tags: [],
  title: '봄웜, 복합성',
  toneSummary: '맑은 톤',
};
const partialReport: FaceAnalysisReport = {
  ...completeReport,
  id: 'analysis-partial',
  recommendedMakeups: completeReport.recommendedMakeups.slice(0, 2),
};
const savedHomeMakeupLooks = mapFaceAnalysisReportsToHomeSavedMakeupLooks([
  completeReport,
  partialReport,
]);

expectEqual(savedHomeMakeupLooks.length, 5, 'home saved makeup keeps remaining saved cards');
expectEqual(savedHomeMakeupLooks[0].title, '추천 룩 1', 'home saved makeup uses AI title');
expectEqual(
  savedHomeMakeupLooks[1].description,
  '로지 데일리',
  'home saved makeup uses AI subtitle',
);
