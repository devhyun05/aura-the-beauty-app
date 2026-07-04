import {useCallback, useEffect, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {deleteFaceAnalysisReport} from '../../../shared/services/faceAnalysisService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import {AppScreen, SectionHeader} from '../../../shared/ui';
import {FaceAnalysisSummaryCard} from '../components/FaceAnalysisSummaryCard';
import {MakeupLookCard} from '../components/MakeupLookCard';
import {ProductCard} from '../components/ProductCard';
import {ProfileSummaryCard} from '../components/ProfileSummaryCard';
import {
  PROFILE_LOAD_ERROR_DESCRIPTION,
  PROFILE_LOAD_RETRY_LABEL,
  type ProfileLoadState,
  resolveProfileLoadState,
} from '../services/profileLoadState';
import {loadProfileScreenData} from '../services/profileScreenData';

type ProfileScreenProps = {
  onPressProfileEdit?: () => void;
  onPressFaceAnalysisReport?: (reportId: string) => void;
  onPressFaceAnalysisReportsList?: () => void;
  onPressProductRecommendationForReport?: (reportId: string) => void;
  onPressMakeupLook?: (makeupLook: MakeupLookPreview) => void;
  onPressMakeupLookList?: () => void;
  onPressLikedProductList?: () => void;
  likedMakeupLooks?: readonly MakeupLookPreview[];
};

export const PROFILE_SCREEN_LAYOUT_MODE = 'dashboard';
export const PROFILE_SCREEN_PREVIEW_COLUMN_COUNT = 2;

export function ProfileScreen({
  onPressProfileEdit,
  onPressFaceAnalysisReport,
  onPressFaceAnalysisReportsList,
  onPressProductRecommendationForReport,
  onPressMakeupLook,
  onPressMakeupLookList,
  onPressLikedProductList,
  likedMakeupLooks = [],
}: ProfileScreenProps) {
  const {width} = useWindowDimensions();
  const isMountedRef = useRef(false);
  const [loadState, setLoadState] = useState<ProfileLoadState>({
    status: 'loading',
  });
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [pendingDeleteReportId, setPendingDeleteReportId] = useState<string | null>(null);
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

  const loadProfile = useCallback(() => {
    setDeleteErrorMessage(null);
    setPendingDeleteReportId(null);
    setLoadState({status: 'loading'});

    resolveProfileLoadState(loadProfileScreenData).then((nextState) => {
      if (isMountedRef.current) {
        setLoadState(nextState);
      }
    });
  }, []);

  const handleDeleteFaceAnalysisReport = useCallback(async (reportId: string) => {
    setDeleteErrorMessage(null);

    if (pendingDeleteReportId !== reportId) {
      setPendingDeleteReportId(reportId);
      return;
    }

    setDeletingReportId(reportId);

    try {
      await deleteFaceAnalysisReport(reportId);

      if (!isMountedRef.current) {
        return;
      }

      setLoadState((currentState) => {
        if (currentState.status !== 'success') {
          return currentState;
        }

        return {
          status: 'success',
          data: removeFaceAnalysisReport(currentState.data, reportId),
        };
      });
      setPendingDeleteReportId(null);
    } catch (error) {
      console.info('[aura:profile] analysis-report:delete-failed', {
        message: error instanceof Error ? error.message : String(error),
        reportId,
      });

      if (isMountedRef.current) {
        setDeleteErrorMessage('보고서를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      if (isMountedRef.current) {
        setDeletingReportId(null);
      }
    }
  }, [pendingDeleteReportId]);

  useEffect(() => {
    isMountedRef.current = true;
    loadProfile();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
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
            onPress={loadProfile}
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
  const faceAnalysisReport = data.faceAnalysisReport;
  const faceAnalysisReports =
    data.faceAnalysisReports.length > 0
      ? data.faceAnalysisReports
      : faceAnalysisReport
        ? [faceAnalysisReport]
        : [];
  const previewMakeupLooks = likedMakeupLooks.slice(0, 4);
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

        <ProfileOverview
          analysisCount={faceAnalysisReports.length}
          likedProductCount={data.likedProducts.length}
          savedLookCount={likedMakeupLooks.length}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="전체 보기"
          onPressAction={onPressFaceAnalysisReportsList}
          title="얼굴 분석 결과"
        />
        {faceAnalysisReports.length > 0 ? (
          <View style={styles.faceAnalysisReportList}>
            {faceAnalysisReports.map((report) => (
              <FaceAnalysisSummaryCard
                key={report.id}
                isDeleteConfirming={pendingDeleteReportId === report.id}
                isDeleting={deletingReportId === report.id}
                onDelete={() => {
                  void handleDeleteFaceAnalysisReport(report.id);
                }}
                onPress={() => onPressFaceAnalysisReport?.(report.id)}
                onPressProducts={() => onPressProductRecommendationForReport?.(report.id)}
                report={report}
              />
            ))}
            {deleteErrorMessage ? (
              <Text accessibilityLiveRegion="polite" style={styles.deleteErrorText}>
                {deleteErrorMessage}
              </Text>
            ) : null}
          </View>
        ) : (
          <EmptySection label="저장된 얼굴 분석 결과가 없어요." />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="전체 보기"
          onPressAction={onPressMakeupLookList}
          title="메이크업 룩"
        />
        {previewMakeupLooks.length > 0 ? (
          <View style={styles.previewGrid}>
            {previewMakeupLooks.map((makeupLook) => (
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
          actionLabel="전체 보기"
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
    </AppScreen>
  );
}

function removeFaceAnalysisReport<T extends {
  faceAnalysisReport: FaceAnalysisReport | null;
  faceAnalysisReports: FaceAnalysisReport[];
}>(data: T, reportId: string): T {
  const nextReports = data.faceAnalysisReports.filter((report) => report.id !== reportId);
  const nextLatestReport =
    data.faceAnalysisReport?.id === reportId
      ? nextReports[0] ?? null
      : data.faceAnalysisReport;

  return {
    ...data,
    faceAnalysisReport: nextLatestReport,
    faceAnalysisReports: nextReports,
  };
}

function EmptySection({label}: {label: string}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

function ProfileOverview({
  analysisCount,
  likedProductCount,
  savedLookCount,
}: {
  analysisCount: number;
  likedProductCount: number;
  savedLookCount: number;
}) {
  return (
    <View style={styles.overviewPanel}>
      <ProfileOverviewItem label="분석" value={analysisCount} />
      <View style={styles.overviewDivider} />
      <ProfileOverviewItem label="저장 룩" value={savedLookCount} />
      <View style={styles.overviewDivider} />
      <ProfileOverviewItem label="좋아요" value={likedProductCount} />
    </View>
  );
}

function ProfileOverviewItem({label, value}: {label: string; value: number}) {
  return (
    <View style={styles.overviewItem}>
      <Text numberOfLines={1} style={styles.overviewValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.overviewLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  deleteErrorText: {
    color: colors.danger,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.xs,
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
  faceAnalysisReportList: {
    gap: spacing.md,
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
  overviewDivider: {
    backgroundColor: colors.divider,
    height: 36,
    width: 1,
  },
  overviewItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minWidth: 0,
  },
  overviewLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  overviewPanel: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: spacing.lg,
  },
  overviewValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
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
