import {useCallback, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {CalendarClock, ChevronRight, MessageCircle, Video} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {subscribeNotificationStateChange} from '../../notifications';
import {clearMyPageProfileSummaryCache} from '../../../shared/services/profileService';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import {AppScreen, SectionHeader} from '../../../shared/ui';
import {getConsultingBookings} from '../../consulting/services/consultingService';
import type {ConsultingRecord} from '../../consulting/types';
import {MakeupLookCard} from '../components/MakeupLookCard';
import {ProductCard} from '../components/ProductCard';
import {ProfileReportListActionSheet} from '../components/ProfileReportListActionSheet';
import {ProfileReportPreviewCard} from '../components/ProfileReportPreviewCard';
import {ProfileSummaryCard} from '../components/ProfileSummaryCard';
import {
  PROFILE_LOAD_ERROR_DESCRIPTION,
  PROFILE_LOAD_RETRY_LABEL,
  type ProfileLoadState,
  resolveProfileLoadState,
} from '../services/profileLoadState';
import {
  loadProfileScreenData,
  loadProfileScreenSnapshot,
} from '../services/profileScreenData';

type ProfileScreenProps = {
  onPressProfileEdit?: () => void;
  onPressFaceAnalysisReport?: (reportId: string) => void;
  onPressFaceAnalysisReportsList?: () => void;
  onPressMakeupRecommendationReport?: (reportId: string) => void;
  onPressMakeupRecommendationReportsList?: () => void;
  onPressMakeupExtractionReport?: (reportId: string) => void;
  onPressMakeupExtractionReportsList?: () => void;
  onPressMakeupFeedbackReport?: (reportId: string) => void;
  onPressMakeupFeedbackReportsList?: () => void;
  onPressMakeupLook?: (makeupLook: MakeupLookPreview) => void;
  onPressCreatedMakeupLookList?: () => void;
  onPressMakeupLookList?: () => void;
  onPressLikedProductList?: () => void;
  onPressConsultingHistory?: () => void;
  onPressConsultingReview?: (record: ConsultingRecord) => void;
  onPressConsultingSummary?: (record: ConsultingRecord) => void;
  createdMakeupLooks?: readonly MakeupLookPreview[];
  likedMakeupLooks?: readonly MakeupLookPreview[];
};

export const PROFILE_SCREEN_LAYOUT_MODE = 'dashboard';
export const PROFILE_SCREEN_PREVIEW_COLUMN_COUNT = 2;
export const PROFILE_SCREEN_REPORT_COLUMN_COUNT = 2;
export const PROFILE_SCREEN_REPORT_SCROLL_AXIS = 'horizontal';

export function ProfileScreen({
  onPressProfileEdit,
  onPressFaceAnalysisReport,
  onPressFaceAnalysisReportsList,
  onPressMakeupRecommendationReport,
  onPressMakeupRecommendationReportsList,
  onPressMakeupExtractionReport,
  onPressMakeupExtractionReportsList,
  onPressMakeupFeedbackReport,
  onPressMakeupFeedbackReportsList,
  onPressMakeupLook,
  onPressCreatedMakeupLookList,
  onPressMakeupLookList,
  onPressLikedProductList,
  onPressConsultingHistory,
  onPressConsultingReview,
  onPressConsultingSummary,
  createdMakeupLooks = [],
  likedMakeupLooks = [],
}: ProfileScreenProps) {
  const {width} = useWindowDimensions();
  const isMountedRef = useRef(false);
  const hasLoadedProfileRef = useRef(false);
  const profileLoadGenerationRef = useRef(0);
  const [loadState, setLoadState] = useState<ProfileLoadState>({
    status: 'loading',
  });
  const [consultingRecords, setConsultingRecords] = useState<
    readonly ConsultingRecord[]
  >([]);
  const [isConsultingLoading, setIsConsultingLoading] = useState(false);
  const [isReportListSheetVisible, setIsReportListSheetVisible] = useState(false);
  const contentWidth = width - spacing.screenX * 2;
  const previewGap =
    spacing.md * (PROFILE_SCREEN_PREVIEW_COLUMN_COUNT - 1);
  const previewCardWidth = Math.floor(
    (contentWidth - previewGap) / PROFILE_SCREEN_PREVIEW_COLUMN_COUNT,
  );
  const previewCardLayout = {
    flexBasis: previewCardWidth,
    maxWidth: previewCardWidth,
    width: previewCardWidth,
  };
  const reportCardWidth = Math.max(
    136,
    Math.min(168, Math.floor(width * 0.4)),
  );
  const reportCardLayout = {
    flexBasis: reportCardWidth,
    maxWidth: reportCardWidth,
    width: reportCardWidth,
  };

  const loadProfile = useCallback((options?: {silent?: boolean}) => {
    const loadGeneration = profileLoadGenerationRef.current + 1;
    profileLoadGenerationRef.current = loadGeneration;

    if (!options?.silent) {
      setLoadState({status: 'loading'});
    }

    if (!hasLoadedProfileRef.current) {
      resolveProfileLoadState(loadProfileScreenSnapshot).then((nextState) => {
        if (
          isMountedRef.current &&
          profileLoadGenerationRef.current === loadGeneration &&
          nextState.status === 'success'
        ) {
          hasLoadedProfileRef.current = true;
          setLoadState(nextState);
        }
      });
    }

    resolveProfileLoadState(loadProfileScreenData).then((nextState) => {
      if (
        isMountedRef.current &&
        profileLoadGenerationRef.current === loadGeneration
      ) {
        if (nextState.status === 'success') {
          hasLoadedProfileRef.current = true;
        }

        if (nextState.status === 'success' || !hasLoadedProfileRef.current) {
          setLoadState(nextState);
        }
      }
    });
  }, []);

  const hasConsultingHistoryAction = Boolean(onPressConsultingHistory);
  const loadConsultingRecords = useCallback(() => {
    if (!hasConsultingHistoryAction) {
      return () => {};
    }

    let isActive = true;
    setIsConsultingLoading(true);

    getConsultingBookings()
      .then(records => {
        if (isActive) {
          setConsultingRecords(records.slice(0, 2));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsConsultingLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [hasConsultingHistoryAction]);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      loadProfile({silent: hasLoadedProfileRef.current});
      const cancelConsultingLoad = loadConsultingRecords();
      const unsubscribeNotificationState = subscribeNotificationStateChange(() => {
        clearMyPageProfileSummaryCache();
        loadProfile({silent: true});
      });

      return () => {
        isMountedRef.current = false;
        cancelConsultingLoad();
        unsubscribeNotificationState();
      };
    }, [loadConsultingRecords, loadProfile]),
  );

  if (loadState.status === 'loading') {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>마이페이지를 불러오는 중이에요.</Text>
      </View>
    );
  }

  if (loadState.status === 'error') {
    return (
      <View style={styles.loading}>
        <View style={styles.errorContent}>
          <Text accessibilityLiveRegion="polite" style={styles.errorTitle}>
            {loadState.message}
          </Text>
          <Text style={styles.errorDescription}>
            {PROFILE_LOAD_ERROR_DESCRIPTION}
          </Text>
          <Pressable
            accessibilityLabel={PROFILE_LOAD_RETRY_LABEL}
            accessibilityRole="button"
            onPress={() => loadProfile()}
            style={({pressed}) => [
              styles.retryButton,
              pressed ? styles.retryButtonPressed : null,
            ]}
          >
            <Text style={styles.retryButtonText}>
              {PROFILE_LOAD_RETRY_LABEL}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const data = loadState.data;
  const previewCreatedMakeupLooks = createdMakeupLooks.slice(0, 4);
  const previewLikedMakeupLooks = likedMakeupLooks.slice(0, 4);
  const previewProducts = data.likedProducts.slice(0, 4);

  return (
    <AppScreen
      bottomPadding="floatingFooter"
      contentGap={spacing.xxl}
      topPadding="none">
      <View style={styles.hero}>
        <ProfileSummaryCard
          beautyProfile={data.beautyProfile}
          onPressSettings={onPressProfileEdit}
          profile={data.profile}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="더보기"
          onPressAction={() => setIsReportListSheetVisible(true)}
          title="내 보고서 목록"
        />
        <NativeScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.reportHub}>
          <ProfileReportPreviewCard
            description="얼굴형·피부톤 분석"
            label="얼굴 분석"
            onPressLatest={
              data.reportHub.faceAnalysis
                ? () => onPressFaceAnalysisReport?.(data.reportHub.faceAnalysis!.id)
                : undefined
            }
            preview={data.reportHub.faceAnalysis}
            style={reportCardLayout}
          />
          <ProfileReportPreviewCard
            description="나에게 어울리는 룩"
            label="메이크업 추천"
            onPressLatest={
              data.reportHub.makeupRecommendation
                ? () =>
                    onPressMakeupRecommendationReport?.(
                      data.reportHub.makeupRecommendation!.id,
                    )
                : undefined
            }
            preview={data.reportHub.makeupRecommendation}
            style={reportCardLayout}
          />
          <ProfileReportPreviewCard
            description="사진 속 메이크업 분석"
            label="메이크업 추출"
            onPressLatest={
              data.reportHub.makeupExtraction
                ? () =>
                    onPressMakeupExtractionReport?.(
                      data.reportHub.makeupExtraction!.id,
                    )
                : undefined
            }
            preview={data.reportHub.makeupExtraction}
            style={reportCardLayout}
          />
          <ProfileReportPreviewCard
            description="평가와 보완 포인트"
            label="메이크업 피드백"
            onPressLatest={
              data.reportHub.makeupFeedback
                ? () =>
                    onPressMakeupFeedbackReport?.(
                      data.reportHub.makeupFeedback!.id,
                    )
                : undefined
            }
            preview={data.reportHub.makeupFeedback}
            style={reportCardLayout}
          />
        </NativeScrollView>
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="더보기"
          onPressAction={onPressCreatedMakeupLookList}
          title="내가 만든 필터"
        />
        {previewCreatedMakeupLooks.length > 0 ? (
          <View style={styles.previewGrid}>
            {previewCreatedMakeupLooks.map(makeupLook => (
              <MakeupLookCard
                key={makeupLook.id}
                makeupLook={makeupLook}
                onPress={onPressMakeupLook}
                style={previewCardLayout}
              />
            ))}
          </View>
        ) : (
          <EmptySection label="아직 만든 필터가 없어요." />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="더보기"
          onPressAction={onPressMakeupLookList}
          title="좋아요한 메이크업 필터"
        />
        {previewLikedMakeupLooks.length > 0 ? (
          <View style={styles.previewGrid}>
            {previewLikedMakeupLooks.map((makeupLook) => (
              <MakeupLookCard
                key={makeupLook.id}
                makeupLook={makeupLook}
                onPress={onPressMakeupLook}
                style={previewCardLayout}
              />
            ))}
          </View>
        ) : (
          <EmptySection label="좋아요한 메이크업 필터가 없어요." />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="더보기"
          onPressAction={onPressLikedProductList}
          title="좋아요한 제품"
        />
        {previewProducts.length > 0 ? (
          <View style={styles.previewGrid}>
            {previewProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                style={previewCardLayout}
              />
            ))}
          </View>
        ) : (
          <EmptySection label="좋아요한 제품이 없어요." />
        )}
      </View>

      {onPressConsultingHistory ? (
        <View style={styles.section}>
          <SectionHeader
            actionLabel="더보기"
            onPressAction={onPressConsultingHistory}
            title="전문가 상담"
          />
          {consultingRecords.length > 0 ? (
            <View style={styles.consultingList}>
              {consultingRecords.map(record => (
                <ConsultingRecordPreview
                  key={record.id}
                  onPressHistory={onPressConsultingHistory}
                  onPressReview={onPressConsultingReview}
                  onPressSummary={onPressConsultingSummary}
                  record={record}
                />
              ))}
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="상담 내역 보기"
              onPress={onPressConsultingHistory}
              style={({pressed}) => [
                styles.consultingRow,
                pressed ? styles.consultingRowPressed : null,
              ]}>
              <View style={styles.consultingIcon}>
                <Video color={colors.textPrimary} size={18} />
              </View>
              <View style={styles.consultingBody}>
                <Text style={styles.consultingTitle}>
                  {isConsultingLoading
                    ? '상담 내역을 확인하는 중'
                    : '내 상담 내역'}
                </Text>
                <Text numberOfLines={1} style={styles.consultingDescription}>
                  예약과 상담 요약 리포트를 한곳에서 확인해요
                </Text>
              </View>
              <ChevronRight color={colors.textTertiary} size={18} />
            </Pressable>
          )}
        </View>
      ) : null}

      <ProfileReportListActionSheet
        isVisible={isReportListSheetVisible}
        onClose={() => setIsReportListSheetVisible(false)}
        onPressFaceAnalysis={onPressFaceAnalysisReportsList}
        onPressMakeupExtraction={onPressMakeupExtractionReportsList}
        onPressMakeupFeedback={onPressMakeupFeedbackReportsList}
        onPressMakeupRecommendation={onPressMakeupRecommendationReportsList}
      />
    </AppScreen>
  );
}

function EmptySection({label}: {label: string}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

function ConsultingRecordPreview({
  record,
  onPressHistory,
  onPressReview,
  onPressSummary,
}: {
  record: ConsultingRecord;
  onPressHistory: () => void;
  onPressReview?: (record: ConsultingRecord) => void;
  onPressSummary?: (record: ConsultingRecord) => void;
}) {
  const isCompleted = record.status === 'completed';
  const canReview = isCompleted && !record.reviewId && onPressReview;
  const primaryLabel = isCompleted ? '요약 보기' : '예약 확인';
  const primaryAction = isCompleted && onPressSummary
    ? () => onPressSummary(record)
    : onPressHistory;

  return (
    <View style={styles.consultingPreviewCard}>
      <View style={styles.consultingPreviewIcon}>
        <CalendarClock color={colors.textPrimary} size={17} />
      </View>
      <View style={styles.consultingPreviewBody}>
        <View style={styles.consultingPreviewTopRow}>
          <Text numberOfLines={1} style={styles.consultingPreviewTitle}>
            {record.categoryLabel || '전문가 상담'}
          </Text>
          <Text style={styles.consultingStatusText}>
            {getConsultingStatusLabel(record.status)}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.consultingPreviewMeta}>
          {record.dateLabel} · {record.durationLabel}
        </Text>
        <View style={styles.consultingActionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={primaryAction}
            style={({pressed}) => [
              styles.consultingSmallButton,
              pressed ? styles.consultingRowPressed : null,
            ]}>
            <Text style={styles.consultingSmallButtonText}>
              {primaryLabel}
            </Text>
          </Pressable>
          {canReview ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onPressReview(record)}
              style={({pressed}) => [
                styles.consultingReviewButton,
                pressed ? styles.consultingRowPressed : null,
              ]}>
              <MessageCircle color={colors.white} size={13} />
              <Text style={styles.consultingReviewButtonText}>리뷰 작성</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function getConsultingStatusLabel(status: ConsultingRecord['status']) {
  if (status === 'completed') {
    return '완료';
  }

  if (status === 'canceled') {
    return '취소';
  }

  return '예정';
}

const styles = StyleSheet.create({
  consultingActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  consultingBody: {
    flex: 1,
  },
  consultingDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 2,
  },
  consultingIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  consultingRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  consultingRowPressed: {
    opacity: 0.75,
  },
  consultingList: {
    gap: spacing.sm,
  },
  consultingPreviewBody: {
    flex: 1,
    minWidth: 0,
  },
  consultingPreviewCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  consultingPreviewIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  consultingPreviewMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 3,
  },
  consultingPreviewTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  consultingPreviewTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  consultingReviewButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.md,
  },
  consultingReviewButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  consultingSmallButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.md,
  },
  consultingSmallButtonText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  consultingStatusText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  consultingTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    justifyContent: 'center',
    minHeight: 108,
    padding: spacing.lg,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  errorContent: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  errorDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  hero: {
    gap: spacing.md,
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  reportHub: {
    gap: spacing.md,
    paddingRight: spacing.screenX,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    minWidth: 112,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryButtonPressed: {
    opacity: 0.78,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  section: {
    gap: spacing.md,
  },
});
