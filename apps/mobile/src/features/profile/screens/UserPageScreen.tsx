import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ScrollView, Text, View } from 'tamagui';

import { getUserPageData } from '../../../shared/services/userPageService';
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
}

export const UserPageScreen = ({
  onPressSettings,
  onPressReport,
  onPressReports,
  onPressMakeupStyles,
  onPressFavoriteProducts,
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
