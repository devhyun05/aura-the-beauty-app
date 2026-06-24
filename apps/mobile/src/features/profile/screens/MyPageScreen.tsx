import {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupStylePreview} from '../../../shared/types/myPage';
import {AppScreen, SectionHeader} from '../../../shared/ui';
import {ImageAnalysisSummaryCard} from '../components/ImageAnalysisSummaryCard';
import {MakeupLookCard} from '../components/MakeupLookCard';
import {ProductCard} from '../components/ProductCard';
import {ProfileSummaryCard} from '../components/ProfileSummaryCard';
import {
  MY_PAGE_LOAD_ERROR_DESCRIPTION,
  MY_PAGE_LOAD_RETRY_LABEL,
  type MyPageLoadState,
  resolveMyPageLoadState,
} from '../services/myPageLoadState';
import {loadMyPageScreenData} from '../services/myPageScreenData';

type MyPageScreenProps = {
  onPressProfileEdit?: () => void;
  onPressImageAnalysisReport?: (reportId: string) => void;
  onPressImageAnalysisReportsList?: () => void;
  onPressMakeupStyleList?: () => void;
  onPressLikedProductList?: () => void;
  savedMakeupStyle?: MakeupStylePreview | null;
};

export function MyPageScreen({
  onPressProfileEdit,
  onPressImageAnalysisReport,
  onPressImageAnalysisReportsList,
  onPressMakeupStyleList,
  onPressLikedProductList,
  savedMakeupStyle,
}: MyPageScreenProps) {
  const {width} = useWindowDimensions();
  const isMountedRef = useRef(false);
  const [loadState, setLoadState] = useState<MyPageLoadState>({
    status: 'loading',
  });
  const contentWidth = width - spacing.screenX * 2;
  const lookCardWidth = Math.floor((contentWidth - spacing.sm * 2) / 3);
  const productCardWidth = Math.floor((contentWidth - spacing.sm * 2) / 3);
  const lookCardStyle = {
    flexBasis: lookCardWidth,
    maxWidth: lookCardWidth,
    width: lookCardWidth,
  };
  const productCardStyle = {
    flexBasis: productCardWidth,
    maxWidth: productCardWidth,
    width: productCardWidth,
  };

  const loadMyPage = useCallback(() => {
    setLoadState({status: 'loading'});

    resolveMyPageLoadState(loadMyPageScreenData).then((nextState) => {
      if (isMountedRef.current) {
        setLoadState(nextState);
      }
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadMyPage();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadMyPage]);

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
            {MY_PAGE_LOAD_ERROR_DESCRIPTION}
          </Text>
          <Pressable
            accessibilityLabel={MY_PAGE_LOAD_RETRY_LABEL}
            accessibilityRole="button"
            onPress={loadMyPage}
            style={({pressed}) => [
              styles.retryButton,
              pressed ? styles.retryButtonPressed : null,
            ]}
          >
            <Text style={styles.retryButtonText}>
              {MY_PAGE_LOAD_RETRY_LABEL}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const data = loadState.data;
  const imageAnalysisReport = data.imageAnalysisReport;
  const makeupLooks = savedMakeupStyle
    ? [
        savedMakeupStyle,
        ...data.makeupLooks.filter((look) => look.id !== savedMakeupStyle.id),
      ]
    : data.makeupLooks;
  const previewMakeupLooks = makeupLooks.slice(0, 3);

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <ProfileSummaryCard
        onPressSettings={onPressProfileEdit}
        profile={data.profile}
      />

      <View style={styles.section}>
        <SectionHeader
          actionLabel="전체 보기"
          onPressAction={onPressImageAnalysisReportsList}
          title="이미지 분석 결과"
        />
        {imageAnalysisReport ? (
          <ImageAnalysisSummaryCard
            onPress={() => onPressImageAnalysisReport?.(imageAnalysisReport.id)}
            report={imageAnalysisReport}
          />
        ) : (
          <EmptySection label="저장된 이미지 분석 결과가 없어요." />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="전체 보기"
          onPressAction={onPressMakeupStyleList}
          title="메이크업 스타일"
        />
        <View style={styles.lookGrid}>
          {previewMakeupLooks.map((look) => (
            <MakeupLookCard
              key={look.id}
              look={look}
              style={lookCardStyle}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel="전체 보기"
          onPressAction={onPressLikedProductList}
          title="좋아요한 제품목록"
        />
        <View style={styles.productGrid}>
          {data.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              style={productCardStyle}
            />
          ))}
        </View>
      </View>
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

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 104,
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
  lookGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  productGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    gap: spacing.sm,
  },
});
