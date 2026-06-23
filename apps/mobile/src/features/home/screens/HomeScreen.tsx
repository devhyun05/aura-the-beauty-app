import {type ReactNode, useEffect, useState} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
} from 'react-native';
import {
  Bell,
  ChevronRight,
  ImagePlus,
  Palette,
  ShoppingBag,
  Sparkles,
} from 'lucide-react-native';
import {ScrollView, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getHomeData} from '../services/homeService';
import type {
  HomeData,
  HomeFilterStoreItem,
  HomeMakeupLook,
  HomeNotice,
  HomeTrendItem,
} from '../types';

type HomeScreenProps = {
  onPressCreateFilter?: () => void;
};

export function HomeScreen({onPressCreateFilter}: HomeScreenProps) {
  const [homeData, setHomeData] = useState<HomeData | null>(null);

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
      <HeroBanner
        description={homeData.hero.description}
        eyebrow={homeData.hero.eyebrow}
        imageSource={homeData.hero.imageSource}
        notices={homeData.hero.notices}
        title={homeData.hero.title}
        trends={homeData.hero.trends}
      />

      <CreateFilterShortcut onPress={onPressCreateFilter} />
      <FilterStoreSection items={homeData.filterStore} />
      <RecommendedLooksSection looks={homeData.recommendedLooks} />
    </ScrollView>
  );
}

type HeroBannerProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageSource: ImageSourcePropType;
  notices: HomeNotice[];
  trends: HomeTrendItem[];
};

function HeroBanner({
  description,
  eyebrow,
  imageSource,
  notices,
  title,
  trends,
}: HeroBannerProps) {
  const primaryNotice = notices[0];

  return (
    <YStack style={styles.heroCard}>
      <XStack style={styles.heroTop}>
        <YStack style={styles.heroCopy}>
          <XStack style={styles.eyebrowPill}>
            <Sparkles color={colors.textPrimary} size={iconSize.xs} strokeWidth={1.8} />
            <Text style={styles.eyebrowText}>{eyebrow}</Text>
          </XStack>

          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroDescription}>{description}</Text>
        </YStack>

        <View style={styles.heroImageFrame}>
          <Image resizeMode="cover" source={imageSource} style={styles.heroImage} />
        </View>
      </XStack>

      {primaryNotice ? <NoticeStrip notice={primaryNotice} /> : null}

      <XStack style={styles.trendList}>
        {trends.map((trend) => (
          <TrendPreviewCard key={trend.id} trend={trend} />
        ))}
      </XStack>
    </YStack>
  );
}

function NoticeStrip({notice}: {notice: HomeNotice}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notice.title} ${notice.description}`}
      style={({pressed}) => [styles.noticeStrip, pressed && styles.pressed]}>
      <XStack style={styles.noticeIconBox}>
        <Bell color={colors.white} size={iconSize.xs} strokeWidth={2} />
      </XStack>

      <YStack style={styles.noticeTextGroup}>
        <Text style={styles.noticeTitle}>{notice.title}</Text>
        <Text numberOfLines={1} style={styles.noticeDescription}>
          {notice.description}
        </Text>
      </YStack>

      <ChevronRight color={colors.textSecondary} size={iconSize.sm} strokeWidth={1.8} />
    </Pressable>
  );
}

function CreateFilterShortcut({onPress}: {onPress?: () => void}) {
  return (
    <Pressable
      accessibilityLabel="이미지로 메이크업 필터 만들기"
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.createFilterCard, pressed && styles.pressed]}>
      <View style={styles.createFilterIcon}>
        <ImagePlus color={colors.white} size={iconSize.md} strokeWidth={2} />
      </View>

      <YStack style={styles.createFilterCopy}>
        <XStack style={styles.createFilterEyebrowRow}>
          <Sparkles color={colors.textSecondary} size={iconSize.xs} strokeWidth={1.8} />
          <Text style={styles.createFilterEyebrow}>CREATE FILTER</Text>
        </XStack>
        <Text style={styles.createFilterTitle}>사진에서 메이크업 룩 추출하기</Text>
        <Text style={styles.createFilterDescription}>
          인플루언서나 유행하는 화장 사진을 업로드하고 내 얼굴용 AR 필터로 바꿔보세요.
        </Text>
      </YStack>

      <ChevronRight color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
    </Pressable>
  );
}

function TrendPreviewCard({trend}: {trend: HomeTrendItem}) {
  return (
    <View style={styles.trendCard}>
      <Image resizeMode="cover" source={trend.imageSource} style={styles.trendImage} />
      <Text numberOfLines={1} style={styles.trendTitle}>
        {trend.title}
      </Text>
      <Text numberOfLines={1} style={styles.trendTone}>
        {trend.tone}
      </Text>
    </View>
  );
}

function FilterStoreSection({items}: {items: HomeFilterStoreItem[]}) {
  return (
    <YStack style={styles.section}>
      <SectionHeader
        actionLabel="스토어 보기"
        eyebrow="FILTER STORE"
        icon={<ShoppingBag color={colors.textPrimary} size={iconSize.sm} strokeWidth={1.8} />}
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
        eyebrow="RECOMMENDED LOOKS"
        icon={<Sparkles color={colors.textPrimary} size={iconSize.sm} strokeWidth={1.8} />}
        title="추천 메이크업룩"
      />

      <XStack style={styles.lookList}>
        {looks.map((look) => (
          <RecommendedLookCard key={look.id} look={look} />
        ))}
      </XStack>
    </YStack>
  );
}

function RecommendedLookCard({look}: {look: HomeMakeupLook}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${look.title} ${look.description}`}
      style={({pressed}) => [styles.lookCard, pressed && styles.pressed]}>
      <Image resizeMode="cover" source={look.imageSource} style={styles.lookImage} />

      <YStack style={styles.lookTextGroup}>
        <Text numberOfLines={1} style={styles.lookTitle}>
          {look.title}
        </Text>
        <Text numberOfLines={2} style={styles.lookDescription}>
          {look.description}
        </Text>
        <Text style={styles.lookDate}>{look.date}</Text>
      </YStack>
    </Pressable>
  );
}

type SectionHeaderProps = {
  actionLabel: string;
  eyebrow: string;
  icon: ReactNode;
  title: string;
};

function SectionHeader({actionLabel, eyebrow, icon, title}: SectionHeaderProps) {
  return (
    <XStack style={styles.sectionHeader}>
      <YStack style={styles.sectionTitleGroup}>
        <XStack style={styles.sectionEyebrowRow}>
          {icon}
          <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        </XStack>
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
  createFilterCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.textPrimary,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: shadows.soft.shadowRadius,
  },
  createFilterCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  createFilterDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  createFilterEyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0.8,
    lineHeight: typography.lineHeight.xs,
  },
  createFilterEyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  createFilterIcon: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  createFilterTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  eyebrowPill: {
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
  eyebrowText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
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
  heroCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minWidth: 0,
  },
  heroDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  heroImageFrame: {
    borderColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    height: 154,
    overflow: 'hidden',
    width: 120,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
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
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  lookDate: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lookDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lookImage: {
    aspectRatio: 0.88,
    width: '100%',
  },
  lookList: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  lookTextGroup: {
    gap: 2,
    padding: spacing.sm,
  },
  lookTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  noticeDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  noticeIconBox: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  noticeStrip: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeTextGroup: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  noticeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.78,
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
  sectionEyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0.8,
    lineHeight: typography.lineHeight.xs,
  },
  sectionEyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
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
  trendCard: {
    flex: 1,
    minWidth: 0,
  },
  trendImage: {
    borderRadius: radius.md,
    height: 82,
    width: '100%',
  },
  trendList: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  trendTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: spacing.xs,
  },
  trendTone: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
