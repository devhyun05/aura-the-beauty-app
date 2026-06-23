import { useEffect, useMemo, useState } from 'react';
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

const PAGE_SIZE = 5;

export const AnalysisResultsScreen = ({
  onBack,
  onPressResult,
}: AnalysisResultsScreenProps) => {
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pageResults = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;

    return results.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, results]);

  const handlePreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  };

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
          <Text style={styles.eyebrow}>ANALYSIS RESULTS</Text>
          <Text style={styles.title}>분석 결과</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.summaryPanel}>
          <Text style={styles.summaryTitle}>최근 분석 기록</Text>
          <Text style={styles.summaryCaption}>
            저장된 분석 결과를 5개씩 날짜순으로 관리해요.
          </Text>
        </View>

        {results.length > 0 ? (
          <>
            <View style={styles.list}>
              {pageResults.map((result) => (
                <AnalysisResultHistoryCard
                  key={result.id}
                  onPress={() => onPressResult?.(result.id)}
                  result={result}
                />
              ))}
            </View>

            <View style={styles.pagination}>
              <Pressable
                accessibilityLabel="이전 분석 결과 페이지"
                accessibilityRole="button"
                disabled={currentPage === 1}
                onPress={handlePreviousPage}
                style={[
                  styles.pageButton,
                  currentPage === 1 ? styles.pageButtonDisabled : null,
                ]}
              >
                <ChevronLeftIcon />
              </Pressable>

              <View style={styles.pageIndicatorGroup}>
                {Array.from({ length: totalPages }, (_, index) => {
                  const page = index + 1;
                  const isActive = page === currentPage;

                  return (
                    <Pressable
                      accessibilityLabel={`${page}페이지로 이동`}
                      accessibilityRole="button"
                      key={page}
                      onPress={() => setCurrentPage(page)}
                      style={[
                        styles.pageNumber,
                        isActive ? styles.pageNumberActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pageNumberText,
                          isActive ? styles.pageNumberTextActive : null,
                        ]}
                      >
                        {page}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                accessibilityLabel="다음 분석 결과 페이지"
                accessibilityRole="button"
                disabled={currentPage === totalPages}
                onPress={handleNextPage}
                style={[
                  styles.pageButton,
                  currentPage === totalPages ? styles.pageButtonDisabled : null,
                ]}
              >
                <ChevronRightIcon />
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>저장된 분석 결과가 없어요</Text>
            <Text style={styles.emptyDescription}>
              촬영을 완료하면 이곳에서 분석 기록을 다시 확인할 수 있어요.
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

function ChevronLeftIcon() {
  return (
    <View pointerEvents="none" style={styles.pageChevronIcon}>
      <View style={[styles.pageChevronLine, styles.pageChevronLeftTop]} />
      <View style={[styles.pageChevronLine, styles.pageChevronLeftBottom]} />
    </View>
  );
}

function ChevronRightIcon() {
  return (
    <View pointerEvents="none" style={styles.pageChevronIcon}>
      <View style={[styles.pageChevronLine, styles.pageChevronRightTop]} />
      <View style={[styles.pageChevronLine, styles.pageChevronRightBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  header: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    borderBottomColor: userPageColors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: userPageSpacing.screenX,
  },
  headerText: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    marginRight: 38,
    minWidth: 0,
  },
  list: {
    gap: 8,
  },
  pageButton: {
    alignItems: 'center',
    borderColor: userPageColors.borderSubtle,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  pageButtonDisabled: {
    borderColor: userPageColors.borderSubtle,
    opacity: 0.35,
  },
  pageChevronIcon: {
    height: 18,
    position: 'relative',
    width: 18,
  },
  pageChevronLeftBottom: {
    left: 4,
    top: 10,
    transform: [{ rotate: '45deg' }],
  },
  pageChevronLeftTop: {
    left: 4,
    top: 6,
    transform: [{ rotate: '-45deg' }],
  },
  pageChevronLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    position: 'absolute',
    width: 9,
  },
  pageChevronRightBottom: {
    right: 4,
    top: 10,
    transform: [{ rotate: '-45deg' }],
  },
  pageChevronRightTop: {
    right: 4,
    top: 6,
    transform: [{ rotate: '45deg' }],
  },
  pageIndicatorGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pageNumber: {
    alignItems: 'center',
    borderColor: userPageColors.borderSubtle,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  pageNumberActive: {
    backgroundColor: userPageColors.text,
    borderColor: userPageColors.text,
  },
  pageNumberText: {
    color: userPageColors.text,
    fontSize: userPageTypography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  pageNumberTextActive: {
    color: userPageColors.surface,
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    paddingTop: 2,
  },
  screen: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 48,
    paddingHorizontal: userPageSpacing.screenX,
    paddingTop: 16,
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
  summaryPanel: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  summaryTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 24,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
});
