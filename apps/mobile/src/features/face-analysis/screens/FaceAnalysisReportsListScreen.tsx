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
  onDeleteReport?: (reportId: string) => Promise<void> | void;
  onPressReport?: (reportId: string) => void;
};

export function FaceAnalysisReportsListScreen({
  onDeleteReport,
  onPressReport,
}: FaceAnalysisReportsListScreenProps) {
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttemptKey, setLoadAttemptKey] = useState(0);

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
      .catch((error: unknown) => {
        if (isMounted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : '얼굴 분석 보고서를 불러오지 못했어요.',
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
  }, [loadAttemptKey]);

  const handleDeleteReport = useCallback(
    async (reportId: string) => {
      if (!onDeleteReport) {
        return;
      }
      await onDeleteReport(reportId);
      setReports(current => current.filter(report => report.id !== reportId));
    },
    [onDeleteReport],
  );

  const renderItem = useCallback(
    ({item}: {item: FaceAnalysisReport}) => (
      <FaceAnalysisReportCard
        onDelete={
          onDeleteReport ? () => handleDeleteReport(item.id) : undefined
        }
        onPress={() => onPressReport?.(item.id)}
        report={item}
      />
    ),
    [handleDeleteReport, onDeleteReport, onPressReport],
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
                <ActivityIndicator color={colors.textPrimary} size="small" />
                <Text style={styles.emptyStateText}>
                  얼굴 분석 보고서를 불러오는 중이에요.
                </Text>
              </>
            ) : loadError ? (
              <>
                <Text style={styles.emptyStateText}>{loadError}</Text>
                <Pressable
                  accessibilityLabel="얼굴 분석 보고서 다시 불러오기"
                  accessibilityRole="button"
                  onPress={() => setLoadAttemptKey(current => current + 1)}
                  style={({pressed}) => [
                    styles.retryButton,
                    pressed && styles.retryButtonPressed,
                  ]}>
                  <Text style={styles.retryButtonText}>다시 불러오기</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.emptyStateText}>
                저장된 얼굴 분석 결과가 없어요.
              </Text>
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
    gap: spacing.md,
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
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  retryButtonPressed: {
    opacity: 0.74,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
});
