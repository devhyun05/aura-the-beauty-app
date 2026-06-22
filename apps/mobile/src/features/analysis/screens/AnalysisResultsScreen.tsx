import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'tamagui';

import { getAnalysisResults } from '../../../shared/services/analysisResultService';
import {
  userPageColors,
  userPageRadius,
  userPageSpacing,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { AnalysisResult } from '../../../shared/types/analysis';
import { AnalysisResultHistoryCard } from '../components/AnalysisResultHistoryCard';

interface AnalysisResultsScreenProps {
  onBack?: () => void;
  onPressResult?: (resultId: string) => void;
}

export const AnalysisResultsScreen = ({
  onBack,
  onPressResult,
}: AnalysisResultsScreenProps) => {
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState<AnalysisResult[]>([]);

  useEffect(() => {
    let isMounted = true;

    getAnalysisResults().then((analysisResults) => {
      if (isMounted) {
        setResults(analysisResults);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const latestResult = results[0];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable
          accessibilityLabel="분석 결과 목록에서 뒤로가기"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <BackIcon />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>ANALYSIS REPORTS</Text>
          <Text style={styles.title}>분석 결과</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.summaryPanel}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>맞춤 분석 보고서</Text>
            <Text style={styles.summaryCaption}>
              지금까지 저장된 분석 보고서를 날짜순으로 확인할 수 있어요.
            </Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{results.length}</Text>
              <Text style={styles.summaryLabel}>저장 기록</Text>
            </View>

            <View style={styles.summaryItem}>
              <Text numberOfLines={1} style={styles.summaryValue}>
                {latestResult?.analyzedAt ?? '-'}
              </Text>
              <Text style={styles.summaryLabel}>최근 분석</Text>
            </View>
          </View>
        </View>

        {results.length > 0 ? (
          <View style={styles.list}>
            {results.map((result) => (
              <AnalysisResultHistoryCard
                key={result.id}
                onPress={() => onPressResult?.(result.id)}
                result={result}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>저장된 분석 결과가 없어요</Text>
            <Text style={styles.emptyDescription}>
              촬영을 완료하면 이곳에서 모든 분석 기록을 다시 확인할 수 있어요.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

function BackIcon() {
  return (
    <View pointerEvents="none" style={styles.backIcon}>
      <View style={[styles.backLine, styles.backLineTop]} />
      <View style={[styles.backLine, styles.backLineBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  backIcon: {
    height: 22,
    position: 'relative',
    width: 22,
  },
  backLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    left: 4,
    position: 'absolute',
    width: 14,
  },
  backLineBottom: {
    top: 13,
    transform: [{ rotate: '45deg' }],
  },
  backLineTop: {
    top: 5,
    transform: [{ rotate: '-45deg' }],
  },
  emptyDescription: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    gap: 8,
    padding: 28,
  },
  emptyTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 24,
  },
  eyebrow: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    fontWeight: '700',
    letterSpacing: 1.2,
    lineHeight: 16,
  },
  header: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    borderBottomColor: userPageColors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 14,
    paddingHorizontal: userPageSpacing.screenX,
  },
  headerText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  list: {
    gap: 18,
  },
  screen: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  scrollContent: {
    gap: 20,
    paddingBottom: 48,
    paddingHorizontal: userPageSpacing.screenX,
    paddingTop: 18,
  },
  scrollView: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  summaryCaption: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 22,
  },
  summaryGrid: {
    borderTopColor: userPageColors.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
  },
  summaryHeader: {
    gap: 8,
  },
  summaryItem: {
    flex: 1,
    gap: 4,
  },
  summaryLabel: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
  },
  summaryNumber: {
    color: userPageColors.text,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
  },
  summaryPanel: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    gap: 16,
    padding: 18,
  },
  summaryTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 24,
  },
  summaryValue: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 24,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.title,
    fontWeight: '700',
    lineHeight: 30,
  },
});
