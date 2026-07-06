import {
  filterRecommendedMakeupFiltersByHomeCategory,
  getHeroCarouselInitialOffset,
  getHeroCarouselLoopResetOffset,
  getHeroCarouselRenderItems,
  createHeroCarouselLoopResetHandlers,
  getRecommendedFilterCategoryLabels,
  getRecommendedFilterGridColumnCount,
  getIsHomeScrollTopButtonVisible,
  getRecommendedFilterAccessibilityLabel,
  getRecommendedFilterRouteParams,
  getHomeMakeupExtractionActionLabels,
  getHomeMakeupFeedbackActionLabels,
  getHomeServiceShortcutPresentation,
  heroCtaLabel,
  getHomeServiceShortcutPressHandler,
  getHomeServiceShortcutLabels,
  getHomeServiceShortcutRowLabels,
  getHeroTrendHeadline,
  homeHeroLayoutMetrics,
  heroTrendTitleMainTextStyle,
  heroTrendTitleReadableTextStyle,
  HOME_CONSULTING_SERVICE_SHORTCUT_ICON_NAME,
  HOME_FILTER_STORE_SERVICE_SHORTCUT_ICON_NAME,
  HOME_SERVICE_SHORTCUT_LABEL_MIN_HEIGHT,
  HOME_SERVICE_SHORTCUT_LABEL_NUMBER_OF_LINES,
  HOME_SERVICE_SHORTCUT_LABELS,
  HOME_SCROLL_TOP_VISIBLE_OFFSET,
  recommendedFilterCopyVerticalPadding,
  recommendedFilterListVirtualizationConfig,
  recommendedFilterMoreButtonLabel,
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
const expectedRecommendedFilterSectionDescription: undefined =
  recommendedFilterSectionDescription;
const expectedRecommendedFilterMoreButtonLabel: '더보기' =
  recommendedFilterMoreButtonLabel;
const expectedRecommendedFilterCopyVerticalPadding: 10 =
  recommendedFilterCopyVerticalPadding;
const expectedHeroTitleMainFontFamily: typeof typography.fontFamily.semibold =
  heroTrendTitleMainTextStyle.fontFamily;
const expectedHomeHeroTopPadding: 8 = homeHeroLayoutMetrics.listTopPadding;
const expectedHomeHeroCopyGap: 8 = homeHeroLayoutMetrics.copyGap;
const expectedHomeHeroTitleGroupGap: 2 = homeHeroLayoutMetrics.titleGroupGap;
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
const homeServiceShortcutLabels = getHomeServiceShortcutLabels();
const expectedHomeServiceShortcutLabels: readonly [
  '얼굴 분석',
  '메이크업 필터',
  '컨설팅',
  '반반메이크업',
  '커뮤니티',
  '메이크업 추출',
  '필터 스토어',
  '추천 제품',
  '메이크업 피드백',
] = HOME_SERVICE_SHORTCUT_LABELS;
const homeServiceShortcutRowLabels = getHomeServiceShortcutRowLabels();
const expectedHomeServiceShortcutFirstRowLabels =
  '얼굴 분석,메이크업 필터,컨설팅,반반메이크업,커뮤니티';
const expectedHomeServiceShortcutSecondRowLabels =
  '메이크업 추출,필터 스토어,추천 제품,메이크업 피드백';
const makeupExtractionActionLabels = getHomeMakeupExtractionActionLabels();
const makeupFeedbackActionLabels = getHomeMakeupFeedbackActionLabels();
const expectedRecommendedFilterGridColumnCount: 2 =
  getRecommendedFilterGridColumnCount();
const expectedInitialRecommendedFiltersToRender: 6 =
  recommendedFilterListVirtualizationConfig.initialNumToRender;
const expectedRecommendedFilterRenderBatchSize: 4 =
  recommendedFilterListVirtualizationConfig.maxToRenderPerBatch;
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
  recommendedFilterMoreButtonLabel,
  expectedRecommendedFilterMoreButtonLabel,
  'recommended filter more button label',
);
expectEqual(
  recommendedFilterCopyVerticalPadding,
  expectedRecommendedFilterCopyVerticalPadding,
  'recommended filter copy vertical padding',
);
expectEqual(
  heroTrendTitleMainTextStyle.fontFamily,
  expectedHeroTitleMainFontFamily,
  'weekly trend main title font family',
);
expectEqual(
  homeHeroLayoutMetrics.listTopPadding,
  expectedHomeHeroTopPadding,
  'home hero top padding',
);
expectEqual(
  homeHeroLayoutMetrics.copyGap,
  expectedHomeHeroCopyGap,
  'home hero copy gap',
);
expectEqual(
  homeHeroLayoutMetrics.titleGroupGap,
  expectedHomeHeroTitleGroupGap,
  'home hero title group gap',
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
  homeServiceShortcutLabels.join(','),
  expectedHomeServiceShortcutLabels.join(','),
  'home service shortcut order',
);
expectEqual(
  homeServiceShortcutRowLabels[0]?.join(','),
  expectedHomeServiceShortcutFirstRowLabels,
  'home service shortcut first row order',
);
expectEqual(
  homeServiceShortcutRowLabels[1]?.join(','),
  expectedHomeServiceShortcutSecondRowLabels,
  'home service shortcut second row order',
);
expectEqual(
  HOME_SERVICE_SHORTCUT_LABELS.some(label => label.includes('\n')),
  false,
  'home service shortcut labels do not contain manual line breaks',
);
expectEqual(
  HOME_SERVICE_SHORTCUT_LABEL_NUMBER_OF_LINES,
  1,
  'home service shortcut labels render on one line',
);
expectEqual(
  HOME_SERVICE_SHORTCUT_LABEL_MIN_HEIGHT,
  typography.lineHeight.xs,
  'home service shortcut label min height is one line',
);
expectEqual(
  HOME_FILTER_STORE_SERVICE_SHORTCUT_ICON_NAME,
  'Store',
  'home filter store service shortcut icon name',
);
expectEqual(
  HOME_CONSULTING_SERVICE_SHORTCUT_ICON_NAME,
  'Compass',
  'home consulting service shortcut icon name',
);
expectEqual(
  makeupExtractionActionLabels.join(','),
  '카메라 촬영,사진 업로드',
  'home makeup extraction sheet actions',
);
expectEqual(
  makeupFeedbackActionLabels.join(','),
  '카메라 촬영,사진 업로드',
  'home makeup feedback sheet actions',
);
expectEqual(
  getHomeServiceShortcutPresentation('makeupExtraction'),
  'makeupExtractionSheet',
  'home makeup extraction shortcut opens a bottom sheet',
);
expectEqual(
  getHomeServiceShortcutPresentation('makeupFeedback'),
  'makeupFeedbackSheet',
  'home makeup feedback shortcut opens a bottom sheet',
);
expectEqual(
  getRecommendedFilterGridColumnCount(),
  expectedRecommendedFilterGridColumnCount,
  'recommended filter grid column count',
);
expectEqual(
  recommendedFilterListVirtualizationConfig.initialNumToRender,
  expectedInitialRecommendedFiltersToRender,
  'recommended filter initial render count',
);
expectEqual(
  recommendedFilterListVirtualizationConfig.maxToRenderPerBatch,
  expectedRecommendedFilterRenderBatchSize,
  'recommended filter render batch size',
);
expectEqual(
  recommendedFilterListVirtualizationConfig.initialNumToRender < recommendedFilters.length,
  true,
  'recommended filter list does not initially render every card',
);
expectEqual(
  getIsHomeScrollTopButtonVisible(HOME_SCROLL_TOP_VISIBLE_OFFSET - 1),
  false,
  'scroll top button is hidden before threshold',
);
expectEqual(
  getIsHomeScrollTopButtonVisible(HOME_SCROLL_TOP_VISIBLE_OFFSET),
  true,
  'scroll top button is visible at threshold',
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

let selectedHomeServiceShortcut:
  | 'arFilter'
  | 'community'
  | 'consulting'
  | 'diagnosis'
  | 'filterStore'
  | 'halfMakeup'
  | 'makeupExtraction'
  | 'makeupFeedback'
  | 'recommendation'
  | null = null;

const diagnosisPressHandler = getHomeServiceShortcutPressHandler('diagnosis', {
  onPressFaceDiagnosis: () => {
    selectedHomeServiceShortcut = 'diagnosis';
  },
});

if (!diagnosisPressHandler) {
  throw new Error('face analysis service shortcut should have a press handler');
}

diagnosisPressHandler();

expectEqual(selectedHomeServiceShortcut, 'diagnosis', 'face analysis service shortcut target');

const arFilterPressHandler = getHomeServiceShortcutPressHandler('arFilter', {
  onPressMakeupFilter: () => {
    selectedHomeServiceShortcut = 'arFilter';
  },
});

if (!arFilterPressHandler) {
  throw new Error('makeup filter service shortcut should have a press handler');
}

arFilterPressHandler();

expectEqual(selectedHomeServiceShortcut, 'arFilter', 'makeup filter service shortcut target');

const halfMakeupPressHandler = getHomeServiceShortcutPressHandler('halfMakeup', {
  onPressHalfMakeup: () => {
    selectedHomeServiceShortcut = 'halfMakeup';
  },
});

if (!halfMakeupPressHandler) {
  throw new Error('half makeup service shortcut should have a press handler');
}

halfMakeupPressHandler();

expectEqual(selectedHomeServiceShortcut, 'halfMakeup', 'half makeup service shortcut target');

const communityPressHandler = getHomeServiceShortcutPressHandler('community', {
  onPressCommunity: () => {
    selectedHomeServiceShortcut = 'community';
  },
});

if (!communityPressHandler) {
  throw new Error('community service shortcut should have a press handler');
}

communityPressHandler();

expectEqual(selectedHomeServiceShortcut, 'community', 'community service shortcut target');

const makeupExtractionPressHandler = getHomeServiceShortcutPressHandler('makeupExtraction', {
  onPressMakeupExtraction: () => {
    selectedHomeServiceShortcut = 'makeupExtraction';
  },
});

if (!makeupExtractionPressHandler) {
  throw new Error('makeup extraction service shortcut should have a press handler');
}

makeupExtractionPressHandler();

expectEqual(selectedHomeServiceShortcut, 'makeupExtraction', 'makeup extraction service shortcut target');

const recommendationPressHandler = getHomeServiceShortcutPressHandler('recommendation', {
  onPressProductRecommendations: () => {
    selectedHomeServiceShortcut = 'recommendation';
  },
});

if (!recommendationPressHandler) {
  throw new Error('product recommendation service shortcut should have a press handler');
}

recommendationPressHandler();

expectEqual(selectedHomeServiceShortcut, 'recommendation', 'product recommendation service shortcut target');

const filterStorePressHandler = getHomeServiceShortcutPressHandler('filterStore', {
  onPressRecommendedFilterMore: () => {
    selectedHomeServiceShortcut = 'filterStore';
  },
});

if (!filterStorePressHandler) {
  throw new Error('filter store service shortcut should have a press handler');
}

filterStorePressHandler();

expectEqual(selectedHomeServiceShortcut, 'filterStore', 'filter store service shortcut target');

const consultingPressHandler = getHomeServiceShortcutPressHandler('consulting', {
  onPressConsulting: () => {
    selectedHomeServiceShortcut = 'consulting';
  },
});

if (!consultingPressHandler) {
  throw new Error('consulting service shortcut should have a press handler');
}

consultingPressHandler();

expectEqual(selectedHomeServiceShortcut, 'consulting', 'consulting service shortcut target');

const makeupFeedbackPressHandler = getHomeServiceShortcutPressHandler('makeupFeedback', {
  onPressMakeupFeedback: () => {
    selectedHomeServiceShortcut = 'makeupFeedback';
  },
});

if (!makeupFeedbackPressHandler) {
  throw new Error('makeup feedback service shortcut should have a press handler');
}

makeupFeedbackPressHandler();

expectEqual(selectedHomeServiceShortcut, 'makeupFeedback', 'makeup feedback service shortcut target');

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
      description: '데일리 추천',
      id: 'look-1',
      imageSource: {uri: 'https://example.com/look-1.png'},
      subtitle: '맑은 코랄',
      tags: [],
      title: '데일리 추천 룩',
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
};
const savedHomeMakeupLooks = mapFaceAnalysisReportsToHomeSavedMakeupLooks([
  completeReport,
  partialReport,
]);

expectEqual(savedHomeMakeupLooks.length, 2, 'home saved makeup keeps one daily card per report');
expectEqual(savedHomeMakeupLooks[0].title, '데일리 추천 룩', 'home saved makeup uses AI title');
expectEqual(
  savedHomeMakeupLooks[1].description,
  '맑은 코랄',
  'home saved makeup uses one daily card from each report',
);
