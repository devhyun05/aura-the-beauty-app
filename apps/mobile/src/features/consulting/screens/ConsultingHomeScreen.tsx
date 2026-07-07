import {useEffect, useState} from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  View as RNView,
} from 'react-native';
import {
  ArrowRight,
  Brush,
  ChevronRight,
  Crown,
  History,
  MessageCircle,
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
} from '../mocks/consulting.mock';
import {
  type ConsultingHomeData,
  getConsultingHome,
} from '../services/consultingService';
import type {ConsultingCategory, ConsultingRecord} from '../types';

const consultingCdnBaseUrl = (
  process.env.EXPO_PUBLIC_CDN_BASE_URL?.trim().replace(/\/+$/, '') ??
  'https://d3t1pbvtir1lj.cloudfront.net'
);
const consultingHeroImage = {
  uri: `${consultingCdnBaseUrl}/uploads/optimized/consulting/consulting-hero-session.jpg`,
};

type ConsultingHomeScreenProps = {
  onPressStartWithReport: () => void;
  onPressExpert: (expertId: string) => void;
  onPressExpertList: () => void;
  onPressMembership: () => void;
  onPressHistory: () => void;
  onPressUpcoming: (record: ConsultingRecord) => void;
};

const categoryIcons = {
  palette: Palette,
  brush: Brush,
  sparkles: Sparkles,
  scissors: Scissors,
} as const;

const categoryDetails: Record<
  ConsultingCategory['id'],
  {accent: string; index: string; scope: string; footer: string}
> = {
  personalColor: {
    accent: '#9C6660',
    index: '01',
    scope: '톤 진단',
    footer: 'AI 리포트와 전문가 판정을 함께 확인',
  },
  makeupClinic: {
    accent: '#6F625C',
    index: '02',
    scope: '메이크업 교정',
    footer: '지금 화장에서 바꿀 우선순위를 정리',
  },
  lipColor: {
    accent: '#8B5E72',
    index: '03',
    scope: '패션 진단',
    footer: '골격과 얼굴형에 맞는 옷 실루엣 제안',
  },
  hairStyle: {
    accent: '#6D755C',
    index: '04',
    scope: '이미지 설계',
    footer: '얼굴형과 톤에 맞춘 헤어 방향 정리',
  },
};

export function ConsultingHomeScreen({
  onPressStartWithReport,
  onPressExpert,
  onPressExpertList,
  onPressMembership,
  onPressHistory,
  onPressUpcoming,
}: ConsultingHomeScreenProps) {
  const [home, setHome] = useState<ConsultingHomeData>(() => ({
    categories: consultingCategories,
    experts: consultingExperts,
    upcomingRecord: null,
  }));

  useEffect(() => {
    let isMounted = true;

    getConsultingHome().then(data => {
      if (isMounted) {
        setHome(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const {categories, experts} = home;
  const upcomingRecord = home.upcomingRecord;
  const upcomingExpert = upcomingRecord
    ? experts.find(expert => expert.id === upcomingRecord.expertId) ??
      findConsultingExpertOrFirst(upcomingRecord.expertId)
    : null;

  return (
    <ConsultingScreenScaffold bottomPadding="floatingFooter" contentGap={spacing.xxl}>
      {upcomingRecord && upcomingExpert ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${upcomingExpert.name} 다가오는 상담 대화 열기`}
          onPress={() => onPressUpcoming(upcomingRecord)}
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
            <MessageCircle color={consultingColors.roseStrong} size={14} />
            <Text style={styles.upcomingCtaText}>대화 보기</Text>
          </RNView>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 리포트로 상담 시작하기"
        onPress={onPressStartWithReport}
        style={({pressed}) => [styles.hero, pressed ? styles.pressed : null]}>
        <ImageBackground
          imageStyle={styles.heroImage}
          resizeMode="cover"
          source={consultingHeroImage}
          style={styles.heroImageFrame}>
          <RNView style={styles.heroScrim}>
            <RNView style={styles.heroLabelPill}>
              <Video color={consultingColors.onAccent} size={13} />
              <Text style={styles.heroLabel}>1:1 화상 컨설팅</Text>
            </RNView>
            <Text style={styles.heroTitle}>전문가에게 직접 물어보세요</Text>
            <Text style={styles.heroSubtitle}>
              내 AI 분석 결과를 함께 보며, 실제 전문가와 화상으로 상담해요.
            </Text>
            <RNView style={styles.heroCta}>
              <Text style={styles.heroCtaText}>내 리포트로 상담 시작하기</Text>
              <ArrowRight color={consultingColors.onAccent} size={16} />
            </RNView>
          </RNView>
        </ImageBackground>
      </Pressable>

      <View style={styles.categorySection}>
        <Text style={styles.categorySectionTitle}>상담에서 다루는 것</Text>
        <View style={styles.categoryGrid}>
          {categories.map(category => (
            <CategoryCard category={category} key={category.id} />
          ))}
        </View>
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
          {experts.map(expert => (
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
}: {
  category: ConsultingCategory;
}) {
  const Icon = categoryIcons[category.icon];
  const detail = categoryDetails[category.id];
  return (
    <View style={[styles.categoryCard, {borderTopColor: detail.accent}]}>
      <RNView style={styles.categoryTopRow}>
        <RNView
          style={[
            styles.categoryIndexPill,
            {backgroundColor: detail.accent},
          ]}>
          <Text style={styles.categoryIndexText}>{detail.index}</Text>
        </RNView>
        <RNView style={styles.categoryIcon}>
          <Icon color={detail.accent} size={18} />
        </RNView>
      </RNView>
      <Text style={[styles.categoryEyebrow, {color: detail.accent}]}>
        {detail.scope}
      </Text>
      <Text numberOfLines={2} style={styles.categoryTitle}>
        {category.title}
      </Text>
      <Text numberOfLines={2} style={styles.categoryDescription}>
        {category.description}
      </Text>
      <Text numberOfLines={2} style={styles.categoryFooter}>
        {detail.footer}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  categoryCard: {
    backgroundColor: consultingColors.surfaceSoft,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    borderTopWidth: 3,
    gap: 8,
    minHeight: 160,
    padding: 16,
    width: '48%',
  },
  categoryDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  categoryEyebrow: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 2,
  },
  categoryFooter: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 15,
    marginTop: 'auto',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderWidth: 1,
    borderRadius: consultingRadius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  categorySection: {
    gap: spacing.md,
  },
  categorySectionTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  categoryIndexPill: {
    alignItems: 'center',
    backgroundColor: consultingColors.text,
    borderRadius: consultingRadius.pill,
    height: 28,
    justifyContent: 'center',
    width: 38,
  },
  categoryIndexText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  categoryTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  categoryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expertList: {
    gap: spacing.md,
  },
  expertSection: {
    gap: spacing.lg,
  },
  hero: {
    backgroundColor: consultingColors.text,
    borderRadius: consultingRadius.sheet,
    minHeight: 228,
    overflow: 'hidden',
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
  heroImage: {
    borderRadius: consultingRadius.sheet,
  },
  heroImageFrame: {
    flex: 1,
    minHeight: 228,
  },
  heroLabel: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
  },
  heroLabelPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 11,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: 8,
    maxWidth: 230,
  },
  heroScrim: {
    backgroundColor: 'rgba(12, 10, 9, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 22,
  },
  heroTitle: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.bold,
    fontSize: 21,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 28,
    marginTop: 10,
    maxWidth: 240,
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
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  upcomingCtaText: {
    color: consultingColors.roseStrong,
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
