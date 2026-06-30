import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  type GestureResponderEvent,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowRight,
  Camera,
  Heart,
  PackageSearch,
  ScanFace,
  Sparkles,
  WandSparkles,
} from 'lucide-react-native';
import {ScrollView as TamaguiScrollView, Text, View, XStack, YStack} from 'tamagui';

import {getRecommendedMakeupFilters} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {RecommendedMakeupFilter} from '../../../shared/types/makeupGuide';
import {getHomeData} from '../services/homeService';
import type {
  HomeData,
  HomeTrendItem,
} from '../types';

type HomeScreenProps = {
  onPressARFilter?: () => void;
  onPressReferenceMakeupExtraction?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressMakeupFeedback?: () => void;
  onPressProductRecommendations?: () => void;
  onPressHeroTrendFilter?: (filterId: string) => void;
  onPressRecommendedFilter?: (filterId: string) => void;
  isMakeupFilterLiked?: (filterId: string) => boolean;
  onToggleMakeupFilterLike?: (filterId: string) => void;
};

export function HomeScreen({
  onPressARFilter,
  onPressReferenceMakeupExtraction,
  onPressFaceDiagnosis,
  onPressHeroTrendFilter,
  onPressMakeupFeedback,
  onPressProductRecommendations,
  onPressRecommendedFilter,
  isMakeupFilterLiked,
  onToggleMakeupFilterLike,
}: HomeScreenProps) {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const {width} = useWindowDimensions();
  const heroCardWidth = Math.max(300, Math.min(width - spacing.lg * 2, width * 0.86));
  const recommendedMakeupFilters = useMemo(() => getRecommendedMakeupFilters(), []);
  const recommendedFilterGridGap = spacing.md;
  const recommendedFilterGridWidth = width - spacing.screenX * 2;
  const recommendedFilterCardWidth = Math.floor(
    (recommendedFilterGridWidth - recommendedFilterGridGap) / 2,
  );

  useEffect(() => {
    let isMounted = true;

    getHomeData().then((data) => {
      if (isMounted) {
        setHomeData(data);
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
    <>
      <HeroBannerCarousel
        cardWidth={heroCardWidth}
        fallbackImageSource={homeData.hero.imageSource}
        onPressFilter={onPressHeroTrendFilter}
        trends={homeData.hero.trends}
      />

      <QuickActionSection
        onPressARFilter={onPressARFilter}
        onPressReferenceMakeupExtraction={onPressReferenceMakeupExtraction}
        onPressFaceDiagnosis={onPressFaceDiagnosis}
        onPressMakeupFeedback={onPressMakeupFeedback}
        onPressProductRecommendations={onPressProductRecommendations}
      />
      <RecommendedLooksSection
        cardGap={recommendedFilterGridGap}
        cardWidth={recommendedFilterCardWidth}
        filters={recommendedMakeupFilters}
        isFilterLiked={isMakeupFilterLiked}
        onPressFilter={onPressRecommendedFilter}
        onToggleFilterLike={onToggleMakeupFilterLike}
      />
    </>
  );
}

type HeroBannerCarouselProps = {
  cardWidth: number;
  fallbackImageSource: ImageSourcePropType;
  onPressFilter?: (filterId: string) => void;
  trends: HomeTrendItem[];
};

type HeroBannerCardProps = {
  cardWidth: number;
  filterId?: string;
  imageSource: ImageSourcePropType;
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
  color: colors.textPrimary,
  textShadowColor: 'rgba(255, 255, 255, 0.30)',
  textShadowOffset: {width: 0, height: 2},
  textShadowRadius: 8,
} as const;

export const heroTrendTitleMainTextStyle = {
  ...heroTrendTitleReadableTextStyle,
  fontFamily: typography.fontFamily.semibold,
  fontSize: typography.fontSize.xxl,
  lineHeight: typography.lineHeight.xxl,
} as const;

export const heroCtaLabel = '보러가기' as const;
export const recommendedFilterSectionTitle = '추천 메이크업 필터' as const;
export const recommendedFilterSectionDescription =
  '얼굴 무드에 맞춰 바로 적용해볼 수 있어요.' as const;

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

function HeroBannerCarousel({
  cardWidth,
  fallbackImageSource,
  onPressFilter,
  trends,
}: HeroBannerCarouselProps) {
  const heroCarouselRef = useRef<NativeScrollView>(null);
  const snapInterval = cardWidth + spacing.md;
  const heroItems =
    trends.length > 0
      ? trends.slice(0, 3)
      : [
          {
            id: 'weekly-default',
            imageSource: fallbackImageSource,
            title: '코랄 글로우',
            tone: '맑은 로즈 베이지',
          },
        ];
  const heroRenderItems = getHeroCarouselRenderItems(heroItems);
  const initialScrollOffsetX = getHeroCarouselInitialOffset({
    itemCount: heroItems.length,
    snapInterval,
  });

  useEffect(() => {
    heroCarouselRef.current?.scrollTo({
      animated: false,
      x: initialScrollOffsetX,
    });
  }, [initialScrollOffsetX]);

  const handleHeroCarouselScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const loopResetOffsetX = getHeroCarouselLoopResetOffset({
      itemCount: heroItems.length,
      scrollOffsetX: event.nativeEvent.contentOffset.x,
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
    <NativeScrollView
      ref={heroCarouselRef}
      horizontal
      contentOffset={{x: initialScrollOffsetX, y: 0}}
      decelerationRate="fast"
      onMomentumScrollEnd={heroCarouselLoopResetHandlers.onMomentumScrollEnd}
      onScrollEndDrag={heroCarouselLoopResetHandlers.onScrollEndDrag}
      snapToAlignment="start"
      snapToInterval={snapInterval}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.heroCarousel}>
      {heroRenderItems.map((item, index) => (
        <HeroBannerCard
          cardWidth={cardWidth}
          filterId={item.filterId}
          imageSource={item.imageSource}
          key={`${item.id}-${index}`}
          onPressFilter={onPressFilter}
          title={item.title}
          tone={item.tone}
        />
      ))}
    </NativeScrollView>
  );
}

function HeroBannerCard({
  cardWidth,
  filterId,
  imageSource,
  onPressFilter,
  title,
  tone,
}: HeroBannerCardProps) {
  const headline = getHeroTrendHeadline({title, tone});
  const [headlineLead, headlineTitle] = headline.split('\n');
  const accessibilityHeadline = headline.replace('\n', ' ');
  const handlePress = filterId ? () => onPressFilter?.(filterId) : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityHeadline} ${heroCtaLabel}`}
      onPress={handlePress}
      style={({pressed}) => [
        styles.heroBanner,
        {height: cardWidth, width: cardWidth},
        pressed && styles.pressed,
      ]}>
      <Image resizeMode="cover" source={imageSource} style={styles.heroBackgroundImage} />
      <View style={styles.heroScrim} />

      <YStack style={styles.heroCopy}>
        <XStack style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>WEEKLY TREND</Text>
        </XStack>

        <YStack style={styles.heroTitleGroup}>
          <Text style={styles.heroTitleLead}>{headlineLead}</Text>
          <Text style={styles.heroTitleMain}>{headlineTitle}</Text>
        </YStack>
      </YStack>

      <XStack style={styles.heroButton}>
        <Text style={styles.heroButtonText}>{heroCtaLabel}</Text>
        <ArrowRight color={colors.white} size={iconSize.sm} strokeWidth={2} />
      </XStack>
    </Pressable>
  );
}

const quickActions = [
  {
    id: 'ar',
    label: '실시간 AR',
    accessibilityLabel: '실시간 AR 시작',
    icon: (color: string) => <Camera color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
  {
    id: 'diagnosis',
    label: '얼굴 진단',
    accessibilityLabel: '얼굴 진단 시작',
    icon: (color: string) => <ScanFace color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
  {
    id: 'extract',
    label: '메이크업 추출',
    accessibilityLabel: '메이크업 추출',
    icon: (color: string) => <WandSparkles color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
  {
    id: 'makeup-feedback',
    label: '메이크업 피드백',
    accessibilityLabel: '메이크업 피드백 시작',
    icon: (color: string) => <Sparkles color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
  {
    id: 'recommendation',
    label: '추천 제품',
    accessibilityLabel: '추천 제품 보기',
    icon: (color: string) => (
      <PackageSearch color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
] as const;

type HomeQuickActionId = (typeof quickActions)[number]['id'];

type HomeQuickActionHandlers = {
  onPressARFilter?: () => void;
  onPressReferenceMakeupExtraction?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressMakeupFeedback?: () => void;
  onPressProductRecommendations?: () => void;
};

export function getHomeQuickActionPressHandler(
  actionId: HomeQuickActionId,
  {
    onPressARFilter,
    onPressReferenceMakeupExtraction,
    onPressFaceDiagnosis,
    onPressMakeupFeedback,
    onPressProductRecommendations,
  }: HomeQuickActionHandlers,
): (() => void) | undefined {
  if (actionId === 'ar') {
    return onPressARFilter;
  }

  if (actionId === 'diagnosis') {
    return onPressFaceDiagnosis;
  }

  if (actionId === 'extract') {
    return onPressReferenceMakeupExtraction;
  }

  if (actionId === 'makeup-feedback') {
    return onPressMakeupFeedback;
  }

  if (actionId === 'recommendation') {
    return onPressProductRecommendations;
  }

  return undefined;
}

function QuickActionSection({
  onPressARFilter,
  onPressReferenceMakeupExtraction,
  onPressFaceDiagnosis,
  onPressMakeupFeedback,
  onPressProductRecommendations,
}: HomeQuickActionHandlers) {
  const quickActionHandlers: HomeQuickActionHandlers = {
    onPressARFilter,
    onPressReferenceMakeupExtraction,
    onPressFaceDiagnosis,
    onPressMakeupFeedback,
    onPressProductRecommendations,
  };

  return (
    <XStack style={styles.quickActionList}>
      {quickActions.map((action) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          key={action.label}
          onPress={getHomeQuickActionPressHandler(action.id, quickActionHandlers)}
          style={({pressed}) => [styles.quickActionItem, pressed && styles.pressed]}>
          <View style={styles.quickActionCircle}>
            {action.icon(colors.textPrimary)}
          </View>
          <Text numberOfLines={2} style={styles.quickActionLabel}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </XStack>
  );
}

function RecommendedLooksSection({
  cardGap,
  cardWidth,
  filters,
  isFilterLiked,
  onPressFilter,
  onToggleFilterLike,
}: {
  cardGap: number;
  cardWidth: number;
  filters: readonly RecommendedMakeupFilter[];
  isFilterLiked?: (filterId: string) => boolean;
  onPressFilter?: (filterId: string) => void;
  onToggleFilterLike?: (filterId: string) => void;
}) {
  const [selectedCategory, setSelectedCategory] =
    useState<RecommendedFilterCategoryId>('all');
  const visibleFilters = useMemo(
    () => filterRecommendedMakeupFiltersByHomeCategory(filters, selectedCategory),
    [filters, selectedCategory],
  );

  return (
    <YStack style={styles.section}>
      <SectionHeader
        description={recommendedFilterSectionDescription}
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
              onPress={() => setSelectedCategory(category.id)}
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

      <View
        style={[
          styles.recommendedFilterGrid,
          {columnGap: cardGap, rowGap: spacing.lg},
        ]}>
        {visibleFilters.map(filter => (
          <RecommendedFilterCard
            cardWidth={cardWidth}
            filter={filter}
            isLiked={Boolean(isFilterLiked?.(filter.id))}
            key={filter.id}
            onPress={onPressFilter}
            onToggleLike={onToggleFilterLike}
          />
        ))}
      </View>
    </YStack>
  );
}

export function getRecommendedFilterAccessibilityLabel(
  filter: RecommendedMakeupFilter,
): string {
  return `${filter.headline} ${filter.displayTitle}, ${filter.matchScore}퍼센트 추천`;
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
  const handleToggleLike = (event: GestureResponderEvent) => {
    event.stopPropagation();
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
      <Image
        resizeMode="cover"
        source={filter.imageSource}
        style={styles.recommendedFilterImage}
      />
      <View style={styles.recommendedFilterScrim} />
      <YStack style={styles.recommendedFilterCopy}>
        <Text numberOfLines={1} style={styles.recommendedFilterHeadline}>
          {filter.headline}
        </Text>
        <Text numberOfLines={1} style={styles.recommendedFilterTitle}>
          {filter.displayTitle}
        </Text>
      </YStack>
      <XStack style={styles.recommendedFilterMetaRow}>
        <Text style={styles.recommendedFilterPillText}>{filter.matchScore}% match</Text>
      </XStack>
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
          color={colors.white}
          fill={isLiked ? colors.white : 'transparent'}
          size={iconSize.sm}
          strokeWidth={2}
        />
      </Pressable>
    </Pressable>
  );
}

type SectionHeaderProps = {
  description?: string;
  title: string;
};

function SectionHeader({
  description,
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
    </XStack>
  );
}

const styles = StyleSheet.create({
  heroBackgroundImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  heroBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  heroBadgeText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  heroCarousel: {
    gap: spacing.md,
  },
  heroBanner: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  heroCopy: {
    gap: spacing.md,
    left: spacing.xl,
    maxWidth: 236,
    position: 'absolute',
    top: spacing.xl,
    zIndex: 1,
  },
  heroTitleGroup: {
    gap: spacing.xs,
  },
  heroTitleLead: {
    ...heroTrendTitleReadableTextStyle,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  heroTitleMain: {
    ...heroTrendTitleMainTextStyle,
  },
  heroButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.textPrimary,
    bottom: spacing.xl,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    position: 'absolute',
    right: spacing.xl,
    zIndex: 1,
  },
  heroButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  heroScrim: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
  recommendedFilterCard: {
    aspectRatio: 0.78,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
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
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
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
    bottom: spacing.lg,
    gap: 2,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    zIndex: 1,
  },
  recommendedFilterHeadline: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recommendedFilterImage: {
    height: '100%',
    width: '100%',
  },
  recommendedFilterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recommendedFilterFavoriteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.70)',
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 32,
    zIndex: 2,
  },
  recommendedFilterFavoriteButtonActive: {
    backgroundColor: colors.textPrimary,
  },
  recommendedFilterMetaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    left: spacing.sm,
    position: 'absolute',
    right: spacing.xxl + spacing.lg,
    top: spacing.sm,
    zIndex: 1,
  },
  recommendedFilterPillText: {
    backgroundColor: 'rgba(17, 17, 17, 0.70)',
    borderRadius: radius.pill,
    color: colors.white,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recommendedFilterScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.44)',
    bottom: 0,
    height: 96,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  recommendedFilterTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  quickActionCircle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: 64,
  },
  quickActionItem: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  quickActionLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    minHeight: typography.lineHeight.xs * 2,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  quickActionList: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
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
    gap: 2,
  },
});
