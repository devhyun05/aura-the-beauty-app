import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Trash2,
  X as XIcon,
} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {
  deleteFaceAnalysisRecommendedMakeup,
  getFaceAnalysisReports,
} from '../../../shared/services/faceAnalysisService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceAnalysisMakeupCard,
  FaceAnalysisReport,
} from '../../../shared/types/faceAnalysis';
import {AppScreen, ImagePlaceholder} from '../../../shared/ui';

type SavedMakeupListScreenProps = {
  latestAnalysisReport?: FaceAnalysisReport | null;
  onPressMakeup?: (makeup: SavedRecommendedMakeup) => void;
};

export type SavedRecommendedMakeup = {
  id: string;
  makeup: FaceAnalysisMakeupCard;
  makeupIndex: number;
  report: FaceAnalysisReport;
  reportAnalyzedAt: string;
  reportId: string;
  reportMood: string;
  reportTitle: string;
};

const SAVED_MAKEUP_PAGE_SIZE = 4;

export function SavedMakeupListScreen({
  latestAnalysisReport,
  onPressMakeup,
}: SavedMakeupListScreenProps) {
  const {width} = useWindowDimensions();
  const [deletingMakeupIds, setDeletingMakeupIds] = useState<Set<string>>(() => new Set());
  const [reports, setReports] = useState<FaceAnalysisReport[]>(
    latestAnalysisReport ? [latestAnalysisReport] : [],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

  const loadReports = useCallback(() => {
    let isMounted = true;

    getFaceAnalysisReports({
      limit: 80,
      withRecommendedMakeups: true,
    })
      .then(nextReports => {
        if (!isMounted) {
          return;
        }

        setReports(mergeLatestReportWithReports(latestAnalysisReport, nextReports));
      })
      .catch(error => {
        console.info('[aura:home] saved-makeup-list:fallback-latest', {
          message: error instanceof Error ? error.message : String(error),
        });

        if (isMounted) {
          setReports(latestAnalysisReport ? [latestAnalysisReport] : []);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [latestAnalysisReport]);

  useFocusEffect(loadReports);

  const savedMakeups = useMemo(
    () => reports.flatMap(report => mapReportToSavedMakeups(report)),
    [reports],
  );
  const filteredMakeups = useMemo(
    () => filterSavedRecommendedMakeups(savedMakeups, searchQuery),
    [savedMakeups, searchQuery],
  );
  const totalPages = getSavedMakeupPageCount(filteredMakeups.length);
  const pageMakeups = useMemo(
    () => paginateSavedRecommendedMakeups(filteredMakeups, currentPage),
    [currentPage, filteredMakeups],
  );
  const resultCountLabel =
    searchQuery.trim().length > 0
      ? `검색 결과 ${filteredMakeups.length}개`
      : `전체 ${filteredMakeups.length}개`;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    prefetchSavedMakeupImages(
      filteredMakeups.slice(
        (currentPage - 1) * SAVED_MAKEUP_PAGE_SIZE,
        (currentPage + 1) * SAVED_MAKEUP_PAGE_SIZE,
      ),
    );
  }, [currentPage, filteredMakeups]);

  const handleDeleteMakeup = useCallback((savedMakeup: SavedRecommendedMakeup) => {
    if (deletingMakeupIds.has(savedMakeup.id)) {
      return;
    }

    setDeletingMakeupIds(currentIds => new Set(currentIds).add(savedMakeup.id));
    setReports(currentReports => removeSavedMakeupFromReports(currentReports, savedMakeup));

    deleteFaceAnalysisRecommendedMakeup({
      makeupIndex: savedMakeup.makeupIndex,
      reportId: savedMakeup.reportId,
    })
      .then(updatedReport => {
        setReports(currentReports =>
          updatedReport
            ? currentReports.map(report =>
                report.id === updatedReport.id ? updatedReport : report,
              )
            : removeSavedMakeupFromReports(currentReports, savedMakeup),
        );
      })
      .catch(error => {
        console.info('[aura:home] saved-makeup:delete-failed', {
          makeupIndex: savedMakeup.makeupIndex,
          message: error instanceof Error ? error.message : String(error),
          reportId: savedMakeup.reportId,
        });
      })
      .finally(() => {
        setDeletingMakeupIds(currentIds => {
          const nextIds = new Set(currentIds);
          nextIds.delete(savedMakeup.id);
          return nextIds;
        });
      });
  }, [deletingMakeupIds]);

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <YStack style={styles.searchGroup}>
        <XStack style={styles.searchBox}>
          <Search color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
          <TextInput
            accessibilityLabel="저장된 메이크업 검색"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchQuery}
            placeholder="메이크업 이름, 무드 검색"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              accessibilityLabel="검색어 지우기"
              accessibilityRole="button"
              onPress={() => setSearchQuery('')}
              style={({pressed}) => [styles.clearSearchButton, pressed && styles.pressed]}>
              <XIcon color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
            </Pressable>
          ) : null}
        </XStack>
        <Text style={styles.resultCount}>{resultCountLabel}</Text>
      </YStack>

      <View style={[styles.grid, {columnGap: gap, rowGap: spacing.xl}]}>
        {pageMakeups.length > 0 ? (
          pageMakeups.map(savedMakeup => (
            <SavedMakeupCard
              key={savedMakeup.id}
              deleting={deletingMakeupIds.has(savedMakeup.id)}
              onDeleteMakeup={handleDeleteMakeup}
              onPressMakeup={onPressMakeup}
              savedMakeup={savedMakeup}
              width={cardWidth}
            />
          ))
        ) : (
          <EmptySavedMakeupState hasSearchQuery={searchQuery.trim().length > 0} />
        )}
      </View>

      {filteredMakeups.length > SAVED_MAKEUP_PAGE_SIZE ? (
        <PaginationControls
          currentPage={currentPage}
          onNext={() => setCurrentPage(page => Math.min(page + 1, totalPages))}
          onPrevious={() => setCurrentPage(page => Math.max(page - 1, 1))}
          totalPages={totalPages}
        />
      ) : null}
    </AppScreen>
  );
}

function mergeLatestReportWithReports(
  latestReport: FaceAnalysisReport | null | undefined,
  reports: readonly FaceAnalysisReport[],
): FaceAnalysisReport[] {
  if (!latestReport) {
    return [...reports];
  }

  return [
    latestReport,
    ...reports.filter(report => report.id !== latestReport.id),
  ];
}

function mapReportToSavedMakeups(report: FaceAnalysisReport): SavedRecommendedMakeup[] {
  return getStoredRecommendedMakeups(report).map((makeup, index) => ({
    id: `${report.id}-${makeup.id}-${index}`,
    makeup,
    makeupIndex: index,
    report,
    reportAnalyzedAt: report.analyzedAt,
    reportId: report.id,
    reportMood: report.recommendedMood,
    reportTitle: report.title,
  }));
}

function getStoredRecommendedMakeups(
  report: FaceAnalysisReport,
): FaceAnalysisMakeupCard[] {
  return report.recommendedMakeups.slice(0, 3);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR');
}

export function filterSavedRecommendedMakeups(
  makeups: readonly SavedRecommendedMakeup[],
  query: string,
): SavedRecommendedMakeup[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [...makeups];
  }

  return makeups.filter(savedMakeup => {
    const searchableText = normalizeSearchText(
      [
        savedMakeup.makeup.title,
        savedMakeup.makeup.subtitle,
        savedMakeup.makeup.description,
        savedMakeup.makeup.tags.join(' '),
        savedMakeup.reportMood,
        savedMakeup.reportTitle,
        savedMakeup.reportAnalyzedAt,
      ].join(' '),
    );

    return searchableText.includes(normalizedQuery);
  });
}

export function getSavedMakeupPageCount(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / SAVED_MAKEUP_PAGE_SIZE));
}

export function paginateSavedRecommendedMakeups(
  makeups: readonly SavedRecommendedMakeup[],
  page: number,
): SavedRecommendedMakeup[] {
  const safePage = Math.max(1, page);
  const startIndex = (safePage - 1) * SAVED_MAKEUP_PAGE_SIZE;

  return makeups.slice(startIndex, startIndex + SAVED_MAKEUP_PAGE_SIZE);
}

function getImageSourceUri(source: ImageSourcePropType): string | null {
  if (typeof source === 'object' && source !== null && 'uri' in source) {
    const uri = source.uri;

    return typeof uri === 'string' && uri.trim() ? uri : null;
  }

  return null;
}

export function prefetchSavedMakeupImages(makeups: readonly SavedRecommendedMakeup[]): void {
  makeups.forEach(savedMakeup => {
    const uri = getImageSourceUri(savedMakeup.makeup.imageSource);

    if (uri) {
      void Image.prefetch(uri);
    }
  });
}

function removeSavedMakeupFromReports(
  reports: readonly FaceAnalysisReport[],
  savedMakeup: SavedRecommendedMakeup,
): FaceAnalysisReport[] {
  return reports.map(report => {
    if (report.id !== savedMakeup.reportId) {
      return report;
    }

    return {
      ...report,
      recommendedMakeups: report.recommendedMakeups.filter(
        (_, index) => index !== savedMakeup.makeupIndex,
      ),
    };
  });
}

function EmptySavedMakeupState({hasSearchQuery}: {hasSearchQuery: boolean}) {
  return (
    <YStack style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {hasSearchQuery ? '검색 결과가 없어요' : '저장된 추천 메이크업이 없어요'}
      </Text>
      <Text style={styles.emptyDescription}>
        {hasSearchQuery
          ? '다른 메이크업 이름이나 무드로 다시 검색해보세요.'
          : '얼굴 진단을 완료하면 분석마다 생성된 추천 메이크업 3장이 계정에 계속 쌓여요.'}
      </Text>
    </YStack>
  );
}

function PaginationControls({
  currentPage,
  onNext,
  onPrevious,
  totalPages,
}: {
  currentPage: number;
  onNext: () => void;
  onPrevious: () => void;
  totalPages: number;
}) {
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <XStack style={styles.pagination}>
      <Pressable
        accessibilityLabel="이전 페이지"
        accessibilityRole="button"
        disabled={isFirstPage}
        onPress={onPrevious}
        style={({pressed}) => [
          styles.pageButton,
          isFirstPage && styles.pageButtonDisabled,
          pressed && !isFirstPage && styles.pressed,
        ]}>
        <ChevronLeft
          color={isFirstPage ? colors.textTertiary : colors.textPrimary}
          size={iconSize.sm}
          strokeWidth={2}
        />
      </Pressable>

      <Text style={styles.pageIndicator}>
        {currentPage} / {totalPages}
      </Text>

      <Pressable
        accessibilityLabel="다음 페이지"
        accessibilityRole="button"
        disabled={isLastPage}
        onPress={onNext}
        style={({pressed}) => [
          styles.pageButton,
          isLastPage && styles.pageButtonDisabled,
          pressed && !isLastPage && styles.pressed,
        ]}>
        <ChevronRight
          color={isLastPage ? colors.textTertiary : colors.textPrimary}
          size={iconSize.sm}
          strokeWidth={2}
        />
      </Pressable>
    </XStack>
  );
}

function SavedMakeupCard({
  deleting,
  onDeleteMakeup,
  onPressMakeup,
  savedMakeup,
  width,
}: {
  deleting: boolean;
  onDeleteMakeup: (makeup: SavedRecommendedMakeup) => void;
  onPressMakeup?: (makeup: SavedRecommendedMakeup) => void;
  savedMakeup: SavedRecommendedMakeup;
  width: number;
}) {
  return (
    <View style={[styles.card, {width}]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder
          borderRadius={radius.md}
          resizeMode="cover"
          source={savedMakeup.makeup.imageSource}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${savedMakeup.makeup.title} 분석 결과 보기`}
          onPress={() => onPressMakeup?.(savedMakeup)}
          style={({pressed}) => [styles.imageTapTarget, pressed && styles.pressed]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${savedMakeup.makeup.title} 삭제`}
          disabled={deleting}
          onPress={() => onDeleteMakeup(savedMakeup)}
          style={({pressed}) => [
            styles.deleteButton,
            deleting && styles.deleteButtonDisabled,
            pressed && !deleting && styles.pressed,
          ]}>
          <Trash2 color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        </Pressable>
      </View>

      <YStack style={styles.textArea}>
        <Text numberOfLines={1} style={styles.title}>
          {savedMakeup.makeup.title}
        </Text>
        <Text numberOfLines={1} style={styles.mood}>
          {savedMakeup.makeup.subtitle || savedMakeup.reportMood}
        </Text>
      </YStack>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  clearSearchButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 32,
    zIndex: 2,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  emptyDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xl,
    width: '100%',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageArea: {
    aspectRatio: 0.82,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  imageTapTarget: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  mood: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.78,
  },
  pageButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  pageButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  pageIndicator: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minWidth: 54,
    textAlign: 'center',
  },
  pagination: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  resultCount: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  searchGroup: {
    gap: spacing.xs,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 42,
    padding: 0,
  },
  textArea: {
    gap: spacing.xs,
    minHeight: typography.lineHeight.sm + typography.lineHeight.xs + spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
