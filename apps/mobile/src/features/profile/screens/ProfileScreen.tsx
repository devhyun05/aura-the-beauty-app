import {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupStylePreview} from '../../../shared/types/profile';
import {AppScreen, SectionHeader} from '../../../shared/ui';
import {ImageAnalysisSummaryCard} from '../components/ImageAnalysisSummaryCard';
import {MakeupStyleCard} from '../components/MakeupStyleCard';
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
  onPressImageAnalysisReport?: (reportId: string) => void;
  onPressImageAnalysisReportsList?: () => void;
  onPressMakeupStyleList?: () => void;
  onPressLikedProductList?: () => void;
  savedMakeupStyle?: MakeupStylePreview | null;
};

export function ProfileScreen({
  onPressProfileEdit,
  onPressImageAnalysisReport,
  onPressImageAnalysisReportsList,
  onPressMakeupStyleList,
  onPressLikedProductList,
  savedMakeupStyle,
}: ProfileScreenProps) {
  const {width} = useWindowDimensions();
  const isMountedRef = useRef(false);
  const [loadState, setLoadState] = useState<ProfileLoadState>({
    status: 'loading',
  });
  const contentWidth = width - spacing.screenX * 2;
  const makeupStyleCardWidth = Math.floor((contentWidth - spacing.sm * 2) / 3);
  const productCardWidth = Math.floor((contentWidth - spacing.sm * 2) / 3);
  const makeupStyleCardLayout = {
    flexBasis: makeupStyleCardWidth,
    maxWidth: makeupStyleCardWidth,
    width: makeupStyleCardWidth,
  };
  const productCardStyle = {
    flexBasis: productCardWidth,
    maxWidth: productCardWidth,
    width: productCardWidth,
  };

  const loadProfile = useCallback(() => {
    setLoadState({status: 'loading'});

    resolveProfileLoadState(loadProfileScreenData).then((nextState) => {
      if (isMountedRef.current) {
        setLoadState(nextState);
      }
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadProfile();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadProfile]);

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
  const imageAnalysisReport = data.imageAnalysisReport;
  const makeupStyles = savedMakeupStyle
    ? [
        savedMakeupStyle,
        ...data.makeupStyles.filter((makeupStyle) => makeupStyle.id !== savedMakeupStyle.id),
      ]
    : data.makeupStyles;
  const previewMakeupStyles = makeupStyles.slice(0, 3);

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
        <View style={styles.makeupStyleGrid}>
          {previewMakeupStyles.map((makeupStyle) => (
            <MakeupStyleCard
              key={makeupStyle.id}
              makeupStyle={makeupStyle}
              style={makeupStyleCardLayout}
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
          {data.likedProducts.map((product) => (
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
  makeupStyleGrid: {
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
