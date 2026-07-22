import {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {FaceAnalysisReportCard} from '../components/FaceAnalysisReportCard';

type FaceAnalysisReportsListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onPressReport?: (reportId: string) => void;
};

export function FaceAnalysisReportsListScreen({
  onPressReport,
}: FaceAnalysisReportsListScreenProps) {
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  const retryLoadReports = useCallback(() => {
    setLoadAttempt(currentAttempt => currentAttempt + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError('');

    void getFaceAnalysisReports()
      .then((nextReports) => {
        if (isMounted) {
          setReports(nextReports);
        }
      })
      .catch(error => {
        if (isMounted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : '얼굴 분석 결과를 불러오지 못했어요.',
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadAttempt]);

  const renderItem = useCallback(
    ({item}: {item: FaceAnalysisReport}) => (
      <FaceAnalysisReportCard
        onPress={() => onPressReport?.(item.id)}
        report={item}
      />
    ),
    [onPressReport],
  );

  // 목록은 서버 상한(기본 50)까지 커질 수 있어 .map 대신 FlatList로 가상화한다.
  return (
    <AppScreen scroll={false} topPadding="belowOverlayHeader">
      <FlatList
        contentContainerStyle={styles.listContent}
        data={reports}
        keyExtractor={(report) => report.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {isLoading ? (
              <>
                <ActivityIndicator color={colors.textPrimary} />
                <Text style={styles.emptyStateText}>얼굴 분석 결과를 불러오고 있어요.</Text>
              </>
            ) : loadError ? (
              <>
                <Text style={styles.emptyStateTitle}>결과를 불러오지 못했어요</Text>
                <Text style={styles.emptyStateText}>{loadError}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={retryLoadReports}
                  style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>다시 시도하기</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.emptyStateText}>저장된 얼굴 분석 결과가 없어요.</Text>
            )}
          </View>
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
    width: '100%',
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyStateTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: 999,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
});
