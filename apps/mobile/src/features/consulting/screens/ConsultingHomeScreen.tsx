import {useCallback, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
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
  ChevronRight,
  MessageCircle,
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
  getConsultingBookings,
  getConsultingHome,
} from '../services/consultingService';
import {isConsultingMessageStatus} from '../services/consultingReadStateService';
import type {AppScreenTopPadding} from '../../../shared/ui/AppScreen';
import type {
  ConsultingCategory,
  ConsultingCategoryId,
  ConsultingRecord,
} from '../types';

const consultingCdnBaseUrl = (
  process.env.EXPO_PUBLIC_CDN_BASE_URL?.trim().replace(/\/+$/, '') ??
  'https://d3t1pbvtir1lj.cloudfront.net'
);

function consultingImageSource(fileName: string): ImageSourcePropType {
  return {
    uri: `${consultingCdnBaseUrl}/uploads/optimized/consulting/${fileName}`,
  };
}

const consultingHeroOnlineImage = consultingImageSource(
  'consulting-hero-online.jpg',
);
const consultingHeroColorImage = consultingImageSource(
  'consulting-hero-color.jpg',
);
const consultingHeroMakeupImage = consultingImageSource(
  'consulting-hero-makeup.jpg',
);
const consultingHeroFashionImage = consultingImageSource(
  'consulting-hero-fashion.jpg',
);
const consultingHeroHairImage = consultingImageSource(
  'consulting-hero-hair.jpg',
);

const HERO_BANNER_GAP = spacing.md;
const INITIAL_DISCOVERY_VISIBLE_COUNT = 2;
const DISCOVERY_VISIBLE_INCREMENT = 3;

type ConsultingHomeScreenProps = {
  onPressHeroSlide: (categoryId: ConsultingCategoryId | null) => void;
  onPressExpert: (expertId: string) => void;
  onPressExpertList: () => void;
  onPressUpcoming: (record: ConsultingRecord) => void;
  topPadding?: AppScreenTopPadding;
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
  onPressUpcoming,
  topPadding,
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
  const [visibleExpertCount, setVisibleExpertCount] = useState(
    INITIAL_DISCOVERY_VISIBLE_COUNT,
  );

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      Promise.all([getConsultingHome(), getConsultingBookings()]).then(
        ([homeData, bookingRecords]) => {
          const recordsForBadges =
            bookingRecords.length > 0 ? bookingRecords : homeData.activeRecords;

          if (!isMounted) {
            return;
          }

          const activeBookingRecords =
            getActiveRecordsFromBookings(recordsForBadges);
          setHome({
            ...homeData,
            activeRecord:
              activeBookingRecords[0] ?? homeData.activeRecord ?? null,
            activeRecords:
              activeBookingRecords.length > 0
                ? activeBookingRecords
                : homeData.activeRecords,
          });
        },
      );

      return () => {
        isMounted = false;
      };
    }, []),
  );

  const {categories, experts} = home;
  const heroBannerWidth = useMemo(
    () => Math.max(300, Math.min(width - 64, 342)),
    [width],
  );
  const activeRequestCardWidth = useMemo(
    () => Math.max(260, Math.min(width * 0.78, 320)),
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
  const visibleExperts = experts.slice(0, visibleExpertCount);
  const hasMoreExperts = visibleExpertCount < experts.length;

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
    const nextIndex =
      ((rawIndex % heroSlides.length) + heroSlides.length) % heroSlides.length;
    setActiveHeroIndex(nextIndex);
  };

  return (
    <ConsultingScreenScaffold
      bottomPadding="floatingFooter"
      contentGap={spacing.xxl}
      topPadding={topPadding}>
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
          snapToAlignment="start"
          snapToInterval={heroBannerWidth + HERO_BANNER_GAP}>
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
                  index === activeHeroIndex ? styles.heroDotActive : null,
                ]}
              />
            ))}
          </RNView>
          <Text style={styles.heroCounter}>
            {activeHeroIndex + 1} / {heroSlides.length}
          </Text>
        </RNView>
      </View>

      <View style={styles.discoverySection}>
        <RNView>
          <ConsultingSectionTitle>상담 찾기</ConsultingSectionTitle>
          <Text style={styles.discoverySectionSubtitle}>
            섭외한 프리랜서를 온라인 또는 오프라인으로 예약해요
          </Text>
        </RNView>
        <RNView style={styles.bookingModeSummary}>
          <RNView style={styles.bookingModePill}>
            <Video color={consultingColors.roseStrong} size={15} />
            <Text style={styles.bookingModePillText}>온라인 상담</Text>
          </RNView>
          <RNView style={styles.bookingModePill}>
            <Text style={styles.bookingModeIconText}>OFF</Text>
            <Text style={styles.bookingModePillText}>오프라인 예약</Text>
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
                  width={activeRequestCardWidth}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.discoveryListSection}>
        <RNView style={styles.sectionHeader}>
          <ConsultingSectionTitle>섭외 프리랜서</ConsultingSectionTitle>
          {hasMoreExperts ? (
            <MoreInlineButton
              label="더보기"
              onPress={() =>
                setVisibleExpertCount(count =>
                  Math.min(count + DISCOVERY_VISIBLE_INCREMENT, experts.length),
                )
              }
            />
          ) : (
            <MoreInlineButton label="전체보기" onPress={onPressExpertList} />
          )}
        </RNView>
        <View style={styles.expertList}>
          {visibleExperts.map(expert => (
            <ExpertListCard
              expert={expert}
              key={expert.id}
              onPress={() => onPressExpert(expert.id)}
            />
          ))}
        </View>
      </View>
    </ConsultingScreenScaffold>
  );
}

function getActiveRecordsFromBookings(
  records: readonly ConsultingRecord[],
): readonly ConsultingRecord[] {
  return records.filter(record => isConsultingMessageStatus(record.status));
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

function MoreInlineButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({pressed}) => [
        styles.moreRow,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={styles.moreText}>{label}</Text>
      <ChevronRight color={consultingColors.textSoft} size={14} />
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
  bookingModeIconText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  bookingModePill: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  bookingModePillText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  bookingModeSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  discoveryListSection: {
    gap: spacing.lg,
  },
  discoveryLoadingBody: {
    flex: 1,
    gap: 2,
  },
  discoveryLoadingCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  discoveryLoadingText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
  },
  discoveryLoadingTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  expertList: {
    gap: spacing.md,
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
  heroCounter: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
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
  heroLabelDot: {
    borderRadius: consultingRadius.pill,
    height: 8,
    width: 8,
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
  heroScrim: {
    backgroundColor: 'rgba(12, 10, 9, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 18,
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
  heroTitle: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.bold,
    fontSize: 19,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 25,
    marginTop: 9,
    maxWidth: 240,
  },
  localPlaceBody: {
    flex: 1,
    gap: 5,
  },
  localPlaceCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 13,
  },
  localPlaceCategory: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
  },
  localPlaceChip: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 9,
  },
  localPlaceChipText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  localPlaceDistance: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: consultingRadius.pill,
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  localPlaceFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: 3,
  },
  localPlaceImage: {
    borderRadius: consultingRadius.card,
  },
  localPlaceImageFrame: {
    borderRadius: consultingRadius.card,
    height: 92,
    overflow: 'hidden',
    width: 92,
  },
  localPlaceList: {
    gap: spacing.md,
  },
  localPlaceMapPill: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 9,
  },
  localPlaceMapText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  localPlaceMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  localPlaceMetaText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    flex: 1,
  },
  localPlaceName: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  localPlaceSummary: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  localPlaceTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
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
  discoverySection: {
    gap: spacing.md,
  },
  discoverySectionSubtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
  discoveryTab: {
    alignItems: 'center',
    borderRadius: consultingRadius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  discoveryTabActive: {
    backgroundColor: consultingColors.text,
  },
  discoveryTabIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderRadius: consultingRadius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  discoveryTabIconActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  discoveryTabText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  discoveryTabTextActive: {
    color: consultingColors.onAccent,
  },
  discoveryTabs: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
});
