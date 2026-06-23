import {useEffect, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {ChevronRight, ShoppingBag, Sparkles} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {getLatestAnalysisResult} from '../../../shared/services/analysisService';
import {getMakeupLookPreview} from '../../../shared/services/makeupService';
import {getLikedProductPreview} from '../../../shared/services/productService';
import {getUserProfile} from '../../../shared/services/userService';
import {colors, iconSize, spacing, typography} from '../../../shared/theme';
import type {AnalysisResult} from '../../../shared/types/analysis';
import type {
  MakeupLook,
  MakeupStylePreview,
  Product,
  UserProfile,
} from '../../../shared/types/userPage';
import {AppScreen, SectionHeader} from '../../../shared/ui';
import {AnalysisSummaryCard} from '../components/AnalysisSummaryCard';
import {MakeupLookCard} from '../components/MakeupLookCard';
import {ProductCard} from '../components/ProductCard';
import {ProfileSummaryCard} from '../components/ProfileSummaryCard';

type MyPageScreenProps = {
  onPressProfileEdit?: () => void;
  onPressAnalysisResult?: (resultId: string) => void;
  onPressAnalysisResultList?: () => void;
  onPressMakeupStyleList?: () => void;
  onPressLikedProductList?: () => void;
  onPressProductRecommendations?: () => void;
  savedMakeupStyle?: MakeupStylePreview | null;
};

type MyPageData = {
  profile: UserProfile;
  analysisResult: AnalysisResult | null;
  makeupLooks: MakeupLook[];
  products: Product[];
};

export function MyPageScreen({
  onPressProfileEdit,
  onPressAnalysisResult,
  onPressAnalysisResultList,
  onPressMakeupStyleList,
  onPressLikedProductList,
  onPressProductRecommendations,
  savedMakeupStyle,
}: MyPageScreenProps) {
  const {width} = useWindowDimensions();
  const [data, setData] = useState<MyPageData | null>(null);
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

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getUserProfile(),
      getLatestAnalysisResult(),
      getMakeupLookPreview(3),
      getLikedProductPreview(3),
    ]).then(([profile, analysisResult, makeupLooks, products]) => {
      if (isMounted) {
        setData({
          profile,
          analysisResult,
          makeupLooks,
          products,
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!data) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>마이페이지를 불러오는 중이에요.</Text>
        </View>
      </AppScreen>
    );
  }

  const analysisResult = data.analysisResult;
  const makeupLooks = savedMakeupStyle
    ? [
        savedMakeupStyle,
        ...data.makeupLooks.filter((look) => look.id !== savedMakeupStyle.id),
      ]
    : data.makeupLooks;
  const previewMakeupLooks = makeupLooks.slice(0, 3);

  return (
    <AppScreen contentGap={spacing.xl}>
      <ProfileSummaryCard
        onPressSettings={onPressProfileEdit}
        profile={data.profile}
      />

      <ProductRecommendationEntryCard onPress={onPressProductRecommendations} />

      <View style={styles.section}>
        <SectionHeader
          actionLabel="전체 보기"
          onPressAction={onPressAnalysisResultList}
          title="분석 결과"
        />
        {analysisResult ? (
          <AnalysisSummaryCard
            onPress={() => onPressAnalysisResult?.(analysisResult.id)}
            result={analysisResult}
          />
        ) : (
          <EmptySection label="저장된 분석 결과가 없어요." />
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

function ProductRecommendationEntryCard({onPress}: {onPress?: () => void}) {
  return (
    <Pressable
      accessibilityLabel="AI 제품 추천 페이지로 이동"
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.recommendationCard,
        pressed ? styles.recommendationCardPressed : null,
      ]}>
      <View style={styles.recommendationIcon}>
        <ShoppingBag color={colors.white} size={iconSize.md} strokeWidth={2} />
      </View>

      <View style={styles.recommendationCopy}>
        <View style={styles.recommendationEyebrowRow}>
          <Sparkles color={colors.white} size={iconSize.xs} strokeWidth={2} />
          <Text style={styles.recommendationEyebrow}>AI PRODUCT MATCH</Text>
        </View>
        <Text style={styles.recommendationTitle}>AI 제품 추천</Text>
        <Text style={styles.recommendationDescription}>
          최근 분석 톤에 맞는 립, 블러셔, 섀도우 제품을 확인해보세요.
        </Text>
      </View>

      <View style={styles.recommendationArrow}>
        <ChevronRight color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.2} />
      </View>
    </Pressable>
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
  recommendationArrow: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  recommendationCard: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: 18,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  recommendationCardPressed: {
    opacity: 0.78,
  },
  recommendationCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  recommendationDescription: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  recommendationEyebrow: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.8,
    lineHeight: typography.lineHeight.xs,
  },
  recommendationEyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  recommendationIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  recommendationTitle: {
    color: colors.white,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  section: {
    gap: spacing.sm,
  },
});
