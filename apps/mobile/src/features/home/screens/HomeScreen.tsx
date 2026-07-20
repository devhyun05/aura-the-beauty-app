import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AppState,
  FlatList,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView as NativeScrollView,
  StyleSheet,
  type ImageSourcePropType,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
  useWindowDimensions,
} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {
  ArrowRight,
  Camera,
  ChevronUp,
  Compass,
  Eraser,
  Heart,
  MessageSquareText,
  PackageSearch,
  ScanFace,
  ScanSearch,
  Sparkles,
  WandSparkles,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ScrollView as TamaguiScrollView, Text, View, XStack, YStack} from 'tamagui';

import {
  getRecommendedMakeupFilters,
  getRecommendedMakeupFiltersFromApi,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {RecommendedMakeupFilter} from '../../../shared/types/makeupGuide';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../../shared/ui/AppFooter';
import {AuraLogo, MenuHeaderIcon} from '../../../shared/ui';
import {CachedImage} from '../../../shared/ui/CachedImage';
import {HomeModuleRenderer} from '../components/HomeLongScrollModules';
import {
  defaultHomeAudienceState,
  getVisibleHomeModules,
} from '../config/homeModuleRegistry';
import {homeMock} from '../mocks/home.mock';
import {
  emptyHomeFeedContent,
  getHomeFeedContent,
} from '../services/homeFeedService';
import {
  getHomeImageLoadStagesForViewport,
  homeImageScheduler,
  type HomeImageLoadStage,
} from '../services/homeImageScheduler';
import {
  trackHomeFilterCardPress,
  trackHomeEnter,
  trackHomeHeroBannerPress,
  trackHomeModuleImpression,
  trackHomeModulePress,
  trackHomeSectionMorePress,
} from '../services/homeAnalytics';
import {getHomeData} from '../services/homeService';
import type {
  HomeAudienceState,
  HomeFeatureId,
  HomeFeaturePressPayload,
  HomeModuleConfig,
  HomeModuleId,
} from '../types/homeModules';
import type {
  HomeData,
  HomeHeroFeatureId,
  HomeTrendItem,
} from '../types';

export {getHomeMakeupExtractionActionLabels} from '../components/MakeupExtractionActionSheet';
export {getHomeMakeupFeedbackActionLabels} from '../components/MakeupFeedbackActionSheet';

type HomeScreenProps = {
  headerRightSlot?: ReactNode;
  isAuthenticated?: boolean;
  onOpenFeatureMenu?: () => void;
  onPressArFilter?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressConsulting?: () => void;
  onPressHalfMakeup?: () => void;
  onPressMakeupRecommendation?: () => void;
  onPressHairRemovalSimulation?: () => void;
  onPressMakeupExtraction?: () => void;
  onPressMakeupFeedback?: () => void;
  onPressMakeupFilter?: () => void;
  onPressProductRecommendations?: () => void;
  onPressRecommendedFilterMore?: () => void;
  onPressHeroTrendFilter?: (filterId: string) => void;
  onPressRecommendedFilter?: (filterId: string) => void;
  onPressHomeFeature?: (
    featureId: HomeFeatureId,
    payload?: HomeFeaturePressPayload,
  ) => void;
  onToggleHomeProductLike?: (
    payload: HomeFeaturePressPayload,
    nextLiked: boolean,
  ) => Promise<void>;
  isMakeupFilterLiked?: (filterId: string) => boolean;
  onToggleMakeupFilterLike?: (filterId: string) => void;
  onConfirmBeautyJourneyGuide?: () => void;
  showBeautyJourneyGuide?: boolean;
};

export function HomeScreen({
  headerRightSlot,
  isAuthenticated = false,
  onOpenFeatureMenu,
  onPressArFilter,
  onPressFaceDiagnosis,
  onPressHeroTrendFilter,
  onPressConsulting,
  onPressHalfMakeup,
  onPressMakeupRecommendation,
  onPressHairRemovalSimulation,
  onPressMakeupExtraction,
  onPressMakeupFeedback,
  onPressMakeupFilter,
  onPressProductRecommendations,
  onPressRecommendedFilterMore,
  onPressRecommendedFilter,
  onPressHomeFeature,
  onToggleHomeProductLike,
  isMakeupFilterLiked,
  onToggleMakeupFilterLike,
  onConfirmBeautyJourneyGuide,
  showBeautyJourneyGuide = false,
}: HomeScreenProps) {
  const [homeData, setHomeData] = useState<HomeData>(homeMock);
  const [homeFeedContent, setHomeFeedContent] = useState(emptyHomeFeedContent);
  const [isHomeFeedLoading, setIsHomeFeedLoading] = useState(true);
  const audience = useMemo<HomeAudienceState>(() => ({
    ...defaultHomeAudienceState,
    isAuthenticated,
  }), [isAuthenticated]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [moduleImageLoadStages, setModuleImageLoadStages] = useState<
    Partial<Record<HomeModuleId, HomeImageLoadStage>>
  >({});
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [isHeroViewportVisible, setIsHeroViewportVisible] = useState(true);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const listRef = useRef<FlatList<HomeModuleConfig>>(null);
  const impressedModuleIdsRef = useRef(new Set<string>());
  const hasTrackedHomeEnterRef = useRef(false);
  const insets = useSafeAreaInsets();
  const isScreenFocused = useIsFocused();
  const {width} = useWindowDimensions();
  const heroBannerWidth = width;
  const heroBannerHeight = Math.round(heroBannerWidth / HOME_HERO_BANNER_ASPECT_RATIO);
  const [recommendedMakeupFilters, setRecommendedMakeupFilters] =
    useState<readonly RecommendedMakeupFilter[]>(() => getRecommendedMakeupFilters());
  const recommendedFilterPreviewItems = useMemo(
    () => getRecommendedFilterPreviewItems(recommendedMakeupFilters),
    [recommendedMakeupFilters],
  );
  const recommendedFilterPreviewCardWidth = getRecommendedFilterPreviewCardWidth(width);
  const visibleHomeModules = useMemo(
    () => getVisibleHomeModules(audience, homeFeedContent),
    [audience, homeFeedContent],
  );
  const visibleHomeModulesRef = useRef(visibleHomeModules);
  visibleHomeModulesRef.current = visibleHomeModules;
  const moduleViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 22,
    minimumViewTime: 120,
  }).current;
  const bottomPadding =
    APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + Math.max(insets.bottom, spacing.md);

  const handleListScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const scrollOffsetY = event.nativeEvent.contentOffset.y;
    const shouldShowButton = getIsHomeScrollTopButtonVisible(scrollOffsetY);
    const shouldRunHero = scrollOffsetY < heroBannerHeight;

    setShowScrollTopButton(current => (
      current === shouldShowButton ? current : shouldShowButton
    ));
    setIsHeroViewportVisible(current => (
      current === shouldRunHero ? current : shouldRunHero
    ));
  }, [heroBannerHeight]);

  const handleScrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({animated: true, offset: 0});
  }, []);

  const handleHeroFeaturePress = useCallback((featureId: HomeHeroFeatureId) => {
    trackHomeHeroBannerPress('feature', featureId);

    if (featureId === 'faceDiagnosis') {
      onPressFaceDiagnosis?.();
      return;
    }

    if (featureId === 'makeupExtraction') {
      onPressMakeupExtraction?.();
      return;
    }

    if (featureId === 'consulting') {
      onPressConsulting?.();
      return;
    }

    if (featureId === 'auradin') {
      onPressHomeFeature?.('auradin');
      return;
    }

    onPressProductRecommendations?.();
  }, [
    onPressConsulting,
    onPressFaceDiagnosis,
    onPressMakeupExtraction,
    onPressHomeFeature,
    onPressProductRecommendations,
  ]);

  const handleHeroFilterPress = useCallback((filterId: string) => {
    trackHomeHeroBannerPress('filter', filterId);
    onPressHeroTrendFilter?.(filterId);
  }, [onPressHeroTrendFilter]);

  const handleRecommendedFilterPress = useCallback((filterId: string) => {
    trackHomeFilterCardPress(filterId);
    onPressRecommendedFilter?.(filterId);
  }, [onPressRecommendedFilter]);

  const handleRecommendedFilterMorePress = useCallback(() => {
    trackHomeSectionMorePress();
    onPressRecommendedFilterMore?.();
  }, [onPressRecommendedFilterMore]);

  const handleAuradinShortcutPress = useCallback(() => {
    onPressHomeFeature?.('auradin');
  }, [onPressHomeFeature]);

  const loadHomeContent = useCallback(async () => {
    const [nextHomeData, filters, nextFeedContent] = await Promise.all([
      getHomeData(),
      getRecommendedMakeupFiltersFromApi(),
      getHomeFeedContent({isAuthenticated}),
    ]);

    setHomeData(nextHomeData);
    setRecommendedMakeupFilters(filters);
    setHomeFeedContent(nextFeedContent);
    setIsHomeFeedLoading(false);
  }, [isAuthenticated]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await loadHomeContent();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadHomeContent]);

  useEffect(() => {
    let isMounted = true;
    setHomeFeedContent(emptyHomeFeedContent);
    setIsHomeFeedLoading(true);

    void Promise.all([
      getHomeData(),
      getRecommendedMakeupFiltersFromApi(),
    ]).then(([nextHomeData, filters]) => {
      if (!isMounted) {
        return;
      }

      setHomeData(nextHomeData);
      setRecommendedMakeupFilters(filters);
    });

    void getHomeFeedContent({isAuthenticated}).then(nextFeedContent => {
      if (isMounted) {
        setHomeFeedContent(nextFeedContent);
        setIsHomeFeedLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setIsAppActive(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (hasTrackedHomeEnterRef.current) {
      return;
    }

    hasTrackedHomeEnterRef.current = true;
    trackHomeEnter(audience);
  }, [audience]);

  const handleModuleViewabilityChanged = useRef(({
    viewableItems,
  }: {
    viewableItems: Array<ViewToken<HomeModuleConfig>>;
  }) => {
    const modules = visibleHomeModulesRef.current;
    const firstVisibleItem = viewableItems.find(token => (
      token.isViewable && typeof token.index === 'number'
    ));

    if (typeof firstVisibleItem?.index === 'number') {
      void homeImageScheduler.scheduleAroundModule(
        modules,
        firstVisibleItem.index,
      );
    }

    const visibleModuleIndices = viewableItems.flatMap(token => (
      token.isViewable && typeof token.index === 'number'
        ? [token.index]
        : []
    ));

    const nextImageLoadStages = getHomeImageLoadStagesForViewport(
      modules,
      visibleModuleIndices,
    );

    setModuleImageLoadStages(currentStages => (
      modules.some(module => (
        (currentStages[module.id] ?? 'deferred')
          !== (nextImageLoadStages[module.id] ?? 'deferred')
      ))
        ? nextImageLoadStages
        : currentStages
    ));

    viewableItems.forEach(token => {
      if (!token.isViewable || !token.item) {
        return;
      }

      if (impressedModuleIdsRef.current.has(token.item.id)) {
        return;
      }

      impressedModuleIdsRef.current.add(token.item.id);
      trackHomeModuleImpression(token.item.id, token.index ?? 0);
    });
  }).current;

  const renderHomeModule = useCallback(({
    item,
  }: ListRenderItemInfo<HomeModuleConfig>) => (
    <HomeModuleRenderer
      imageLoadStage={moduleImageLoadStages[item.id] ?? 'deferred'}
      isFeedLoading={isHomeFeedLoading}
      module={item}
      onPressFeature={(featureId, payload) => {
        trackHomeModulePress(item.id, featureId, payload?.itemId);
        onPressHomeFeature?.(featureId, payload);
      }}
      onToggleProductLike={onToggleHomeProductLike}
    />
  ), [
    moduleImageLoadStages,
    isHomeFeedLoading,
    onPressHomeFeature,
    onToggleHomeProductLike,
  ]);

  return (
    <View style={styles.homeContainer}>
      <FlatList
        ref={listRef}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        scrollIndicatorInsets={{bottom: 0, left: 0, right: 0, top: 0}}
        contentContainerStyle={[
          styles.homeListContent,
          {paddingBottom: bottomPadding},
        ]}
        data={visibleHomeModules}
        initialNumToRender={2}
        ItemSeparatorComponent={HomeModuleSeparator}
        keyExtractor={module => module.id}
        ListHeaderComponent={
          <YStack style={styles.homeListHeader}>
            <HeroBannerCarousel
              bannerHeight={heroBannerHeight}
              bannerWidth={heroBannerWidth}
              fallbackImageSource={homeData.hero.imageSource}
              headerRightSlot={headerRightSlot}
              isAutoScrollEnabled={
                isScreenFocused && isAppActive && isHeroViewportVisible
              }
              onOpenFeatureMenu={onOpenFeatureMenu}
              onPressFeature={handleHeroFeaturePress}
              onPressFilter={onPressHeroTrendFilter ? handleHeroFilterPress : undefined}
              topInset={insets.top}
              trends={homeData.hero.trends}
            />

            <HomeServiceShortcutSection
              onPressArFilter={onPressArFilter}
              onPressAuradin={handleAuradinShortcutPress}
              onPressFaceDiagnosis={onPressFaceDiagnosis}
              onPressConsulting={onPressConsulting}
              onPressHalfMakeup={onPressHalfMakeup}
              onPressMakeupRecommendation={onPressMakeupRecommendation}
              onPressHairRemovalSimulation={onPressHairRemovalSimulation}
              onPressMakeupExtraction={onPressMakeupExtraction}
              onPressMakeupFeedback={onPressMakeupFeedback}
              onPressMakeupFilter={onPressMakeupFilter}
              onPressProductRecommendations={onPressProductRecommendations}
            />

            <RecommendedFilterPreviewSection
              cardWidth={recommendedFilterPreviewCardWidth}
              filters={recommendedFilterPreviewItems}
              isMakeupFilterLiked={isMakeupFilterLiked}
              onPressFilter={
                onPressRecommendedFilter ? handleRecommendedFilterPress : undefined
              }
              onPressMore={
                onPressRecommendedFilterMore
                  ? handleRecommendedFilterMorePress
                  : undefined
              }
              onToggleFilterLike={onToggleMakeupFilterLike}
            />
          </YStack>
        }
        maxToRenderPerBatch={2}
        onScroll={handleListScroll}
        onViewableItemsChanged={handleModuleViewabilityChanged}
        refreshControl={
          <RefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            tintColor={colors.textSecondary}
          />
        }
        removeClippedSubviews
        renderItem={renderHomeModule}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={80}
        viewabilityConfig={moduleViewabilityConfig}
        windowSize={5}
      />
      {showScrollTopButton ? (
        <Pressable
          accessibilityLabel="맨 위로 이동"
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={handleScrollToTop}
          style={({pressed}) => [
            styles.scrollTopButton,
            pressed && styles.pressed,
          ]}>
          <ChevronUp color={colors.white} size={iconSize.md} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <BeautyJourneyGuideDialog
        isVisible={showBeautyJourneyGuide}
        onConfirm={onConfirmBeautyJourneyGuide}
      />
    </View>
  );
}

type HeroBannerCarouselProps = {
  bannerHeight: number;
  bannerWidth: number;
  fallbackImageSource: ImageSourcePropType;
  headerRightSlot?: ReactNode;
  isAutoScrollEnabled: boolean;
  onOpenFeatureMenu?: () => void;
  onPressFeature?: (featureId: HomeHeroFeatureId) => void;
  onPressFilter?: (filterId: string) => void;
  topInset: number;
  trends: HomeTrendItem[];
};

type HeroBannerCardProps = {
  bannerHeight: number;
  bannerWidth: number;
  ctaLabel?: string;
  description?: string;
  featureId?: HomeHeroFeatureId;
  filterId?: string;
  imageSource: ImageSourcePropType;
  onPressFeature?: (featureId: HomeHeroFeatureId) => void;
  onPressFilter?: (filterId: string) => void;
  title: string;
  tone: string;
};

type HeroTrendHeadline<TTitle extends string, TTone extends string> =
  `${TTone} 무드의\n${TTitle}`;

export function getHeroTrendHeadline<
  const TTitle extends string,
  const TTone extends string,
>({title, tone}: {title: TTitle; tone: TTone}): HeroTrendHeadline<TTitle, TTone> {
  return `${tone} 무드의\n${title}` as HeroTrendHeadline<TTitle, TTone>;
}

export const heroTrendTitleReadableTextStyle = {
  color: colors.white,
  textShadowColor: 'rgba(0, 0, 0, 0.34)',
  textShadowOffset: {width: 0, height: 1},
  textShadowRadius: 6,
} as const;

export const heroTrendTitleMainTextStyle = {
  ...heroTrendTitleReadableTextStyle,
  fontFamily: typography.fontFamily.medium,
  fontSize: typography.fontSize.xxl,
  lineHeight: typography.lineHeight.xxl,
} as const;

export const heroCtaLabel = '시작하기' as const;
export const recommendedFilterSectionTitle = '추천 메이크업 필터' as const;
export const recommendedFilterSectionDescription = undefined;
export const recommendedFilterMoreButtonLabel = '더보기' as const;
// Keep enough vertical room for the header actions without crowding the hero image.
export const HOME_HERO_BANNER_ASPECT_RATIO = 1.5;
export const HOME_HERO_AUTOSCROLL_INTERVAL_MS = 4000;
export const homeHeroLayoutMetrics = {
  copyGap: spacing.sm,
  listTopPadding: 0,
  titleGroupGap: 2,
} as const;

type HeroCarouselItemBase = {
  id: string;
};

export function getHeroCarouselRenderItems<const TItem extends HeroCarouselItemBase>(
  items: readonly TItem[],
): TItem[] {
  if (items.length <= 1) {
    return [...items];
  }

  return [items[items.length - 1], ...items, items[0]];
}

export function getHeroCarouselInitialOffset({
  itemCount,
  snapInterval,
}: {
  itemCount: number;
  snapInterval: number;
}): number {
  return itemCount > 1 ? snapInterval : 0;
}

export function getHeroCarouselLoopResetOffset({
  itemCount,
  scrollOffsetX,
  snapInterval,
}: {
  itemCount: number;
  scrollOffsetX: number;
  snapInterval: number;
}): number | null {
  if (itemCount <= 1) {
    return null;
  }

  const snapIndex = Math.round(scrollOffsetX / snapInterval);

  if (snapIndex <= 0) {
    return snapInterval * itemCount;
  }

  if (snapIndex >= itemCount + 1) {
    return snapInterval;
  }

  return null;
}


export function getHeroCarouselActiveIndex({
  itemCount,
  scrollOffsetX,
  snapInterval,
}: {
  itemCount: number;
  scrollOffsetX: number;
  snapInterval: number;
}): number {
  if (itemCount <= 1) {
    return 0;
  }

  const snapIndex = Math.round(scrollOffsetX / snapInterval);

  if (snapIndex <= 0) {
    return itemCount - 1;
  }

  if (snapIndex >= itemCount + 1) {
    return 0;
  }

  return snapIndex - 1;
}
export function createHeroCarouselLoopResetHandlers(
  handler: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
) {
  return {
    onMomentumScrollEnd: handler,
    onScrollEndDrag: handler,
  };
}

const recommendedFilterCategories = [
  {id: 'all', label: '전체'},
  {id: 'red', label: '레드'},
  {id: 'glow', label: '글로우'},
  {id: 'smoky', label: '스모키'},
  {id: 'brown', label: '브라운'},
  {id: 'pink', label: '핑크'},
  {id: 'trend', label: '트렌드'},
  {id: 'unique', label: '유니크'},
] as const;

type RecommendedFilterCategoryId = (typeof recommendedFilterCategories)[number]['id'];

export function filterRecommendedMakeupFiltersByHomeCategory(
  filters: readonly RecommendedMakeupFilter[],
  categoryId: RecommendedFilterCategoryId,
): readonly RecommendedMakeupFilter[] {
  if (categoryId === 'all') {
    return filters;
  }

  return filters.filter(filter => filter.categoryTags.includes(categoryId));
}

export function getRecommendedFilterCategoryLabels(): readonly string[] {
  return recommendedFilterCategories.map(category => category.label);
}

export function getRecommendedFilterGridColumnCount(): 2 {
  return 2;
}

export const recommendedFilterListVirtualizationConfig = {
  initialNumToRender: 6,
  maxToRenderPerBatch: 4,
  updateCellsBatchingPeriod: 60,
  windowSize: 5,
} as const;

export const HOME_RECOMMENDED_FILTER_PREVIEW_COUNT = 5;
export const HOME_RECOMMENDED_FILTER_PREVIEW_PRIMARY_ID = 'filter-aura-blush-lift';
export const HOME_RECOMMENDED_FILTER_PREVIEW_SECONDARY_ID = 'filter-wanghong-glass-pink';

export function getRecommendedFilterPreviewItems(
  filters: readonly RecommendedMakeupFilter[],
): readonly RecommendedMakeupFilter[] {
  const pinnedFilters = [
    HOME_RECOMMENDED_FILTER_PREVIEW_PRIMARY_ID,
    HOME_RECOMMENDED_FILTER_PREVIEW_SECONDARY_ID,
  ]
    .map(filterId => filters.find(filter => filter.id === filterId))
    .filter((filter): filter is RecommendedMakeupFilter => Boolean(filter));
  const pinnedFilterIds = new Set(pinnedFilters.map(filter => filter.id));
  const orderedFilters = [
    ...pinnedFilters,
    ...filters.filter(filter => !pinnedFilterIds.has(filter.id)),
  ];

  return orderedFilters.slice(0, HOME_RECOMMENDED_FILTER_PREVIEW_COUNT);
}

export function getRecommendedFilterPreviewCardWidth(screenWidth: number): number {
  return Math.max(136, Math.min(168, Math.floor(screenWidth * 0.4)));
}

export const recommendedFilterCopyVerticalPadding = 10;

export const HOME_SCROLL_TOP_VISIBLE_OFFSET = 360;

export function getIsHomeScrollTopButtonVisible(scrollOffsetY: number): boolean {
  return scrollOffsetY >= HOME_SCROLL_TOP_VISIBLE_OFFSET;
}

const scrollTopButtonSize = iconSize.xl + spacing.md;

function HeroBannerCarousel({
  bannerHeight,
  bannerWidth,
  fallbackImageSource,
  headerRightSlot,
  isAutoScrollEnabled,
  onOpenFeatureMenu,
  onPressFeature,
  onPressFilter,
  topInset,
  trends,
}: HeroBannerCarouselProps) {
  const heroCarouselRef = useRef<NativeScrollView>(null);
  const snapInterval = bannerWidth;
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const activeHeroIndexRef = useRef(0);
  const heroItems = useMemo(() => (
    trends.length > 0
      ? trends
      : [
          {
            ctaLabel: heroCtaLabel,
            description: '얼굴형, 비율, 피부톤을 한 번에 진단해요.',
            featureId: 'faceDiagnosis' as const,
            id: 'feature-default',
            imageSource: fallbackImageSource,
            title: '얼굴진단',
            tone: 'AI 얼굴 분석',
          },
        ]
  ), [fallbackImageSource, trends]);
  const heroRenderItems = useMemo(
    () => getHeroCarouselRenderItems(heroItems),
    [heroItems],
  );
  const initialScrollOffsetX = getHeroCarouselInitialOffset({
    itemCount: heroItems.length,
    snapInterval,
  });
  useEffect(() => {
    activeHeroIndexRef.current = 0;
    setActiveHeroIndex(0);
    heroCarouselRef.current?.scrollTo({
      animated: false,
      x: initialScrollOffsetX,
    });
  }, [heroItems.length, initialScrollOffsetX]);

  useEffect(() => {
    if (!isAutoScrollEnabled || heroItems.length <= 1 || snapInterval <= 0) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      const currentIndex = activeHeroIndexRef.current;
      const nextSnapIndex =
        currentIndex === heroItems.length - 1
          ? heroItems.length + 1
          : currentIndex + 2;

      heroCarouselRef.current?.scrollTo({
        animated: true,
        x: nextSnapIndex * snapInterval,
      });
    }, HOME_HERO_AUTOSCROLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [heroItems.length, isAutoScrollEnabled, snapInterval]);

  const handleHeroCarouselScrollEnd = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const scrollOffsetX = event.nativeEvent.contentOffset.x;
    const nextActiveIndex = getHeroCarouselActiveIndex({
      itemCount: heroItems.length,
      scrollOffsetX,
      snapInterval,
    });

    activeHeroIndexRef.current = nextActiveIndex;
    setActiveHeroIndex(current => (
      current === nextActiveIndex ? current : nextActiveIndex
    ));

    const loopResetOffsetX = getHeroCarouselLoopResetOffset({
      itemCount: heroItems.length,
      scrollOffsetX,
      snapInterval,
    });

    if (loopResetOffsetX === null) {
      return;
    }

    heroCarouselRef.current?.scrollTo({
      animated: false,
      x: loopResetOffsetX,
    });
  }, [heroItems.length, snapInterval]);
  const heroCarouselLoopResetHandlers = useMemo(
    () => createHeroCarouselLoopResetHandlers(handleHeroCarouselScrollEnd),
    [handleHeroCarouselScrollEnd],
  );

  return (
    <View style={[styles.heroCarouselFrame, {height: bannerHeight, width: bannerWidth}]}>
      <NativeScrollView
        ref={heroCarouselRef}
        horizontal
        contentOffset={{x: initialScrollOffsetX, y: 0}}
        decelerationRate="normal"
        disableIntervalMomentum
        onMomentumScrollEnd={heroCarouselLoopResetHandlers.onMomentumScrollEnd}
        onScrollEndDrag={heroCarouselLoopResetHandlers.onScrollEndDrag}
        snapToAlignment="start"
        snapToInterval={snapInterval}
        showsHorizontalScrollIndicator={false}
        style={[styles.heroCarouselScroll, {height: bannerHeight}]}
        contentContainerStyle={styles.heroCarousel}>
        {heroRenderItems.map((item, index) => (
          <HeroBannerCard
            bannerHeight={bannerHeight}
            bannerWidth={bannerWidth}
            ctaLabel={item.ctaLabel}
            description={item.description}
            featureId={item.featureId}
            filterId={item.filterId}
            imageSource={item.imageSource}
            key={`${item.id}-${index}`}
            onPressFeature={onPressFeature}
            onPressFilter={onPressFilter}
            title={item.title}
            tone={item.tone}
          />
        ))}
      </NativeScrollView>
      <HeroPaginationIndicator
        activeIndex={activeHeroIndex}
        count={heroItems.length}
      />
      <HomeHeroChrome
        headerRightSlot={headerRightSlot}
        onOpenFeatureMenu={onOpenFeatureMenu}
        topInset={topInset}
      />
    </View>
  );
}

function HomeHeroChrome({
  headerRightSlot,
  onOpenFeatureMenu,
  topInset,
}: {
  headerRightSlot?: ReactNode;
  onOpenFeatureMenu?: () => void;
  topInset: number;
}) {
  return (
    <XStack
      pointerEvents="box-none"
      style={[styles.homeHeroChrome, {paddingTop: topInset + spacing.sm}]}>
      <AuraLogo style={styles.homeHeroLogo} variant="header" />
      <XStack style={styles.homeHeroRightActions}>
        {headerRightSlot}
        <Pressable
          accessibilityLabel={'\uC804\uCCB4 \uAE30\uB2A5 \uBCF4\uAE30'}
          accessibilityRole="button"
          disabled={!onOpenFeatureMenu}
          hitSlop={spacing.xs}
          onPress={onOpenFeatureMenu}
          style={({pressed}) => [
            styles.homeHeroMenuButton,
            pressed && styles.pressed,
          ]}>
          <MenuHeaderIcon color={colors.brandMuted} size={20} strokeWidth={2} />
        </Pressable>
      </XStack>
    </XStack>
  );
}

const HeroBannerCard = memo(function HeroBannerCard({
  bannerHeight,
  bannerWidth,
  ctaLabel,
  description,
  featureId,
  filterId,
  imageSource,
  onPressFeature,
  onPressFilter,
  title,
  tone,
}: HeroBannerCardProps) {
  const resolvedDescription = description ?? tone;
  const resolvedCtaLabel = ctaLabel ?? heroCtaLabel;
  const handlePress = featureId
    ? () => onPressFeature?.(featureId)
    : filterId
      ? () => onPressFilter?.(filterId)
      : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} ${resolvedDescription} ${resolvedCtaLabel}`}
      onPress={handlePress}
      style={({pressed}) => [
        styles.heroBanner,
        {height: bannerHeight, width: bannerWidth},
        pressed && styles.pressed,
      ]}>
      <CachedImage
        contentFit="cover"
        source={imageSource}
        style={styles.heroBackgroundImage}
      />
      <View style={styles.heroScrim} />

      <YStack style={styles.heroCopy}>
        <Text numberOfLines={1} style={styles.heroTitleLead}>
          {tone}
        </Text>
        <YStack style={styles.heroTitleGroup}>
          <Text numberOfLines={1} style={styles.heroTitleMain}>
            {title}
          </Text>
        </YStack>
      </YStack>

    </Pressable>
  );
});


function HeroPaginationIndicator({
  activeIndex,
  count,
}: {
  activeIndex: number;
  count: number;
}) {
  if (count <= 1) {
    return null;
  }

  return (
    <XStack
      accessibilityLabel={`${activeIndex + 1} / ${count}`}
      accessibilityRole="text"
      pointerEvents="none"
      style={styles.heroPagination}>
      {Array.from({length: count}).map((_, index) => (
        <View
          key={`hero-pagination-${index}`}
          style={[
            styles.heroPaginationDot,
            index === activeIndex && styles.heroPaginationDotActive,
          ]}
        />
      ))}
    </XStack>
  );
}
export const HOME_AURADIN_SERVICE_SHORTCUT_ICON_NAME = 'WandSparkles';
export const HOME_CONSULTING_SERVICE_SHORTCUT_ICON_NAME = 'Compass';
export const HOME_SERVICE_SHORTCUT_LABELS = [
  '얼굴 분석',
  '메이크업 필터',
  '메이크업 추출',
  '메이크업 피드백',
  '아우라딘',
  '추천 제품',
  '컨설팅',
  '메이크업 추천',
  '수염 제거',
] as const;
export const HOME_SERVICE_SHORTCUT_ROW_LABELS = [
  HOME_SERVICE_SHORTCUT_LABELS.slice(0, 4),
  HOME_SERVICE_SHORTCUT_LABELS.slice(4, 8),
  HOME_SERVICE_SHORTCUT_LABELS.slice(8),
] as const;
export const HOME_SERVICE_SHORTCUT_LABEL_NUMBER_OF_LINES = 1;
export const HOME_SERVICE_SHORTCUT_LABEL_MIN_HEIGHT = typography.lineHeight.xs;
export const HOME_SERVICE_SHORTCUT_CIRCLE_SIZE = 52;

const homeServiceShortcutRows = [
  [
    {
      id: 'diagnosis',
      label: HOME_SERVICE_SHORTCUT_LABELS[0],
      accessibilityLabel: '얼굴 분석 시작',
      icon: (color: string) => <ScanFace color={color} size={iconSize.lg} strokeWidth={1.9} />,
    },
    {
      id: 'arFilter',
      label: HOME_SERVICE_SHORTCUT_LABELS[1],
      accessibilityLabel: '메이크업 필터 열기',
      icon: (color: string) => <Camera color={color} size={iconSize.lg} strokeWidth={1.9} />,
    },
    {
      id: 'makeupExtraction',
      label: HOME_SERVICE_SHORTCUT_LABELS[2],
      accessibilityLabel: '메이크업 추출 시작',
      icon: (color: string) => (
        <ScanSearch color={color} size={iconSize.lg} strokeWidth={1.9} />
      ),
    },
    {
      id: 'makeupFeedback',
      label: HOME_SERVICE_SHORTCUT_LABELS[3],
      accessibilityLabel: '메이크업 피드백 시작',
      icon: (color: string) => (
        <MessageSquareText color={color} size={iconSize.lg} strokeWidth={1.9} />
      ),
    },
  ],
  [
    {
      id: 'auradin',
      label: HOME_SERVICE_SHORTCUT_LABELS[4],
      accessibilityLabel: '아우라딘 열기',
      icon: (color: string) => (
        <WandSparkles color={color} size={iconSize.lg} strokeWidth={1.9} />
      ),
    },
    {
      id: 'recommendation',
      label: HOME_SERVICE_SHORTCUT_LABELS[5],
      accessibilityLabel: '추천 제품 보기',
      icon: (color: string) => (
        <PackageSearch color={color} size={iconSize.lg} strokeWidth={1.9} />
      ),
    },
    {
      id: 'consulting',
      label: HOME_SERVICE_SHORTCUT_LABELS[6],
      accessibilityLabel: '컨설팅 보기',
      icon: (color: string) => (
        <Compass color={color} size={iconSize.lg} strokeWidth={1.9} />
      ),
    },
    {
      id: 'makeupRecommendation',
      label: HOME_SERVICE_SHORTCUT_LABELS[7],
      accessibilityLabel: '메이크업 추천 시작',
      icon: (color: string) => (
        <Sparkles color={color} size={iconSize.lg} strokeWidth={1.9} />
      ),
    },
  ],
  [
    {
      id: 'beardSimulation',
      label: HOME_SERVICE_SHORTCUT_LABELS[8],
      accessibilityLabel: '수염 제거 시뮬레이션 시작',
      icon: (color: string) => (
        <Eraser color={color} size={iconSize.lg} strokeWidth={1.9} />
      ),
    },
  ],
] as const;
const homeServiceShortcuts = homeServiceShortcutRows.flat();

type HomeServiceShortcutId = (typeof homeServiceShortcuts)[number]['id'];

export type HomeServiceShortcutPresentation =
  | 'route'
  | 'makeupExtractionSheet'
  | 'makeupFeedbackSheet';

type HomeServiceShortcutHandlers = {
  onPressArFilter?: () => void;
  onPressAuradin?: () => void;
  onPressConsulting?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressHalfMakeup?: () => void;
  onPressMakeupRecommendation?: () => void;
  onPressHairRemovalSimulation?: () => void;
  onPressMakeupExtraction?: () => void;
  onPressMakeupFeedback?: () => void;
  onPressMakeupFilter?: () => void;
  onPressProductRecommendations?: () => void;
};

export function getHomeServiceShortcutPressHandler(
  actionId: HomeServiceShortcutId,
  {
    onPressArFilter,
    onPressAuradin,
    onPressConsulting,
    onPressFaceDiagnosis,
    onPressHalfMakeup,
    onPressMakeupRecommendation,
    onPressHairRemovalSimulation,
    onPressMakeupExtraction,
    onPressMakeupFeedback,
    onPressMakeupFilter,
    onPressProductRecommendations,
  }: HomeServiceShortcutHandlers,
): (() => void) | undefined {
  if (actionId === 'diagnosis') {
    return onPressFaceDiagnosis;
  }

  if (actionId === 'arFilter') {
    return onPressMakeupFilter;
  }

  if (actionId === 'makeupRecommendation') {
    return onPressMakeupRecommendation;
  }

  if (actionId === 'makeupExtraction') {
    return onPressMakeupExtraction;
  }

  if (actionId === 'recommendation') {
    return onPressProductRecommendations;
  }

  if (actionId === 'auradin') {
    return onPressAuradin;
  }

  if (actionId === 'consulting') {
    return onPressConsulting;
  }

  if (actionId === 'makeupFeedback') {
    return onPressMakeupFeedback;
  }

  if (actionId === 'beardSimulation') {
    return onPressHairRemovalSimulation;
  }

  return undefined;
}

export function getHomeServiceShortcutPresentation(
  actionId: HomeServiceShortcutId,
): HomeServiceShortcutPresentation {
  if (actionId === 'makeupExtraction') {
    return 'makeupExtractionSheet';
  }

  if (actionId === 'makeupFeedback') {
    return 'makeupFeedbackSheet';
  }

  return 'route';
}

export function getHomeServiceShortcutLabels(): readonly string[] {
  return HOME_SERVICE_SHORTCUT_LABELS;
}

export function getHomeServiceShortcutRowLabels(): readonly (readonly string[])[] {
  return HOME_SERVICE_SHORTCUT_ROW_LABELS;
}

function HomeServiceShortcutSection({
  onPressArFilter,
  onPressAuradin,
  onPressConsulting,
  onPressFaceDiagnosis,
  onPressHalfMakeup,
  onPressMakeupRecommendation,
  onPressHairRemovalSimulation,
  onPressMakeupExtraction,
  onPressMakeupFeedback,
  onPressMakeupFilter,
  onPressProductRecommendations,
}: HomeServiceShortcutHandlers) {
  const homeServiceShortcutHandlers: HomeServiceShortcutHandlers = {
    onPressArFilter,
    onPressAuradin,
    onPressConsulting,
    onPressFaceDiagnosis,
    onPressHalfMakeup,
    onPressMakeupRecommendation,
    onPressHairRemovalSimulation,
    onPressMakeupExtraction,
    onPressMakeupFeedback,
    onPressMakeupFilter,
    onPressProductRecommendations,
  };

  return (
    <YStack style={styles.homeServiceShortcutList}>
      {homeServiceShortcutRows.map((row, rowIndex) => (
        <XStack key={`home-service-shortcut-row-${rowIndex}`} style={styles.homeServiceShortcutRow}>
          {row.map((action) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              key={action.label}
              onPress={getHomeServiceShortcutPressHandler(action.id, homeServiceShortcutHandlers)}
              style={({pressed}) => [styles.homeServiceShortcutItem, pressed && styles.pressed]}>
              <View style={styles.homeServiceShortcutCircle}>
                {action.icon(colors.textPrimary)}
              </View>
              <Text
                numberOfLines={HOME_SERVICE_SHORTCUT_LABEL_NUMBER_OF_LINES}
                style={styles.homeServiceShortcutLabel}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

function BeautyJourneyGuideDialog({
  isVisible,
  onConfirm,
}: {
  isVisible: boolean;
  onConfirm?: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onConfirm}
      transparent
      visible={isVisible}>
      <View style={styles.dialogBackdrop}>
        <YStack style={styles.beautyJourneyDialog}>
          <Text style={styles.dialogTitle}>아우라 여정을 시작해볼까요?</Text>
          <Text style={styles.dialogDescription}>
            맞춤형 뷰티 컨설팅 앱인 아우라와의 여정을 시작하려면 설문과 얼굴 분석이 필요해요.
          </Text>
          <Pressable
            accessibilityLabel="얼굴 분석 소개 보기"
            accessibilityRole="button"
            onPress={onConfirm}
            style={({pressed}) => [styles.dialogButton, pressed && styles.pressed]}>
            <Text style={styles.dialogButtonText}>얼굴 분석 알아보기</Text>
          </Pressable>
        </YStack>
      </View>
    </Modal>
  );
}

function RecommendedFilterPreviewSection({
  cardWidth,
  filters,
  isMakeupFilterLiked,
  onPressFilter,
  onPressMore,
  onToggleFilterLike,
}: {
  cardWidth: number;
  filters: readonly RecommendedMakeupFilter[];
  isMakeupFilterLiked?: (filterId: string) => boolean;
  onPressFilter?: (filterId: string) => void;
  onPressMore?: () => void;
  onToggleFilterLike?: (filterId: string) => void;
}) {
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const viewabilityConfig = useRef({itemVisiblePercentThreshold: 35}).current;
  const handleViewableItemsChanged = useRef(({
    viewableItems,
  }: {
    viewableItems: Array<ViewToken<RecommendedMakeupFilter>>;
  }) => {
    const lastVisibleIndex = viewableItems.reduce(
      (highestIndex, token) => Math.max(highestIndex, token.index ?? -1),
      -1,
    );

    if (lastVisibleIndex < 0) {
      return;
    }

    void homeImageScheduler.scheduleSources(
      filtersRef.current
        .slice(lastVisibleIndex + 1, lastVisibleIndex + 3)
        .map(filter => filter.imageSource),
    );
  }).current;

  useEffect(() => {
    const prefetchTask = InteractionManager.runAfterInteractions(() => {
      void homeImageScheduler.scheduleSources(
        filters.slice(0, 2).map(filter => filter.imageSource),
      );
    });

    return () => prefetchTask.cancel();
  }, [filters]);

  if (filters.length === 0) {
    return null;
  }

  return (
    <YStack style={styles.section}>
      <SectionHeader
        actionAccessibilityLabel="추천 메이크업 필터 더보기"
        actionLabel={recommendedFilterMoreButtonLabel}
        description={recommendedFilterSectionDescription}
        onPressAction={onPressMore}
        title={recommendedFilterSectionTitle}
      />

      <FlatList
        data={filters}
        getItemLayout={(_, index) => ({
          index,
          length: cardWidth + spacing.md,
          offset: (cardWidth + spacing.md) * index,
        })}
        horizontal
        initialNumToRender={2}
        keyExtractor={filter => filter.id}
        maxToRenderPerBatch={2}
        onViewableItemsChanged={handleViewableItemsChanged}
        removeClippedSubviews
        renderItem={({item: filter}) => (
          <RecommendedFilterCard
            cardWidth={cardWidth}
            filter={filter}
            isLiked={Boolean(isMakeupFilterLiked?.(filter.id))}
            onPress={onPressFilter}
            onToggleLike={onToggleFilterLike}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recommendedFilterPreviewList}
        viewabilityConfig={viewabilityConfig}
        windowSize={3}
      />
    </YStack>
  );
}
function RecommendedFilterListHeader({
  onPressMore,
  onSelectCategory,
  selectedCategory,
}: {
  onPressMore?: () => void;
  onSelectCategory: (categoryId: RecommendedFilterCategoryId) => void;
  selectedCategory: RecommendedFilterCategoryId;
}) {
  return (
    <YStack style={styles.section}>
      <SectionHeader
        actionAccessibilityLabel="추천 메이크업 필터 더보기"
        actionLabel={recommendedFilterMoreButtonLabel}
        description={recommendedFilterSectionDescription}
        onPressAction={onPressMore}
        title={recommendedFilterSectionTitle}
      />

      <TamaguiScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recommendedFilterCategoryList}>
        {recommendedFilterCategories.map(category => {
          const selected = category.id === selectedCategory;

          return (
            <Pressable
              accessibilityLabel={`${category.label} 추천 필터 보기`}
              accessibilityRole="button"
              key={category.id}
              onPress={() => onSelectCategory(category.id)}
              style={({pressed}) => [
                styles.recommendedFilterCategoryChip,
                selected && styles.recommendedFilterCategoryChipSelected,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.recommendedFilterCategoryText,
                  selected && styles.recommendedFilterCategoryTextSelected,
                ]}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </TamaguiScrollView>
    </YStack>
  );
}

export function getRecommendedFilterAccessibilityLabel(
  filter: RecommendedMakeupFilter,
): string {
  return `${filter.headline} ${filter.displayTitle}`;
}

export function getRecommendedFilterRouteParams(filterId: string) {
  return {
    initialGuideMode: 'half',
    initialMakeupFilterId: filterId,
    source: 'recommendedFilter',
  } as const;
}

function RecommendedFilterCard({
  cardWidth,
  filter,
  isLiked,
  onPress,
  onToggleLike,
}: {
  cardWidth: number;
  filter: RecommendedMakeupFilter;
  isLiked: boolean;
  onPress?: (filterId: string) => void;
  onToggleLike?: (filterId: string) => void;
}) {
  const handleToggleLike = () => {
    onToggleLike?.(filter.id);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={getRecommendedFilterAccessibilityLabel(filter)}
      onPress={() => onPress?.(filter.id)}
      style={({pressed}) => [
        styles.recommendedFilterCard,
        {width: cardWidth},
        pressed && styles.pressed,
      ]}>
      <CachedImage
        contentFit="cover"
        recyclingKey={filter.id}
        source={filter.imageSource}
        style={styles.recommendedFilterImage}
      />
      <YStack style={styles.recommendedFilterCopy}>
        <Text numberOfLines={1} style={styles.recommendedFilterTitle}>
          {filter.displayTitle}
        </Text>
      </YStack>
      <Pressable
        accessibilityLabel={`${filter.displayTitle} 좋아요 ${isLiked ? '해제' : '추가'}`}
        accessibilityRole="button"
        onPress={handleToggleLike}
        style={({pressed}) => [
          styles.recommendedFilterFavoriteButton,
          isLiked && styles.recommendedFilterFavoriteButtonActive,
          pressed && styles.pressed,
        ]}>
        <Heart
          color={isLiked ? colors.white : colors.textPrimary}
          fill={isLiked ? colors.white : 'transparent'}
          size={iconSize.sm}
          strokeWidth={2}
        />
      </Pressable>
    </Pressable>
  );
}
function RecommendedFilterRowSeparator() {
  return <View style={styles.recommendedFilterRowSeparator} />;
}

type SectionHeaderProps = {
  actionAccessibilityLabel?: string;
  actionLabel?: string;
  description?: string;
  onPressAction?: () => void;
  title: string;
};

function SectionHeader({
  actionAccessibilityLabel,
  actionLabel,
  description,
  onPressAction,
  title,
}: SectionHeaderProps) {
  return (
    <XStack style={styles.sectionHeader}>
      <YStack style={styles.sectionTitleGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description ? (
          <Text numberOfLines={1} style={styles.sectionDescription}>
            {description}
          </Text>
        ) : null}
      </YStack>
      {actionLabel && onPressAction ? (
        <Pressable
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={onPressAction}
          style={({pressed}) => [styles.sectionMoreAction, pressed && styles.pressed]}>
          <Text style={styles.sectionMoreLabel}>{actionLabel}</Text>
          <ArrowRight color={colors.textSecondary} size={iconSize.xs} strokeWidth={1.8} />
        </Pressable>
      ) : null}
    </XStack>
  );
}

function HomeModuleSeparator() {
  return <View style={styles.homeModuleSeparator} />;
}

const styles = StyleSheet.create({
  homeContainer: {
    backgroundColor: colors.background,
    flex: 1,
  },
  homeListContent: {
    paddingHorizontal: 0,
    paddingTop: homeHeroLayoutMetrics.listTopPadding,
  },
  homeListHeader: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl * 2 + spacing.sm,
  },
  homeModuleSeparator: {
    height: spacing.xxl * 2 + spacing.sm,
  },
  heroBackgroundImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  heroCarousel: {
    gap: 0,
  },
  heroCarouselFrame: {
    overflow: 'hidden',
    position: 'relative',
  },
  heroCarouselScroll: {
    height: '100%',
  },
  heroBanner: {
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    position: 'relative',
  },
  heroCopy: {
    bottom: spacing.xxl + spacing.lg,
    gap: homeHeroLayoutMetrics.copyGap,
    left: spacing.screenX,
    maxWidth: 246,
    position: 'absolute',
    zIndex: 1,
  },
  heroTitleGroup: {
    gap: homeHeroLayoutMetrics.titleGroupGap,
  },
  heroTitleLead: {
    ...heroTrendTitleReadableTextStyle,
    color: 'rgba(255, 255, 255, 0.88)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  heroTitleMain: {
    ...heroTrendTitleMainTextStyle,
  },
  heroPagination: {
    alignItems: 'center',
    bottom: spacing.lg,
    flexDirection: 'row',
    gap: spacing.xs,
    left: spacing.screenX,
    position: 'absolute',
    zIndex: 2,
  },
  heroPaginationDot: {
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  heroPaginationDotActive: {
    backgroundColor: colors.white,
    width: 14,
  },
  heroScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  homeHeroChrome: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing.screenX,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 4,
  },
  homeHeroMenuButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.10,
    shadowRadius: 10,
    width: 40,
  },
  homeHeroLogo: {
    textShadowColor: 'rgba(255, 255, 255, 0.72)',
    textShadowOffset: {height: 0, width: 0},
    textShadowRadius: 8,
  },
  homeHeroRightActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  beautyJourneyDialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    marginHorizontal: spacing.xl,
    padding: spacing.xl,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  dialogBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dialogButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  dialogButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  dialogDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  dialogTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  recommendedFilterCard: {
    aspectRatio: 0.82,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  recommendedFilterCategoryChip: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recommendedFilterCategoryChipSelected: {
    backgroundColor: colors.blackSurface,
    borderColor: colors.transparent,
  },
  recommendedFilterCategoryList: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  recommendedFilterCategoryText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recommendedFilterCategoryTextSelected: {
    color: colors.white,
  },
  recommendedFilterCopy: {
    bottom: recommendedFilterCopyVerticalPadding,
    gap: 2,
    left: spacing.sm,
    minWidth: 0,
    position: 'absolute',
    right: spacing.sm,
    zIndex: 1,
  },
  recommendedFilterImage: {
    height: '100%',
    width: '100%',
  },
  recommendedFilterFavoriteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.86)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 30,
    zIndex: 2,
  },
  recommendedFilterFavoriteButtonActive: {
    backgroundColor: colors.blackSurface,
    borderColor: colors.transparent,
  },
  recommendedFilterPreviewList: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
  recommendedFilterTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textShadowColor: 'rgba(0, 0, 0, 0.48)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 5,
  },
  recommendedFilterRow: {
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
  },
  recommendedFilterRowSeparator: {
    height: spacing.lg,
  },
  pressed: {
    opacity: 0.78,
  },
  homeServiceShortcutCircle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: HOME_SERVICE_SHORTCUT_CIRCLE_SIZE,
    justifyContent: 'center',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: HOME_SERVICE_SHORTCUT_CIRCLE_SIZE,
  },
  homeServiceShortcutItem: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  homeServiceShortcutLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    minHeight: HOME_SERVICE_SHORTCUT_LABEL_MIN_HEIGHT,
    textAlign: 'center',
    width: '100%',
  },
  homeServiceShortcutList: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.screenX,
  },
  homeServiceShortcutRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  scrollTopButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: scrollTopButtonSize,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -scrollTopButtonSize / 2,
    position: 'absolute',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    top: spacing.md,
    width: scrollTopButtonSize,
    zIndex: 20,
    elevation: 4,
  },
  section: {
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sectionMoreAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 40,
  },
  sectionMoreLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  sectionTitleGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
