import {useEffect, useMemo, useRef, useState, type ElementRef, type ReactNode} from 'react';
import {
  Modal,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import {
  Camera,
  ChevronUp,
  Compass,
  Heart,
  MessageSquareText,
  PackageSearch,
  ScanFace,
  ScanSearch,
  Store,
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
import {CommunityFooterIcon, MenuHeaderIcon, SectionMoreButton} from '../../../shared/ui';
import {CachedImage, prefetchImageSources} from '../../../shared/ui/CachedImage';
import {getHomeData} from '../services/homeService';
import type {
  HomeData,
  HomeHeroFeatureId,
  HomeTrendItem,
} from '../types';

export {getHomeMakeupExtractionActionLabels} from '../components/MakeupExtractionActionSheet';
export {getHomeMakeupFeedbackActionLabels} from '../components/MakeupFeedbackActionSheet';

type HomeScreenProps = {
  headerRightSlot?: ReactNode;
  onOpenFeatureMenu?: () => void;
  onPressArFilter?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressCommunity?: () => void;
  onPressConsulting?: () => void;
  onPressHalfMakeup?: () => void;
  onPressMakeupExtraction?: () => void;
  onPressMakeupFeedback?: () => void;
  onPressMakeupFilter?: () => void;
  onPressProductRecommendations?: () => void;
  onPressRecommendedFilterMore?: () => void;
  onPressHeroTrendFilter?: (filterId: string) => void;
  onPressRecommendedFilter?: (filterId: string) => void;
  isMakeupFilterLiked?: (filterId: string) => boolean;
  onToggleMakeupFilterLike?: (filterId: string) => void;
  onConfirmBeautyJourneyGuide?: () => void;
  showBeautyJourneyGuide?: boolean;
};

export function HomeScreen({
  headerRightSlot,
  onOpenFeatureMenu,
  onPressArFilter,
  onPressFaceDiagnosis,
  onPressHeroTrendFilter,
  onPressCommunity,
  onPressConsulting,
  onPressHalfMakeup,
  onPressMakeupExtraction,
  onPressMakeupFeedback,
  onPressMakeupFilter,
  onPressProductRecommendations,
  onPressRecommendedFilterMore,
  onPressRecommendedFilter,
  isMakeupFilterLiked,
  onToggleMakeupFilterLike,
  onConfirmBeautyJourneyGuide,
  showBeautyJourneyGuide = false,
}: HomeScreenProps) {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const listRef = useRef<ElementRef<typeof NativeScrollView>>(null);
  const insets = useSafeAreaInsets();
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
  const bottomPadding =
    APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + Math.max(insets.bottom, spacing.md);

  const handleListScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const shouldShowButton = getIsHomeScrollTopButtonVisible(
      event.nativeEvent.contentOffset.y,
    );

    setShowScrollTopButton(current => (
      current === shouldShowButton ? current : shouldShowButton
    ));
  };

  const handleScrollToTop = () => {
    listRef.current?.scrollTo({animated: true, y: 0});
  };

  const handleHeroFeaturePress = (featureId: HomeHeroFeatureId) => {
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

    onPressProductRecommendations?.();
  };

  useEffect(() => {
    let isMounted = true;

    getHomeData().then((data) => {
      if (isMounted) {
        setHomeData(data);
        prefetchImageSources([
          data.hero.imageSource,
          ...data.hero.trends.map((trend) => trend.imageSource),
        ]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    getRecommendedMakeupFiltersFromApi().then((filters) => {
      if (isMounted) {
        setRecommendedMakeupFilters(filters);
        prefetchImageSources(filters.map((filter) => filter.imageSource));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!homeData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>홈을 불러오는 중이에요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.homeContainer}>
      <NativeScrollView
        ref={listRef}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        scrollIndicatorInsets={{bottom: 0, left: 0, right: 0, top: 0}}
        contentContainerStyle={[
          styles.homeListContent,
          {paddingBottom: bottomPadding},
        ]}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        <YStack style={styles.homeListHeader}>
          <HeroBannerCarousel
            bannerHeight={heroBannerHeight}
            bannerWidth={heroBannerWidth}
            fallbackImageSource={homeData.hero.imageSource}
            headerRightSlot={headerRightSlot}
            onOpenFeatureMenu={onOpenFeatureMenu}
            onPressFeature={handleHeroFeaturePress}
            onPressFilter={onPressHeroTrendFilter}
            topInset={insets.top}
            trends={homeData.hero.trends}
          />

          <HomeServiceShortcutSection
            onPressArFilter={onPressArFilter}
            onPressFaceDiagnosis={onPressFaceDiagnosis}
            onPressCommunity={onPressCommunity}
            onPressConsulting={onPressConsulting}
            onPressHalfMakeup={onPressHalfMakeup}
            onPressMakeupExtraction={onPressMakeupExtraction}
            onPressMakeupFeedback={onPressMakeupFeedback}
            onPressMakeupFilter={onPressMakeupFilter}
            onPressProductRecommendations={onPressProductRecommendations}
            onPressRecommendedFilterMore={onPressRecommendedFilterMore}
          />

          <RecommendedFilterPreviewSection
            cardWidth={recommendedFilterPreviewCardWidth}
            filters={recommendedFilterPreviewItems}
            isMakeupFilterLiked={isMakeupFilterLiked}
            onPressFilter={onPressRecommendedFilter}
            onPressMore={onPressRecommendedFilterMore}
            onToggleFilterLike={onToggleMakeupFilterLike}
          />
        </YStack>
      </NativeScrollView>
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
  onOpenFeatureMenu?: () => void;
  onPressFeature?: (featureId: HomeHeroFeatureId) => void;
  onPressFilter?: (filterId: string) => void;
  topInset: number;
  trends: HomeTrendItem[];
};

type HeroBannerCardProps = {
  activeIndex: number;
  bannerHeight: number;
  bannerWidth: number;
  ctaLabel?: string;
  description?: string;
  featureId?: HomeHeroFeatureId;
  filterId?: string;
  imageSource: ImageSourcePropType;
  itemCount: number;
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
export const HOME_HERO_BANNER_ASPECT_RATIO = 1.62;
export const HOME_HERO_AUTOSCROLL_INTERVAL_MS = 2500;
const HOME_HERO_CHROME_ACTION_HEIGHT = 40;
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
  onOpenFeatureMenu,
  onPressFeature,
  onPressFilter,
  topInset,
  trends,
}: HeroBannerCarouselProps) {
  const heroCarouselRef = useRef<NativeScrollView>(null);
  const snapInterval = bannerWidth;
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const heroItems =
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
        ];
  const heroRenderItems = getHeroCarouselRenderItems(heroItems);
  const initialScrollOffsetX = getHeroCarouselInitialOffset({
    itemCount: heroItems.length,
    snapInterval,
  });
  const chromeReservedHeight =
    topInset + spacing.sm + HOME_HERO_CHROME_ACTION_HEIGHT + spacing.sm;
  const frameHeight = bannerHeight + chromeReservedHeight;

  useEffect(() => {
    setActiveHeroIndex(0);
    heroCarouselRef.current?.scrollTo({
      animated: false,
      x: initialScrollOffsetX,
    });
  }, [heroItems.length, initialScrollOffsetX]);

  useEffect(() => {
    if (heroItems.length <= 1 || snapInterval <= 0) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setActiveHeroIndex(currentIndex => {
        const nextIndex = (currentIndex + 1) % heroItems.length;
        const nextSnapIndex =
          currentIndex === heroItems.length - 1
            ? heroItems.length + 1
            : currentIndex + 2;

        heroCarouselRef.current?.scrollTo({
          animated: true,
          x: nextSnapIndex * snapInterval,
        });

        return nextIndex;
      });
    }, HOME_HERO_AUTOSCROLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [heroItems.length, snapInterval]);

  const handleHeroCarouselScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextActiveIndex = getHeroCarouselActiveIndex({
      itemCount: heroItems.length,
      scrollOffsetX: event.nativeEvent.contentOffset.x,
      snapInterval,
    });

    setActiveHeroIndex(current => (
      current === nextActiveIndex ? current : nextActiveIndex
    ));
  };
  const handleHeroCarouselScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const scrollOffsetX = event.nativeEvent.contentOffset.x;

    setActiveHeroIndex(
      getHeroCarouselActiveIndex({
        itemCount: heroItems.length,
        scrollOffsetX,
        snapInterval,
      }),
    );

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
  };
  const heroCarouselLoopResetHandlers =
    createHeroCarouselLoopResetHandlers(handleHeroCarouselScrollEnd);

  return (
    <View style={[styles.heroCarouselFrame, {height: frameHeight, width: bannerWidth}]}>
      <NativeScrollView
        ref={heroCarouselRef}
        horizontal
        contentOffset={{x: initialScrollOffsetX, y: 0}}
        decelerationRate="normal"
        disableIntervalMomentum
        onMomentumScrollEnd={heroCarouselLoopResetHandlers.onMomentumScrollEnd}
        onScroll={handleHeroCarouselScroll}
        scrollEventThrottle={16}
        onScrollEndDrag={heroCarouselLoopResetHandlers.onScrollEndDrag}
        snapToAlignment="start"
        snapToInterval={snapInterval}
        showsHorizontalScrollIndicator={false}
        style={[
          styles.heroCarouselScroll,
          {height: bannerHeight, marginTop: chromeReservedHeight},
        ]}
        contentContainerStyle={styles.heroCarousel}>
        {heroRenderItems.map((item, index) => (
          <HeroBannerCard
            activeIndex={activeHeroIndex}
            bannerHeight={bannerHeight}
            bannerWidth={bannerWidth}
            ctaLabel={item.ctaLabel}
            description={item.description}
            featureId={item.featureId}
            filterId={item.filterId}
            imageSource={item.imageSource}
            itemCount={heroItems.length}
            key={`${item.id}-${index}`}
            onPressFeature={onPressFeature}
            onPressFilter={onPressFilter}
            title={item.title}
            tone={item.tone}
          />
        ))}
      </NativeScrollView>
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
      <View style={styles.homeHeroLogoSurface}>
        <Text style={styles.homeHeroLogo}>AURA</Text>
      </View>
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

function HeroBannerCard({
  activeIndex,
  bannerHeight,
  bannerWidth,
  ctaLabel,
  description,
  featureId,
  filterId,
  imageSource,
  itemCount,
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
      <CachedImage contentFit="cover" source={imageSource} style={styles.heroBackgroundImage} />
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

      <HeroPaginationIndicator activeIndex={activeIndex} count={itemCount} />

    </Pressable>
  );
}


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
export const HOME_FILTER_STORE_SERVICE_SHORTCUT_ICON_NAME = 'Store';
export const HOME_CONSULTING_SERVICE_SHORTCUT_ICON_NAME = 'Compass';
export const HOME_SERVICE_SHORTCUT_LABELS = [
  '얼굴 분석',
  '메이크업 필터',
  '메이크업 추출',
  '메이크업 피드백',
  '필터 스토어',
  '추천 제품',
  '컨설팅',
  '커뮤니티',
] as const;
export const HOME_SERVICE_SHORTCUT_ROW_LABELS = [
  HOME_SERVICE_SHORTCUT_LABELS.slice(0, 4),
  HOME_SERVICE_SHORTCUT_LABELS.slice(4),
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
      id: 'filterStore',
      label: HOME_SERVICE_SHORTCUT_LABELS[4],
      accessibilityLabel: '필터 스토어 보기',
      icon: (color: string) => (
        <Store color={color} size={iconSize.lg} strokeWidth={1.9} />
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
      id: 'community',
      label: HOME_SERVICE_SHORTCUT_LABELS[7],
      accessibilityLabel: '커뮤니티 보기',
      icon: (color: string) => (
        <CommunityFooterIcon color={color} size={iconSize.lg} strokeWidth={2.1} />
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
  onPressCommunity?: () => void;
  onPressConsulting?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressHalfMakeup?: () => void;
  onPressMakeupExtraction?: () => void;
  onPressMakeupFeedback?: () => void;
  onPressMakeupFilter?: () => void;
  onPressProductRecommendations?: () => void;
  onPressRecommendedFilterMore?: () => void;
};

export function getHomeServiceShortcutPressHandler(
  actionId: HomeServiceShortcutId,
  {
    onPressArFilter,
    onPressCommunity,
    onPressConsulting,
    onPressFaceDiagnosis,
    onPressHalfMakeup,
    onPressMakeupExtraction,
    onPressMakeupFeedback,
    onPressMakeupFilter,
    onPressProductRecommendations,
    onPressRecommendedFilterMore,
  }: HomeServiceShortcutHandlers,
): (() => void) | undefined {
  if (actionId === 'diagnosis') {
    return onPressFaceDiagnosis;
  }

  if (actionId === 'arFilter') {
    return onPressMakeupFilter;
  }

  if (actionId === 'community') {
    return onPressCommunity;
  }

  if (actionId === 'makeupExtraction') {
    return onPressMakeupExtraction;
  }

  if (actionId === 'recommendation') {
    return onPressProductRecommendations;
  }

  if (actionId === 'filterStore') {
    return onPressRecommendedFilterMore;
  }

  if (actionId === 'consulting') {
    return onPressConsulting;
  }

  if (actionId === 'makeupFeedback') {
    return onPressMakeupFeedback;
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
  onPressCommunity,
  onPressConsulting,
  onPressFaceDiagnosis,
  onPressHalfMakeup,
  onPressMakeupExtraction,
  onPressMakeupFeedback,
  onPressMakeupFilter,
  onPressProductRecommendations,
  onPressRecommendedFilterMore,
}: HomeServiceShortcutHandlers) {
  const homeServiceShortcutHandlers: HomeServiceShortcutHandlers = {
    onPressArFilter,
    onPressCommunity,
    onPressConsulting,
    onPressFaceDiagnosis,
    onPressHalfMakeup,
    onPressMakeupExtraction,
    onPressMakeupFeedback,
    onPressMakeupFilter,
    onPressProductRecommendations,
    onPressRecommendedFilterMore,
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

      <NativeScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recommendedFilterPreviewList}>
        {filters.map(filter => (
          <RecommendedFilterCard
            cardWidth={cardWidth}
            filter={filter}
            isLiked={Boolean(isMakeupFilterLiked?.(filter.id))}
            key={filter.id}
            onPress={onPressFilter}
            onToggleLike={onToggleFilterLike}
          />
        ))}
      </NativeScrollView>
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
        <Text numberOfLines={1} style={styles.recommendedFilterHeadline}>
          {filter.headline}
        </Text>
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
        <SectionMoreButton
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          label={actionLabel}
          onPress={onPressAction}
        />
      ) : null}
    </XStack>
  );
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
    gap: spacing.xl,
    paddingBottom: spacing.lg,
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
  homeHeroLogoSurface: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  homeHeroLogo: {
    color: colors.brandMuted,
    fontFamily: typography.logoHeader.fontFamily,
    fontSize: 26,
    fontWeight: typography.logoHeader.fontWeight,
    letterSpacing: 0,
    lineHeight: 32,
    textShadowColor: 'rgba(0, 0, 0, 0.34)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 1.1,
  },
  homeHeroMenuButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.10,
    shadowRadius: 10,
    width: 38,
  },
  homeHeroRightActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
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
  recommendedFilterHeadline: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.42)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
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
    paddingRight: spacing.screenX,
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
    gap: spacing.md,
    paddingHorizontal: spacing.screenX,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
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
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  sectionTitleGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
