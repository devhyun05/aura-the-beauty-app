import {useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Image,
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
  ArrowRight,
  ChevronUp,
  Compass,
  Heart,
  MessageCircle,
  PackageSearch,
  ScanFace,
  ScanSearch,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ScrollView as TamaguiScrollView, Text, View, XStack, YStack} from 'tamagui';

import {getRecommendedMakeupFilters} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {RecommendedMakeupFilter} from '../../../shared/types/makeupGuide';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../../shared/ui/AppFooter';
import {MakeupExtractionActionSheet} from '../components/MakeupExtractionActionSheet';
import {getHomeData} from '../services/homeService';
import type {
  HomeData,
  HomeTrendItem,
} from '../types';

export {getHomeMakeupExtractionActionLabels} from '../components/MakeupExtractionActionSheet';

type HomeScreenProps = {
  onPressConsulting?: () => void;
  onPressCommunity?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressMakeupExtraction?: () => void;
  onPressMakeupExtractionCamera?: () => void;
  onPressMakeupExtractionUpload?: () => void;
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
  onPressConsulting,
  onPressCommunity,
  onPressFaceDiagnosis,
  onPressHeroTrendFilter,
  onPressMakeupExtraction,
  onPressMakeupExtractionCamera,
  onPressMakeupExtractionUpload,
  onPressProductRecommendations,
  onPressRecommendedFilterMore,
  onPressRecommendedFilter,
  isMakeupFilterLiked,
  onToggleMakeupFilterLike,
  onConfirmBeautyJourneyGuide,
  showBeautyJourneyGuide = false,
}: HomeScreenProps) {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<RecommendedFilterCategoryId>('all');
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [isMakeupExtractionSheetVisible, setIsMakeupExtractionSheetVisible] =
    useState(false);
  const listRef = useRef<FlatList<RecommendedMakeupFilter>>(null);
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const heroCardWidth = Math.max(300, Math.min(width - spacing.lg * 2, width * 0.86));
  const recommendedMakeupFilters = useMemo(() => getRecommendedMakeupFilters(), []);
  const visibleRecommendedFilters = useMemo(
    () => filterRecommendedMakeupFiltersByHomeCategory(
      recommendedMakeupFilters,
      selectedCategory,
    ),
    [recommendedMakeupFilters, selectedCategory],
  );
  const recommendedFilterGridGap = spacing.md;
  const recommendedFilterGridWidth = width - spacing.screenX * 2;
  const recommendedFilterCardWidth = Math.floor(
    (recommendedFilterGridWidth - recommendedFilterGridGap) / 2,
  );
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
    listRef.current?.scrollToOffset({animated: true, offset: 0});
  };

  const handleOpenMakeupExtractionSheet = () => {
    setIsMakeupExtractionSheetVisible(true);
  };

  const handleCloseMakeupExtractionSheet = () => {
    setIsMakeupExtractionSheetVisible(false);
  };

  const handlePressMakeupExtractionCamera = () => {
    setIsMakeupExtractionSheetVisible(false);
    (onPressMakeupExtractionCamera ?? onPressMakeupExtraction)?.();
  };

  const handlePressMakeupExtractionUpload = () => {
    setIsMakeupExtractionSheetVisible(false);
    (onPressMakeupExtractionUpload ?? onPressMakeupExtraction)?.();
  };

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
    <View style={styles.homeContainer}>
      <FlatList
        ref={listRef}
        columnWrapperStyle={[
          styles.recommendedFilterRow,
          {gap: recommendedFilterGridGap},
        ]}
        contentContainerStyle={[
          styles.homeListContent,
          {paddingBottom: bottomPadding},
        ]}
        data={visibleRecommendedFilters}
        extraData={isMakeupFilterLiked}
        initialNumToRender={recommendedFilterListVirtualizationConfig.initialNumToRender}
        ItemSeparatorComponent={RecommendedFilterRowSeparator}
        keyExtractor={filter => filter.id}
        ListHeaderComponent={
          <YStack style={styles.homeListHeader}>
            <HeroBannerCarousel
              cardWidth={heroCardWidth}
              fallbackImageSource={homeData.hero.imageSource}
              onPressFilter={onPressHeroTrendFilter}
              trends={homeData.hero.trends}
            />

            <QuickActionSection
              onPressConsulting={onPressConsulting}
              onPressCommunity={onPressCommunity}
              onPressFaceDiagnosis={onPressFaceDiagnosis}
              onPressMakeupExtraction={handleOpenMakeupExtractionSheet}
              onPressProductRecommendations={onPressProductRecommendations}
            />

            <RecommendedFilterListHeader
              selectedCategory={selectedCategory}
              onPressMore={onPressRecommendedFilterMore}
              onSelectCategory={setSelectedCategory}
            />
          </YStack>
        }
        maxToRenderPerBatch={
          recommendedFilterListVirtualizationConfig.maxToRenderPerBatch
        }
        numColumns={getRecommendedFilterGridColumnCount()}
        onScroll={handleListScroll}
        renderItem={({item}) => (
          <RecommendedFilterCard
            cardWidth={recommendedFilterCardWidth}
            filter={item}
            isLiked={Boolean(isMakeupFilterLiked?.(item.id))}
            onPress={onPressRecommendedFilter}
            onToggleLike={onToggleMakeupFilterLike}
          />
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={
          recommendedFilterListVirtualizationConfig.updateCellsBatchingPeriod
        }
        windowSize={recommendedFilterListVirtualizationConfig.windowSize}
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

      <MakeupExtractionActionSheet
        isVisible={isMakeupExtractionSheetVisible}
        onClose={handleCloseMakeupExtractionSheet}
        onPressCamera={handlePressMakeupExtractionCamera}
        onPressUpload={handlePressMakeupExtractionUpload}
      />

      <BeautyJourneyGuideDialog
        isVisible={showBeautyJourneyGuide}
        onConfirm={onConfirmBeautyJourneyGuide}
      />
    </View>
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
export const recommendedFilterSectionDescription = undefined;
export const recommendedFilterMoreButtonLabel = '더보기' as const;
export const homeHeroLayoutMetrics = {
  copyGap: spacing.sm,
  listTopPadding: spacing.sm,
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

export const HOME_SCROLL_TOP_VISIBLE_OFFSET = 360;

export function getIsHomeScrollTopButtonVisible(scrollOffsetY: number): boolean {
  return scrollOffsetY >= HOME_SCROLL_TOP_VISIBLE_OFFSET;
}

const scrollTopButtonSize = iconSize.xl + spacing.md;

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

export const HOME_CONSULTING_QUICK_ACTION_ICON_NAME = 'Compass';

const quickActions = [
  {
    id: 'diagnosis',
    label: '얼굴\n분석',
    accessibilityLabel: '얼굴 분석 시작',
    icon: (color: string) => <ScanFace color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
  {
    id: 'makeupExtraction',
    label: '\uBA54\uC774\uD06C\uC5C5\n\uCD94\uCD9C',
    accessibilityLabel: '\uBA54\uC774\uD06C\uC5C5 \uCD94\uCD9C \uC2DC\uC791',
    icon: (color: string) => (
      <ScanSearch color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
  {
    id: 'recommendation',
    label: '\uCD94\uCC9C\n\uC81C\uD488',
    accessibilityLabel: '\uCD94\uCC9C \uC81C\uD488 \uBCF4\uAE30',
    icon: (color: string) => (
      <PackageSearch color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
  {
    id: 'community',
    label: '\uCEE4\uBBA4\uB2C8\uD2F0',
    accessibilityLabel: '\uCEE4\uBBA4\uB2C8\uD2F0 \uBCF4\uAE30',
    icon: (color: string) => (
      <MessageCircle color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
  {
    id: 'consulting',
    label: '\uCEE8\uC124\uD305',
    accessibilityLabel: '\uCEE8\uC124\uD305 \uBCF4\uAE30',
    icon: (color: string) => (
      <Compass color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
] as const;

type HomeQuickActionId = (typeof quickActions)[number]['id'];

type HomeQuickActionHandlers = {
  onPressConsulting?: () => void;
  onPressCommunity?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressMakeupExtraction?: () => void;
  onPressProductRecommendations?: () => void;
};

export function getHomeQuickActionPressHandler(
  actionId: HomeQuickActionId,
  {
    onPressConsulting,
    onPressCommunity,
    onPressFaceDiagnosis,
    onPressMakeupExtraction,
    onPressProductRecommendations,
  }: HomeQuickActionHandlers,
): (() => void) | undefined {
  if (actionId === 'diagnosis') {
    return onPressFaceDiagnosis;
  }

  if (actionId === 'recommendation') {
    return onPressProductRecommendations;
  }

  if (actionId === 'makeupExtraction') {
    return onPressMakeupExtraction;
  }

  if (actionId === 'community') {
    return onPressCommunity;
  }

  if (actionId === 'consulting') {
    return onPressConsulting;
  }

  return undefined;
}

export function getHomeQuickActionLabels(): readonly string[] {
  return quickActions.map(action => action.label);
}

function QuickActionSection({
  onPressConsulting,
  onPressCommunity,
  onPressFaceDiagnosis,
  onPressMakeupExtraction,
  onPressProductRecommendations,
}: HomeQuickActionHandlers) {
  const quickActionHandlers: HomeQuickActionHandlers = {
    onPressConsulting,
    onPressCommunity,
    onPressFaceDiagnosis,
    onPressMakeupExtraction,
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
      <Image
        resizeMode="cover"
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
          onPress={onPressAction}
          style={({pressed}) => [styles.sectionMoreButton, pressed && styles.pressed]}>
          <Text style={styles.sectionMoreText}>{actionLabel}</Text>
          <ArrowRight color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        </Pressable>
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
    paddingHorizontal: spacing.screenX,
    paddingTop: homeHeroLayoutMetrics.listTopPadding,
  },
  homeListHeader: {
    gap: spacing.xxl,
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
    gap: homeHeroLayoutMetrics.copyGap,
    left: spacing.xl,
    maxWidth: 236,
    position: 'absolute',
    top: spacing.xl,
    zIndex: 1,
  },
  heroTitleGroup: {
    gap: homeHeroLayoutMetrics.titleGroupGap,
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
    backgroundColor: colors.textPrimary,
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
    backgroundColor: 'rgba(17, 17, 17, 0.70)',
    bottom: 0,
    gap: 2,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: 0,
    zIndex: 1,
  },
  recommendedFilterHeadline: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.58)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 5,
  },
  recommendedFilterImage: {
    height: '100%',
    width: '100%',
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
  recommendedFilterTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 7,
  },
  recommendedFilterRow: {
    justifyContent: 'space-between',
  },
  recommendedFilterRowSeparator: {
    height: spacing.lg,
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
  scrollTopButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
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
  sectionMoreButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  sectionMoreText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
});
