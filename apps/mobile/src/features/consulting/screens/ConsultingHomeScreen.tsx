import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {
  ArrowRight,
  Brush,
  ChevronRight,
  Crown,
  History,
  Palette,
  Scissors,
  Sparkles,
  Video,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingSectionTitle,
  ExpertAvatar,
  ExpertListCard,
} from '../components/consultingComponents';
import {
  consultingCategories,
  consultingExperts,
  findConsultingExpertOrFirst,
  getUpcomingConsultingRecord,
} from '../mocks/consulting.mock';
import type {ConsultingCategory, ConsultingCategoryId} from '../types';

type ConsultingHomeScreenProps = {
  onPressStartWithReport: () => void;
  onPressCategory: (categoryId: ConsultingCategoryId) => void;
  onPressExpert: (expertId: string) => void;
  onPressExpertList: () => void;
  onPressMembership: () => void;
  onPressHistory: () => void;
  onPressEnterUpcoming: (recordId: string) => void;
};

const categoryIcons = {
  palette: Palette,
  brush: Brush,
  sparkles: Sparkles,
  scissors: Scissors,
} as const;

export function ConsultingHomeScreen({
  onPressStartWithReport,
  onPressCategory,
  onPressExpert,
  onPressExpertList,
  onPressMembership,
  onPressHistory,
  onPressEnterUpcoming,
}: ConsultingHomeScreenProps) {
  const upcomingRecord = getUpcomingConsultingRecord();
  const upcomingExpert = upcomingRecord
    ? findConsultingExpertOrFirst(upcomingRecord.expertId)
    : null;

  return (
    <ConsultingScreenScaffold bottomPadding="floatingFooter" contentGap={spacing.xxl}>
      {upcomingRecord && upcomingExpert ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="예정된 상담 입장하기"
          onPress={() => onPressEnterUpcoming(upcomingRecord.id)}
          style={({pressed}) => [
            styles.upcomingCard,
            pressed ? styles.pressed : null,
          ]}>
          <ExpertAvatar expert={upcomingExpert} size={40} />
          <RNView style={styles.upcomingBody}>
            <Text style={styles.upcomingLabel}>다가오는 상담</Text>
            <Text numberOfLines={1} style={styles.upcomingTitle}>
              {upcomingExpert.name} · {upcomingRecord.dateLabel}
            </Text>
          </RNView>
          <RNView style={styles.upcomingCta}>
            <Video color={consultingColors.onAccent} size={14} />
            <Text style={styles.upcomingCtaText}>입장</Text>
          </RNView>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 리포트로 상담 시작하기"
        onPress={onPressStartWithReport}
        style={({pressed}) => [styles.hero, pressed ? styles.pressed : null]}>
        <Text style={styles.heroLabel}>1:1 화상 컨설팅</Text>
        <Text style={styles.heroTitle}>전문가에게 직접 물어보세요</Text>
        <Text style={styles.heroSubtitle}>
          내 AI 분석 결과를 함께 보며, 실제 전문가와 화상으로 상담해요.
        </Text>
        <RNView style={styles.heroCta}>
          <Text style={styles.heroCtaText}>내 리포트로 상담 시작하기</Text>
          <ArrowRight color={consultingColors.onAccent} size={16} />
        </RNView>
      </Pressable>

      <View style={styles.categoryGrid}>
        {consultingCategories.map(category => (
          <CategoryCard
            category={category}
            key={category.id}
            onPress={() => onPressCategory(category.id)}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AURA 멤버십 보기"
        onPress={onPressMembership}
        style={({pressed}) => [
          styles.membershipBanner,
          pressed ? styles.pressed : null,
        ]}>
        <RNView style={styles.membershipIcon}>
          <Crown color={consultingColors.goldText} size={18} />
        </RNView>
        <RNView style={styles.membershipBody}>
          <Text style={styles.membershipTitle}>AURA 멤버십</Text>
          <Text numberOfLines={1} style={styles.membershipSubtitle}>
            월 9,900원부터, 모든 상담 상시 할인
          </Text>
        </RNView>
        <ChevronRight color={consultingColors.goldText} size={16} />
      </Pressable>

      <View style={styles.expertSection}>
        <View style={styles.sectionHeader}>
          <ConsultingSectionTitle>인기 전문가</ConsultingSectionTitle>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="전문가 전체 보기"
            hitSlop={8}
            onPress={onPressExpertList}
            style={({pressed}) => [
              styles.moreRow,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.moreText}>더보기</Text>
            <ChevronRight color={consultingColors.textSoft} size={14} />
          </Pressable>
        </View>
        <View style={styles.expertList}>
          {consultingExperts.map(expert => (
            <ExpertListCard
              expert={expert}
              key={expert.id}
              onPress={() => onPressExpert(expert.id)}
            />
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 상담 내역 보기"
        onPress={onPressHistory}
        style={({pressed}) => [
          styles.historyRow,
          pressed ? styles.pressed : null,
        ]}>
        <History color={consultingColors.textMuted} size={18} />
        <Text style={styles.historyText}>내 상담 내역</Text>
        <ChevronRight color={consultingColors.textSoft} size={16} />
      </Pressable>
    </ConsultingScreenScaffold>
  );
}

function CategoryCard({
  category,
  onPress,
}: {
  category: ConsultingCategory;
  onPress: () => void;
}) {
  const Icon = categoryIcons[category.icon];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={category.title}
      onPress={onPress}
      style={({pressed}) => [
        styles.categoryCard,
        pressed ? styles.pressed : null,
      ]}>
      <RNView style={styles.categoryIcon}>
        <Icon color={consultingColors.roseStrong} size={20} />
      </RNView>
      <Text numberOfLines={1} style={styles.categoryTitle}>
        {category.title}
      </Text>
      <Text numberOfLines={1} style={styles.categoryDescription}>
        {category.description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  categoryCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: 4,
    padding: 14,
    width: '48%',
  },
  categoryDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 40,
    justifyContent: 'center',
    marginBottom: 6,
    width: 40,
  },
  categoryTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  expertList: {
    gap: spacing.md,
  },
  expertSection: {
    gap: spacing.lg,
  },
  hero: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.sheet,
    padding: 22,
  },
  heroCta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  heroCtaText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  heroLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0.4,
  },
  heroSubtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: 8,
  },
  heroTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: 21,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 28,
    marginTop: 6,
  },
  historyRow: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  historyText: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  membershipBanner: {
    alignItems: 'center',
    backgroundColor: consultingColors.goldSoft,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  membershipBody: {
    flex: 1,
  },
  membershipIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderRadius: consultingRadius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  membershipSubtitle: {
    color: consultingColors.goldText,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  membershipTitle: {
    color: consultingColors.goldText,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  moreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 44,
  },
  moreText: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  pressed: {
    opacity: 0.85,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  upcomingBody: {
    flex: 1,
  },
  upcomingCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.border,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 14,
  },
  upcomingCta: {
    alignItems: 'center',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  upcomingCtaText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  upcomingLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  upcomingTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
});
