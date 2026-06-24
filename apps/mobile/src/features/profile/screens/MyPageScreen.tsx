import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {getLatestImageAnalysisReport} from '../../../shared/services/imageAnalysisService';
import {getMakeupLookPreview} from '../../../shared/services/makeupService';
import {getLikedProductPreview} from '../../../shared/services/productService';
import {getUserProfile} from '../../../shared/services/userService';
import {colors, spacing, typography} from '../../../shared/theme';
import type {ImageAnalysisReport} from '../../../shared/types/imageAnalysis';
import type {
  MakeupLook,
  MakeupStylePreview,
  Product,
  UserProfile,
} from '../../../shared/types/myPage';
import {SectionHeader} from '../../../shared/ui';
import {ImageAnalysisSummaryCard} from '../components/ImageAnalysisSummaryCard';
import {MakeupLookCard} from '../components/MakeupLookCard';
import {ProductCard} from '../components/ProductCard';
import {ProfileSummaryCard} from '../components/ProfileSummaryCard';

type MyPageScreenProps = {
  onPressProfileEdit?: () => void;
  onPressImageAnalysisReport?: (reportId: string) => void;
  onPressImageAnalysisReportsList?: () => void;
  onPressMakeupStyleList?: () => void;
  onPressLikedProductList?: () => void;
  savedMakeupStyle?: MakeupStylePreview | null;
};

type MyPageData = {
  profile: UserProfile;
  imageAnalysisReport: ImageAnalysisReport | null;
  makeupLooks: MakeupLook[];
  products: Product[];
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
      getLatestImageAnalysisReport(),
      getMakeupLookPreview(3),
      getLikedProductPreview(3),
    ]).then(([profile, imageAnalysisReport, makeupLooks, products]) => {
      if (isMounted) {
        setData({
          profile,
          imageAnalysisReport,
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
      <View style={styles.loading}>
        <Text style={styles.loadingText}>마이페이지를 불러오는 중이에요.</Text>
      </View>
    );
  }

  const imageAnalysisReport = data.imageAnalysisReport;
  const makeupLooks = savedMakeupStyle
    ? [
        savedMakeupStyle,
        ...data.makeupLooks.filter((look) => look.id !== savedMakeupStyle.id),
      ]
    : data.makeupLooks;
  const previewMakeupLooks = makeupLooks.slice(0, 3);

  return (
    <>
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
    </>
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
  section: {
    gap: spacing.sm,
  },
});
