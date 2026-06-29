import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {
  ArrowRight,
  ChevronRight,
  MessageCircle,
  PackageSearch,
  ScanFace,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react-native';
import {ScrollView as TamaguiScrollView, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getHomeData, getSavedRecommendedMakeupLooks} from '../services/homeService';
import type {
  HomeData,
  HomeFilterStoreItem,
  HomeMakeupLook,
  HomeTrendItem,
} from '../types';

type HomeScreenProps = {
  onPressConsulting?: () => void;
  onPressCommunity?: () => void;
  onPressFilterStore?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressProductRecommendations?: () => void;
  onPressSavedMakeups?: () => void;
};

export function HomeScreen({
  onPressConsulting,
  onPressCommunity,
  onPressFilterStore,
  onPressFaceDiagnosis,
  onPressProductRecommendations,
  onPressSavedMakeups,
}: HomeScreenProps) {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [savedMakeupLooks, setSavedMakeupLooks] = useState<HomeMakeupLook[]>([]);
  const {width} = useWindowDimensions();
  const heroCardWidth = Math.max(300, Math.min(width - spacing.lg * 2, width * 0.86));

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

  const loadSavedMakeupLooks = useCallback(() => {
    let isMounted = true;

    getSavedRecommendedMakeupLooks()
      .then((nextSavedMakeupLooks) => {
        if (isMounted) {
          setSavedMakeupLooks(nextSavedMakeupLooks);
        }
      })
      .catch((error) => {
        console.info('[aura:home] saved-makeup:fallback-empty', {
          message: error instanceof Error ? error.message : String(error),
        });

        if (isMounted) {
          setSavedMakeupLooks([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useFocusEffect(loadSavedMakeupLooks);

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
        trends={homeData.hero.trends}
      />

      <QuickActionSection
        onPressConsulting={onPressConsulting}
        onPressCommunity={onPressCommunity}
        onPressFaceDiagnosis={onPressFaceDiagnosis}
        onPressProductRecommendations={onPressProductRecommendations}
      />
      <FilterStoreSection
        items={homeData.filterStore}
        onPressFilterStore={onPressFilterStore}
      />
      <RecommendedLooksSection
        makeupLooks={savedMakeupLooks}
        onPressSavedMakeups={onPressSavedMakeups}
      />
    </>
  );
}

type HeroBannerCarouselProps = {
  cardWidth: number;
  fallbackImageSource: ImageSourcePropType;
  trends: HomeTrendItem[];
};

type HeroBannerCardProps = {
  cardWidth: number;
  imageSource: ImageSourcePropType;
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

export function getFilterStoreCategoryChipLabel<const TCategory extends string>(
  category: TCategory,
): TCategory {
  return category;
}

export const filterStoreCategoryChipContainerStyle = {
  alignSelf: 'flex-start',
  backgroundColor: colors.surfaceMuted,
  borderColor: colors.border,
  borderRadius: radius.pill,
  borderWidth: 1,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
} as const;

export const filterStoreCategoryChipTextStyle = {
  color: colors.textSecondary,
  fontFamily: typography.fontFamily.semibold,
  fontSize: typography.fontSize.xs,
  lineHeight: typography.lineHeight.xs,
} as const;

function HeroBannerCarousel({
  cardWidth,
  fallbackImageSource,
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
          imageSource={item.imageSource}
          key={`${item.id}-${index}`}
          title={item.title}
          tone={item.tone}
        />
      ))}
    </NativeScrollView>
  );
}

function HeroBannerCard({cardWidth, imageSource, title, tone}: HeroBannerCardProps) {
  const headline = getHeroTrendHeadline({title, tone});
  const [headlineLead, headlineTitle] = headline.split('\n');
  const accessibilityHeadline = headline.replace('\n', ' ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityHeadline} ${heroCtaLabel}`}
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
    id: 'diagnosis',
    label: '얼굴 진단',
    accessibilityLabel: '얼굴 진단 시작',
    icon: (color: string) => <ScanFace color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
  {
    id: 'recommendation',
    label: '추천 제품',
    accessibilityLabel: '추천 제품 보기',
    icon: (color: string) => (
      <PackageSearch color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
  {
    id: 'community',
    label: '커뮤니티',
    accessibilityLabel: '커뮤니티 보기',
    icon: (color: string) => (
      <MessageCircle color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
  {
    id: 'consulting',
    label: '컨설팅',
    accessibilityLabel: '메이크업 컨설팅 받기',
    icon: (color: string) => (
      <UserRoundCheck color={color} size={iconSize.lg} strokeWidth={1.9} />
    ),
  },
] as const;

type HomeQuickActionId = (typeof quickActions)[number]['id'];

type HomeQuickActionHandlers = {
  onPressConsulting?: () => void;
  onPressCommunity?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressProductRecommendations?: () => void;
};

export function getHomeQuickActionPressHandler(
  actionId: HomeQuickActionId,
  {
    onPressConsulting,
    onPressCommunity,
    onPressFaceDiagnosis,
    onPressProductRecommendations,
  }: HomeQuickActionHandlers,
): (() => void) | undefined {
  if (actionId === 'diagnosis') {
    return onPressFaceDiagnosis;
  }

  if (actionId === 'recommendation') {
    return onPressProductRecommendations;
  }

  if (actionId === 'community') {
    return onPressCommunity;
  }

  if (actionId === 'consulting') {
    return onPressConsulting;
  }

  return undefined;
}

function QuickActionSection({
  onPressConsulting,
  onPressCommunity,
  onPressFaceDiagnosis,
  onPressProductRecommendations,
}: HomeQuickActionHandlers) {
  const quickActionHandlers: HomeQuickActionHandlers = {
    onPressConsulting,
    onPressCommunity,
    onPressFaceDiagnosis,
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

function FilterStoreSection({
  items,
  onPressFilterStore,
}: {
  items: HomeFilterStoreItem[];
  onPressFilterStore?: () => void;
}) {
  return (
    <YStack style={styles.section}>
      <SectionHeader
        actionLabel="스토어 보기"
        onPressAction={onPressFilterStore}
        title="필터 스토어"
      />

      <TamaguiScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}>
        {items.map((item) => (
          <FilterStoreCard
            item={item}
            key={item.id}
            onPress={onPressFilterStore}
          />
        ))}
      </TamaguiScrollView>
    </YStack>
  );
}

function FilterStoreCard({
  item,
  onPress,
}: {
  item: HomeFilterStoreItem;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title} ${item.description} ${item.category}`}
      onPress={onPress}
      style={({pressed}) => [styles.filterCard, pressed && styles.pressed]}>
      <View style={styles.filterImageFrame}>
        <Image resizeMode="contain" source={item.imageSource} style={styles.filterImage} />
      </View>

      <Text numberOfLines={1} style={styles.filterTitle}>
        {item.title}
      </Text>
      <Text numberOfLines={2} style={styles.filterDescription}>
        {item.description}
      </Text>
      <XStack style={styles.filterCategoryChip}>
        <Text style={styles.filterCategoryChipText}>
          {getFilterStoreCategoryChipLabel(item.category)}
        </Text>
      </XStack>
    </Pressable>
  );
}

function RecommendedLooksSection({
  makeupLooks,
  onPressSavedMakeups,
}: {
  makeupLooks: HomeMakeupLook[];
  onPressSavedMakeups?: () => void;
}) {
  return (
    <YStack style={styles.section}>
      <SectionHeader
        actionLabel="전체 보기"
        onPressAction={onPressSavedMakeups}
        title="저장된 메이크업"
      />

      <TamaguiScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.makeupLookList}>
        {makeupLooks.length > 0 ? (
          makeupLooks.map((makeupLook) => (
            <RecommendedLookCard
              key={makeupLook.id}
              makeupLook={makeupLook}
              onPress={onPressSavedMakeups}
            />
          ))
        ) : (
          <EmptySavedMakeupCard onPress={onPressSavedMakeups} />
        )}
      </TamaguiScrollView>
    </YStack>
  );
}

function RecommendedLookCard({
  makeupLook,
  onPress,
}: {
  makeupLook: HomeMakeupLook;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${makeupLook.title} ${makeupLook.description}`}
      onPress={onPress}
      style={({pressed}) => [styles.makeupLookCard, pressed && styles.pressed]}>
      <View style={styles.makeupLookImageFrame}>
        <Image resizeMode="cover" source={makeupLook.imageSource} style={styles.makeupLookImage} />
      </View>

      <YStack style={styles.makeupLookTextGroup}>
        <Text numberOfLines={1} style={styles.makeupLookTitle}>
          {makeupLook.title}
        </Text>
        <Text numberOfLines={2} style={styles.makeupLookDescription}>
          {makeupLook.description}
        </Text>
        <Text numberOfLines={1} style={styles.makeupLookDate}>
          {makeupLook.date}
        </Text>
      </YStack>
    </Pressable>
  );
}

function EmptySavedMakeupCard({onPress}: {onPress?: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="저장된 추천 메이크업 없음"
      onPress={onPress}
      style={({pressed}) => [styles.emptySavedMakeupCard, pressed && styles.pressed]}>
      <View style={styles.emptySavedMakeupIcon}>
        <Sparkles color={colors.textSecondary} size={iconSize.md} strokeWidth={1.8} />
      </View>
      <YStack style={styles.makeupLookTextGroup}>
        <Text style={styles.makeupLookTitle}>아직 저장된 추천이 없어요</Text>
        <Text style={styles.makeupLookDescription}>
          얼굴 진단을 완료하면 추천 메이크업 3장이 여기에 쌓여요.
        </Text>
      </YStack>
    </Pressable>
  );
}

type SectionHeaderProps = {
  actionLabel: string;
  onPressAction?: () => void;
  title: string;
};

function SectionHeader({actionLabel, onPressAction, title}: SectionHeaderProps) {
  return (
    <XStack style={styles.sectionHeader}>
      <YStack style={styles.sectionTitleGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </YStack>

      <Pressable
        accessibilityRole="button"
        onPress={onPressAction}
        style={({pressed}) => [styles.sectionAction, pressed && styles.pressed]}>
        <Text style={styles.sectionActionText}>{actionLabel}</Text>
        <ChevronRight color={colors.textSecondary} size={iconSize.xs} strokeWidth={1.8} />
      </Pressable>
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
  filterCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: shadows.soft.shadowRadius,
    width: 156,
  },
  filterCategoryChip: {
    ...filterStoreCategoryChipContainerStyle,
  },
  filterCategoryChipText: {
    ...filterStoreCategoryChipTextStyle,
  },
  filterDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  filterImage: {
    height: '100%',
    width: '100%',
  },
  filterImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 92,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: spacing.sm,
  },
  filterList: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  filterTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
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
  makeupLookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
    width: 138,
  },
  emptySavedMakeupCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 238,
    padding: spacing.md,
    width: 220,
  },
  emptySavedMakeupIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 150,
    justifyContent: 'center',
  },
  makeupLookDate: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  makeupLookDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  makeupLookImage: {
    height: '100%',
    width: '100%',
  },
  makeupLookImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 150,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  makeupLookList: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  makeupLookTextGroup: {
    gap: 2,
  },
  makeupLookTitle: {
    color: colors.textPrimary,
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
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
  },
  sectionActionText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
