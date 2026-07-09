import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ImageBackground,
  type ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View as RNView,
} from 'react-native';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronRight,
  History,
  MapPin,
  MessageCircle,
  Store,
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
  ConsultingStatusBadge,
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
import type {
  ConsultingCategory,
  ConsultingCategoryId,
  ConsultingRecord,
} from '../types';

const consultingCdnBaseUrl = (
  process.env.EXPO_PUBLIC_CDN_BASE_URL?.trim().replace(/\/+$/, '') ??
  'https://d3t1pbvtir1lj.cloudfront.net'
);

function consultingHeroImageSource(fileName: string): ImageSourcePropType {
  return {
    uri: `${consultingCdnBaseUrl}/uploads/optimized/consulting/${fileName}`,
  };
}

const consultingHeroOnlineImage = consultingHeroImageSource(
  'consulting-hero-online.jpg',
);
const consultingHeroColorImage = consultingHeroImageSource(
  'consulting-hero-color.jpg',
);
const consultingHeroMakeupImage = consultingHeroImageSource(
  'consulting-hero-makeup.jpg',
);
const consultingHeroFashionImage = consultingHeroImageSource(
  'consulting-hero-fashion.jpg',
);
const consultingHeroHairImage = consultingHeroImageSource(
  'consulting-hero-hair.jpg',
);

const HERO_BANNER_GAP = spacing.md;

type ConsultingHomeScreenProps = {
  onPressHeroSlide: (categoryId: ConsultingCategoryId | null) => void;
  onPressExpert: (expertId: string) => void;
  onPressExpertList: () => void;
  onPressLocalPlaces: () => void;
  onPressHistory: () => void;
  onPressMessages: () => void;
  onPressNotifications: () => void;
  onPressUpcoming: (record: ConsultingRecord) => void;
};

const categoryDetails: Record<
  ConsultingCategory['id'],
  {
    accent: string;
    imageSource: ImageSourcePropType;
    scope: string;
    subtitle: string;
    title: string;
  }
> = {
  personalColor: {
    accent: '#9C6660',
    imageSource: consultingHeroColorImage,
    scope: '톤 진단',
    title: '내 톤 확정하기',
    subtitle: '퍼스널컬러 전문가에게 바로 상담해요.',
  },
  makeupClinic: {
    accent: '#6F625C',
    imageSource: consultingHeroMakeupImage,
    scope: '메이크업 교정',
    title: '메이크업 진단 받기',
    subtitle: '바꿀 포인트만 짧고 정확하게 정리해요.',
  },
  lipColor: {
    accent: '#26344C',
    imageSource: consultingHeroFashionImage,
    scope: '패션 진단',
    title: '패션·골격 상담',
    subtitle: '나한테 맞는 실루엣을 찾아요.',
  },
  hairStyle: {
    accent: '#6D755C',
    imageSource: consultingHeroHairImage,
    scope: '이미지 설계',
    title: '헤어 방향 상담',
    subtitle: '얼굴형과 톤에 맞는 스타일을 골라요.',
  },
};

type HeroSlide = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  accent: string;
  categoryId: ConsultingCategoryId | null;
  imageSource: ImageSourcePropType;
  showVideoIcon?: boolean;
};

export function ConsultingHomeScreen({
  onPressHeroSlide,
  onPressExpert,
  onPressExpertList,
  onPressLocalPlaces,
  onPressHistory,
  onPressMessages,
  onPressNotifications,
  onPressUpcoming,
}: ConsultingHomeScreenProps) {
  const {width} = useWindowDimensions();
  const heroScrollRef = useRef<ScrollView>(null);
  const [home, setHome] = useState<ConsultingHomeData>(() => ({
    categories: consultingCategories,
    experts: consultingExperts,
    activeRecord: null,
    activeRecords: [],
  }));
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);

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
  const heroBannerWidth = useMemo(
    () => Math.max(300, Math.min(width - 64, 342)),
    [width],
  );
  const heroSlides = useMemo<readonly HeroSlide[]>(
    () => [
      {
        id: 'online',
        label: '1:1 온라인 상담',
        title: '리포트 보내고 상담 신청',
        subtitle: '운영팀이 일정 확인 후 안내해요.',
        ctaLabel: '프리랜서 보기',
        accent: '#7C6FA8',
        categoryId: null,
        imageSource: consultingHeroOnlineImage,
        showVideoIcon: true,
      },
      ...categories.map(category => {
        const detail = categoryDetails[category.id];
        return {
          id: category.id,
          label: detail.scope,
          title: detail.title,
          subtitle: detail.subtitle,
          ctaLabel: '전문가 보기',
          accent: detail.accent,
          categoryId: category.id,
          imageSource: detail.imageSource,
        };
      }),
    ],
    [categories],
  );
  const loopingHeroSlides = useMemo<readonly HeroSlide[]>(() => {
    const firstSlide = heroSlides[0];
    if (heroSlides.length <= 1 || !firstSlide) {
      return heroSlides;
    }

    return [
      ...heroSlides,
      {
        ...firstSlide,
        id: `${firstSlide.id}-loop`,
      },
    ];
  }, [heroSlides]);
  const activeRecords = home.activeRecords;

  const handleHeroScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / (heroBannerWidth + HERO_BANNER_GAP),
    );
    if (heroSlides.length > 1 && nextIndex >= heroSlides.length) {
      setActiveHeroIndex(0);
      requestAnimationFrame(() => {
        heroScrollRef.current?.scrollTo({animated: false, x: 0});
      });
      return;
    }

    setActiveHeroIndex(Math.max(0, Math.min(nextIndex, heroSlides.length - 1)));
  };

  const handleHeroScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (heroSlides.length <= 1) {
      return;
    }

    const rawIndex = Math.round(
      event.nativeEvent.contentOffset.x / (heroBannerWidth + HERO_BANNER_GAP),
    );
    const nextIndex = ((rawIndex % heroSlides.length) + heroSlides.length) % heroSlides.length;
    setActiveHeroIndex(nextIndex);
  };

  return (
    <ConsultingScreenScaffold bottomPadding="floatingFooter" contentGap={spacing.xxl}>
      <View style={styles.quickAccessSection}>
        <RNView style={styles.quickAccessHeader}>
          <RNView>
            <Text style={styles.quickAccessTitle}>상담 허브</Text>
            <Text style={styles.quickAccessSubtitle}>
              알림, 톡, 예약내역을 바로 확인해요
            </Text>
          </RNView>
          <RNView style={styles.quickActions}>
            <QuickActionButton
              icon="bell"
              label="알림"
              onPress={onPressNotifications}
              showDot={activeRecords.length > 0}
            />
            <QuickActionButton
              icon="message"
              label="톡"
              onPress={onPressMessages}
              showDot={activeRecords.length > 0}
            />
            <QuickActionButton
              icon="calendar"
              label="내역"
              onPress={onPressHistory}
            />
          </RNView>
        </RNView>
      </View>

      {activeRecords.length > 0 ? (
        <View style={styles.activeRequestSection}>
          <RNView style={styles.sectionHeader}>
            <ConsultingSectionTitle>상담 신청 상태</ConsultingSectionTitle>
            <Text style={styles.activeRequestSortLabel}>최신순</Text>
          </RNView>
          <ScrollView
            contentContainerStyle={styles.activeRequestList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {activeRecords.map(record => {
              const expert =
                experts.find(item => item.id === record.expertId) ??
                findConsultingExpertOrFirst(record.expertId);
              return (
                <ActiveRequestCard
                  expert={expert}
                  key={record.id}
                  onPress={() => onPressUpcoming(record)}
                  record={record}
                  width={heroBannerWidth}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.discoverySwitch}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="AURA 섭외 프리랜서 상담 신청"
          onPress={onPressExpertList}
          style={({pressed}) => [
            styles.discoveryCard,
            styles.discoveryCardPrimary,
            pressed ? styles.pressed : null,
          ]}>
          <RNView style={styles.discoveryIcon}>
            <Video color={consultingColors.onAccent} size={17} />
          </RNView>
          <Text style={[styles.discoveryTitle, styles.discoveryTitlePrimary]}>
            프리랜서 상담
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.discoveryText, styles.discoveryTextPrimary]}>
            앱에서 신청하고 톡으로 일정 조율
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="근처 뷰티샵 지도 찾기"
          onPress={onPressLocalPlaces}
          style={({pressed}) => [
            styles.discoveryCard,
            pressed ? styles.pressed : null,
          ]}>
          <RNView style={styles.discoveryShopIcon}>
            <Store color={consultingColors.roseStrong} size={17} />
          </RNView>
          <Text style={styles.discoveryTitle}>근처 뷰티샵</Text>
          <Text numberOfLines={2} style={styles.discoveryText}>
            지역 업체를 지도와 함께 확인
          </Text>
        </Pressable>
      </View>

      <View style={styles.heroSection}>
        <ScrollView
          decelerationRate="fast"
          contentContainerStyle={styles.heroCarouselContent}
          horizontal
          onScroll={handleHeroScroll}
          onMomentumScrollEnd={handleHeroScrollEnd}
          ref={heroScrollRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          snapToInterval={heroBannerWidth + HERO_BANNER_GAP}
          snapToAlignment="start">
          {loopingHeroSlides.map(slide => (
            <HeroBanner
              key={slide.id}
              onPress={() => onPressHeroSlide(slide.categoryId)}
              slide={slide}
              width={heroBannerWidth}
            />
          ))}
        </ScrollView>
        <RNView style={styles.heroCarouselMeta}>
          <RNView style={styles.heroDots}>
            {heroSlides.map((slide, index) => (
              <RNView
                key={slide.id}
                style={[
                  styles.heroDot,
                  index === activeHeroIndex && styles.heroDotActive,
                ]}
              />
            ))}
          </RNView>
          <Text style={styles.heroCounter}>
            {activeHeroIndex + 1} / {heroSlides.length}
          </Text>
        </RNView>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="근처 뷰티샵 지도 찾기"
        onPress={onPressLocalPlaces}
        style={({pressed}) => [
          styles.localPlaceBanner,
          pressed ? styles.pressed : null,
        ]}>
        <RNView style={styles.localPlaceIcon}>
          <MapPin color={consultingColors.roseStrong} size={18} />
        </RNView>
        <RNView style={styles.localPlaceBody}>
          <Text style={styles.localPlaceTitle}>근처 뷰티샵 지도 찾기</Text>
          <Text numberOfLines={1} style={styles.localPlaceSubtitle}>
            지역 업체 위치와 예약 정보를 함께 확인해요
          </Text>
        </RNView>
        <ChevronRight color={consultingColors.roseStrong} size={16} />
      </Pressable>

      <View style={styles.expertSection}>
        <View style={styles.sectionHeader}>
          <ConsultingSectionTitle>섭외 프리랜서</ConsultingSectionTitle>
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

function HeroBanner({
  onPress,
  slide,
  width,
}: {
  onPress: () => void;
  slide: HeroSlide;
  width: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${slide.title} 신청하기`}
      onPress={onPress}
      style={({pressed}) => [
        styles.hero,
        {width},
        pressed ? styles.pressed : null,
      ]}>
      <ImageBackground
        imageStyle={styles.heroImage}
        resizeMode="cover"
        source={slide.imageSource}
        style={styles.heroImageFrame}>
        <RNView style={styles.heroScrim}>
          <RNView style={styles.heroLabelPill}>
            {slide.showVideoIcon ? (
              <Video color={consultingColors.onAccent} size={13} />
            ) : (
              <RNView
                style={[styles.heroLabelDot, {backgroundColor: slide.accent}]}
              />
            )}
            <Text style={styles.heroLabel}>{slide.label}</Text>
          </RNView>
          <Text numberOfLines={2} style={styles.heroTitle}>
            {slide.title}
          </Text>
          <Text numberOfLines={2} style={styles.heroSubtitle}>
            {slide.subtitle}
          </Text>
          <RNView style={styles.heroCta}>
            <Text style={styles.heroCtaText}>{slide.ctaLabel}</Text>
            <ArrowRight color={consultingColors.onAccent} size={16} />
          </RNView>
        </RNView>
      </ImageBackground>
    </Pressable>
  );
}

function QuickActionButton({
  icon,
  label,
  onPress,
  showDot = false,
}: {
  icon: 'bell' | 'calendar' | 'message';
  label: string;
  onPress: () => void;
  showDot?: boolean;
}) {
  const Icon =
    icon === 'bell'
      ? Bell
      : icon === 'message'
        ? MessageCircle
        : CalendarDays;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} 바로가기`}
      onPress={onPress}
      style={({pressed}) => [
        styles.quickActionButton,
        pressed ? styles.pressed : null,
      ]}>
      <RNView style={styles.quickActionIconFrame}>
        <Icon color={consultingColors.text} size={18} />
        {showDot ? <RNView style={styles.quickActionDot} /> : null}
      </RNView>
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function ActiveRequestCard({
  expert,
  record,
  width,
  onPress,
}: {
  expert: ReturnType<typeof findConsultingExpertOrFirst>;
  record: ConsultingRecord;
  width: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expert.name} ${getActiveRequestStatusTitle(record.status)} 톡 열기`}
      onPress={onPress}
      style={({pressed}) => [
        styles.activeRequestCard,
        {width},
        pressed ? styles.pressed : null,
      ]}>
      <RNView style={styles.activeRequestTopRow}>
        <ConsultingStatusBadge status={record.status} />
        <Text style={styles.activeRequestDate}>{record.dateLabel}</Text>
      </RNView>
      <RNView style={styles.activeRequestMainRow}>
        <ExpertAvatar expert={expert} size={42} />
        <RNView style={styles.activeRequestBody}>
          <Text numberOfLines={1} style={styles.activeRequestTitle}>
            {expert.name} · {record.durationLabel}
          </Text>
          <Text numberOfLines={2} style={styles.activeRequestDescription}>
            {getActiveRequestDescription(record.status)}
          </Text>
        </RNView>
      </RNView>
      <RNView style={styles.activeRequestFooter}>
        <RNView style={styles.activeRequestTalkPill}>
          <MessageCircle color={consultingColors.roseStrong} size={14} />
          <Text style={styles.activeRequestTalkText}>톡으로 확인</Text>
        </RNView>
        <Text numberOfLines={1} style={styles.activeRequestCategory}>
          {record.categoryLabel}
        </Text>
      </RNView>
    </Pressable>
  );
}

function getActiveRequestStatusTitle(status: ConsultingRecord['status']): string {
  if (status === 'confirmed') {
    return '예약 확정';
  }

  if (status === 'contacting') {
    return '일정 확인 중';
  }

  return '신청 접수';
}

function getActiveRequestDescription(status: ConsultingRecord['status']): string {
  if (status === 'confirmed') {
    return '예약이 확정됐어요. 톡에서 안내와 통화 버튼을 확인하세요.';
  }

  if (status === 'contacting') {
    return '프리랜서와 운영팀이 가능 시간을 확인 중이에요.';
  }

  return '아직 예약 완료가 아니라 신청 접수 상태예요.';
}

const styles = StyleSheet.create({
  heroDot: {
    backgroundColor: consultingColors.border,
    borderRadius: consultingRadius.pill,
    height: 6,
    width: 6,
  },
  heroDotActive: {
    backgroundColor: consultingColors.accent,
    width: 18,
  },
  heroDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  heroCounter: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
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
    marginRight: HERO_BANNER_GAP,
    minHeight: 204,
    overflow: 'hidden',
  },
  heroCarouselContent: {
    paddingRight: 26,
  },
  heroCarouselMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  heroCta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    minHeight: 38,
    paddingHorizontal: 17,
    paddingVertical: 9,
  },
  heroCtaText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  heroImage: {
    borderRadius: consultingRadius.sheet,
  },
  heroImageFrame: {
    flex: 1,
    minHeight: 204,
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
    minHeight: 28,
    paddingHorizontal: 10,
  },
  heroLabelDot: {
    borderRadius: consultingRadius.pill,
    height: 8,
    width: 8,
  },
  heroSection: {
    gap: spacing.md,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    marginTop: 7,
    maxWidth: 238,
  },
  heroScrim: {
    backgroundColor: 'rgba(12, 10, 9, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 18,
  },
  heroTitle: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.bold,
    fontSize: 19,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 25,
    marginTop: 9,
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
  localPlaceBanner: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  localPlaceBody: {
    flex: 1,
  },
  localPlaceIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  localPlaceSubtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  localPlaceTitle: {
    color: consultingColors.text,
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
  activeRequestCategory: {
    color: consultingColors.textSoft,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    textAlign: 'right',
  },
  activeRequestDate: {
    color: consultingColors.textSoft,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  activeRequestDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 3,
  },
  activeRequestFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  activeRequestList: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
  activeRequestMainRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  activeRequestSection: {
    gap: spacing.md,
  },
  activeRequestSortLabel: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  activeRequestTalkPill: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  activeRequestTalkText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  activeRequestTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  activeRequestBody: {
    flex: 1,
  },
  activeRequestCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.border,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: 150,
    padding: 15,
  },
  activeRequestTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  discoveryCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 116,
    padding: 14,
  },
  discoveryCardPrimary: {
    backgroundColor: consultingColors.text,
    borderColor: consultingColors.text,
  },
  discoveryIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: consultingRadius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  discoveryShopIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  discoverySwitch: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  discoveryText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  discoveryTextPrimary: {
    color: 'rgba(255, 255, 255, 0.76)',
  },
  discoveryTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  discoveryTitlePrimary: {
    color: consultingColors.onAccent,
  },
  quickAccessHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  quickAccessSection: {
    gap: spacing.md,
  },
  quickAccessSubtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 3,
  },
  quickAccessTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  quickActionButton: {
    alignItems: 'center',
    gap: 4,
    minWidth: 46,
  },
  quickActionDot: {
    backgroundColor: consultingColors.roseStrong,
    borderColor: consultingColors.surface,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    height: 8,
    position: 'absolute',
    right: 7,
    top: 6,
    width: 8,
  },
  quickActionIconFrame: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickActionText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
  },
});
