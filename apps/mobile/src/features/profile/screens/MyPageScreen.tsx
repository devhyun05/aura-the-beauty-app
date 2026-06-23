import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {getLatestAnalysisResult} from '../../../shared/services/analysisService';
import {getMakeupLookPreview} from '../../../shared/services/makeupService';
import {getLikedProductPreview} from '../../../shared/services/productService';
import {getUserProfile} from '../../../shared/services/userService';
import {colors, spacing, typography} from '../../../shared/theme';
import type {AnalysisResult} from '../../../shared/types/analysis';
import type {
  MakeupLook,
  Product,
  UserProfile,
} from '../../../shared/types/userPage';
import {AppHeader, AppScreen, SectionHeader} from '../../../shared/ui';
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
}: MyPageScreenProps) {
  const {width} = useWindowDimensions();
  const [data, setData] = useState<MyPageData | null>(null);
  const contentWidth = width - spacing.screenX * 2;
  const lookCardWidth = Math.floor((contentWidth - spacing.sm * 2) / 3);
  const productCardWidth = Math.floor((contentWidth - spacing.md * 2) / 3);

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
        <AppHeader title="마이페이지" />
        <View style={styles.loading}>
          <Text style={styles.loadingText}>마이페이지를 불러오는 중이에요.</Text>
        </View>
      </AppScreen>
    );
  }

  const analysisResult = data.analysisResult;

  return (
    <AppScreen contentGap={24}>
      <AppHeader title="마이페이지" />

      <ProfileSummaryCard
        onPressSettings={onPressProfileEdit}
        profile={data.profile}
      />

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
          {data.makeupLooks.map((look) => (
            <MakeupLookCard
              key={look.id}
              look={look}
              style={{width: lookCardWidth}}
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
              style={{width: productCardWidth}}
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
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
});
