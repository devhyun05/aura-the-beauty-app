import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { ChevronRight, ShoppingBag, Sparkles } from 'lucide-react-native';
import { ScrollView, Text, View } from 'tamagui';

import { getUserPageData } from '../../../shared/services/userPageService';
import { colors, iconSize, typography } from '../../../shared/theme';
import { userPageColors, userPageSpacing } from '../../../shared/theme/tokens';
import type { UserPageData } from '../../../shared/types/userPage';
import { AnalysisReportPreviewCard } from '../components/AnalysisReportPreviewCard';
import { FavoriteProductCard } from '../components/FavoriteProductCard';
import { MakeupStyleCard } from '../components/MakeupStyleCard';
import { ProfileSummaryCard } from '../components/ProfileSummaryCard';
import { SectionHeader } from '../components/SectionHeader';

interface UserPageScreenProps {
  onPressSettings?: () => void;
  onPressReport?: (reportId: string) => void;
  onPressReports?: () => void;
  onPressMakeupStyles?: () => void;
  onPressFavoriteProducts?: () => void;
  onPressProductRecommendations?: () => void;
}

export const UserPageScreen = ({
  onPressSettings,
  onPressReport,
  onPressReports,
  onPressMakeupStyles,
  onPressFavoriteProducts,
  onPressProductRecommendations,
}: UserPageScreenProps) => {
  const [userPageData, setUserPageData] = useState<UserPageData | null>(null);

  useEffect(() => {
    let isMounted = true;

    getUserPageData().then((data) => {
      if (isMounted) {
        setUserPageData(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!userPageData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>마이페이지를 불러오는 중이에요.</Text>
      </View>
    );
  }

  const recentReports = userPageData.reports.slice(0, 3);
  const previewStyles = userPageData.makeupStyles.slice(0, 3);
  const previewProducts = userPageData.favoriteProducts.slice(0, 3);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.scrollView}
    >
      <View style={styles.container}>
        <ProfileSummaryCard
          onPressSettings={onPressSettings}
          profile={userPageData.profile}
        />

        <ProductRecommendationEntryCard onPress={onPressProductRecommendations} />

        <View style={styles.section}>
          <SectionHeader
            actionLabel="전체보기"
            onPressAction={onPressReports}
            title="분석 결과"
          />

          <View style={styles.reportList}>
            {recentReports.map((report) => (
              <AnalysisReportPreviewCard
                key={report.id}
                onPress={() => onPressReport?.(report.id)}
                report={report}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            actionLabel="전체보기"
            onPressAction={onPressMakeupStyles}
            title="메이크업 스타일"
          />

          <View style={styles.styleList}>
            {previewStyles.map((style) => (
              <MakeupStyleCard key={style.id} style={style} />
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.productSection}>
          <SectionHeader
            actionLabel="전체보기"
            onPressAction={onPressFavoriteProducts}
            title="좋아요한 제품목록"
          />

          <View style={styles.productList}>
            {previewProducts.map((product) => (
              <FavoriteProductCard key={product.id} product={product} />
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

function ProductRecommendationEntryCard({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityLabel="AI 제품 추천 페이지로 이동"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.recommendationCard,
        {
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
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
          최근 분석 톤에 맞는 립, 블러셔, 섀도우 제품을 바로 확인해보세요.
        </Text>
      </View>

      <View style={styles.recommendationArrow}>
        <ChevronRight color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: userPageSpacing.sectionGap,
    minHeight: 874,
    paddingBottom: 64,
    paddingHorizontal: userPageSpacing.screenX,
    paddingTop: 88,
  },
  divider: {
    backgroundColor: userPageColors.divider,
    height: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: userPageColors.textMuted,
    fontSize: 15,
  },
  productList: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 18,
  },
  productSection: {
    gap: 18,
  },
  reportList: {
    gap: 10,
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
    gap: 14,
    padding: 18,
  },
  recommendationCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  recommendationDescription: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recommendationEyebrow: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
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
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  scrollView: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  section: {
    gap: userPageSpacing.cardGap,
  },
  styleList: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
