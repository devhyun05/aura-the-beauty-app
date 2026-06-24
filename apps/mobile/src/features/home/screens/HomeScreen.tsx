import {useEffect, useState} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowRight,
  Camera,
  ChevronRight,
  PackageSearch,
  Palette,
  ScanFace,
  WandSparkles,
} from 'lucide-react-native';
import {ScrollView, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getHomeData} from '../services/homeService';
import type {
  HomeData,
  HomeFilterStoreItem,
  HomeMakeupLook,
  HomeTrendItem,
} from '../types';

type HomeScreenProps = {
  onPressARFilter?: () => void;
  onPressCreateFilter?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressProductRecommendations?: () => void;
};

export function HomeScreen({
  onPressARFilter,
  onPressCreateFilter,
  onPressFaceDiagnosis,
  onPressProductRecommendations,
}: HomeScreenProps) {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
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

  if (!homeData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>홈을 불러오는 중이에요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.content}>
      <HeroBannerCarousel
        cardWidth={heroCardWidth}
        fallbackImageSource={homeData.hero.imageSource}
        trends={homeData.hero.trends}
      />

      <QuickActionSection
        onPressARFilter={onPressARFilter}
        onPressCreateFilter={onPressCreateFilter}
        onPressFaceDiagnosis={onPressFaceDiagnosis}
        onPressProductRecommendations={onPressProductRecommendations}
      />
      <FilterStoreSection items={homeData.filterStore} />
      <RecommendedLooksSection looks={homeData.recommendedLooks} />
    </ScrollView>
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

function HeroBannerCarousel({
  cardWidth,
  fallbackImageSource,
  trends,
}: HeroBannerCarouselProps) {
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

  return (
    <ScrollView
      horizontal
      decelerationRate="fast"
      snapToAlignment="start"
      snapToInterval={cardWidth + spacing.md}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.heroCarousel}>
      {heroItems.map(item => (
        <HeroBannerCard
          cardWidth={cardWidth}
          imageSource={item.imageSource}
          key={item.id}
          title={item.title}
          tone={item.tone}
        />
      ))}
    </ScrollView>
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
  onPressCreateFilter?: () => void;
  onPressFaceDiagnosis?: () => void;
  onPressProductRecommendations?: () => void;
};

export function getHomeQuickActionPressHandler(
  actionId: HomeQuickActionId,
  {
    onPressARFilter,
    onPressCreateFilter,
    onPressFaceDiagnosis,
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
    return onPressCreateFilter;
  }

  if (actionId === 'recommendation') {
    return onPressProductRecommendations;
  }

  return undefined;
}

function QuickActionSection({
  onPressARFilter,
  onPressCreateFilter,
  onPressFaceDiagnosis,
  onPressProductRecommendations,
}: HomeQuickActionHandlers) {
  const quickActionHandlers: HomeQuickActionHandlers = {
    onPressARFilter,
    onPressCreateFilter,
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
          <Text numberOfLines={1} style={styles.quickActionLabel}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </XStack>
  );
}

function FilterStoreSection({items}: {items: HomeFilterStoreItem[]}) {
  return (
    <YStack style={styles.section}>
      <SectionHeader
        actionLabel="스토어 보기"
        title="필터 스토어"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}>
        {items.map((item) => (
          <FilterStoreCard item={item} key={item.id} />
        ))}
      </ScrollView>
    </YStack>
  );
}

function FilterStoreCard({item}: {item: HomeFilterStoreItem}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title} ${item.description}`}
      style={({pressed}) => [styles.filterCard, pressed && styles.pressed]}>
      <XStack style={styles.filterHeader}>
        <Text style={styles.filterCategory}>{item.category}</Text>
        <Palette color={colors.textSecondary} size={iconSize.xs} strokeWidth={1.8} />
      </XStack>

      <View style={styles.filterImageFrame}>
        <Image resizeMode="contain" source={item.imageSource} style={styles.filterImage} />
      </View>

      <Text numberOfLines={1} style={styles.filterTitle}>
        {item.title}
      </Text>
      <Text numberOfLines={2} style={styles.filterDescription}>
        {item.description}
      </Text>
    </Pressable>
  );
}

function RecommendedLooksSection({looks}: {looks: HomeMakeupLook[]}) {
  return (
    <YStack style={styles.section}>
      <SectionHeader
        actionLabel="전체 보기"
        title="추천 메이크업 리스트"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lookList}>
        {looks.map((look) => (
          <RecommendedLookCard key={look.id} look={look} />
        ))}
      </ScrollView>
    </YStack>
  );
}

function RecommendedLookCard({look}: {look: HomeMakeupLook}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${look.title} ${look.description}`}
      style={({pressed}) => [styles.lookCard, pressed && styles.pressed]}>
      <View style={styles.lookImageFrame}>
        <Image resizeMode="cover" source={look.imageSource} style={styles.lookImage} />
      </View>

      <YStack style={styles.lookTextGroup}>
        <Text numberOfLines={1} style={styles.lookTitle}>
          {look.title}
        </Text>
        <Text numberOfLines={2} style={styles.lookDescription}>
          {look.description}
        </Text>
      </YStack>
    </Pressable>
  );
}

type SectionHeaderProps = {
  actionLabel: string;
  title: string;
};

function SectionHeader({actionLabel, title}: SectionHeaderProps) {
  return (
    <XStack style={styles.sectionHeader}>
      <YStack style={styles.sectionTitleGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </YStack>

      <Pressable accessibilityRole="button" style={styles.sectionAction}>
        <Text style={styles.sectionActionText}>{actionLabel}</Text>
        <ChevronRight color={colors.textSecondary} size={iconSize.xs} strokeWidth={1.8} />
      </Pressable>
    </XStack>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
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
  filterCategory: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  filterDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  filterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  lookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
    width: 138,
  },
  lookDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lookImage: {
    height: '100%',
    width: '100%',
  },
  lookImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 150,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lookList: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  lookTextGroup: {
    gap: 2,
  },
  lookTitle: {
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
    height: 72,
    justifyContent: 'center',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: 72,
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
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  quickActionList: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
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
