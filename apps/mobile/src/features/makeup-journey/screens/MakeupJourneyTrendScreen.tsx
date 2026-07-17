import {useCallback, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {ArrowLeft, ChevronLeft, ChevronRight, RefreshCw} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import {JourneyScoreChart} from '../components/JourneyScoreChart';
import {useMakeupJourneyTrend} from '../hooks/useMakeupJourneyTrend';
import type {MakeupJourneyTrendRange, MakeupJourneyTrendSummary} from '../types';
import {
  formatJourneyDate,
  formatJourneyMonth,
  getCurrentMonthString,
  getJourneyTrendEndDateForMonth,
  getJourneyTrendStartDate,
  getMonthFromDate,
  shiftMonth,
} from '../utils/date';

const RANGE_OPTIONS: Array<{label: string; value: MakeupJourneyTrendRange}> = [
  {label: '7일', value: '7d'},
  {label: '30일', value: '30d'},
  {label: '3개월', value: '90d'},
];

export type MakeupJourneyTrendScreenProps = {
  entryDate: string;
  initialRange?: MakeupJourneyTrendRange;
  onBackToDetail: () => void;
};

function SummaryGrid({summary}: {summary: MakeupJourneyTrendSummary}) {
  const items = [
    {label: '첫 점수', value: summary.firstScore},
    {label: '최신 점수', value: summary.latestScore},
    {label: '최고 점수', value: summary.highestScore},
    {label: '평균 점수', value: summary.averageScore},
  ];
  return (
    <View style={styles.summaryGrid}>
      {items.map(item => (
        <View accessibilityLabel={`${item.label} ${item.value ?? '기록 없음'}`} key={item.label} style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{item.value === null ? '—' : `${item.value}점`}</Text>
          <Text style={styles.summaryLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function MakeupJourneyTrendScreen({
  entryDate,
  initialRange = '30d',
  onBackToDetail,
}: MakeupJourneyTrendScreenProps) {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<MakeupJourneyTrendRange>(initialRange);
  const [month, setMonth] = useState(() => getMonthFromDate(entryDate));
  const focusCountRef = useRef(0);
  const currentMonth = getCurrentMonthString();
  const endDate = getJourneyTrendEndDateForMonth(month);
  const startDate = getJourneyTrendStartDate(range, endDate);
  const canMoveNext = month < currentMonth;
  const resource = useMakeupJourneyTrend(range, endDate);

  useFocusEffect(
    useCallback(() => {
      if (focusCountRef.current > 0) {
        void resource.refresh();
      }
      focusCountRef.current += 1;
      return undefined;
    }, [resource.refresh]),
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.fixedHeader, {paddingTop: insets.top}]}>
        <Pressable
          accessibilityLabel="날짜 상세로"
          accessibilityRole="button"
          onPress={onBackToDetail}
          style={({pressed}) => [styles.headerAction, pressed ? styles.pressed : null]}>
          <ArrowLeft color={colors.textPrimary} size={18} />
          <Text style={styles.headerActionText}>상세로</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>성장 그래프</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl},
        ]}
        refreshControl={(
          <RefreshControl
            onRefresh={() => void resource.refresh()}
            refreshing={resource.isRefreshing}
            tintColor={colors.textPrimary}
          />
        )}
        showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{formatJourneyDate(startDate)}부터 {formatJourneyDate(endDate)}까지</Text>
          <Text style={styles.title}>점수 변화를 한눈에 확인해요.</Text>
          <Text style={styles.description}>기록이 없는 날짜까지 포함해 실제 시간 간격대로 보여드려요.</Text>
        </View>

        <View accessibilityLabel="성장 그래프 월 선택" style={styles.monthNavigator}>
          <Pressable
            accessibilityLabel="이전 달 그래프 보기"
            accessibilityRole="button"
            onPress={() => setMonth(value => shiftMonth(value, -1))}
            style={({pressed}) => [styles.monthButton, pressed ? styles.pressed : null]}>
            <ChevronLeft color={colors.white} size={22} />
          </Pressable>
          <View style={styles.monthTextGroup}>
            <Text style={styles.monthEyebrow}>월별 성장 기록</Text>
            <Text accessibilityRole="header" style={styles.monthTitle}>{formatJourneyMonth(month)}</Text>
          </View>
          <Pressable
            accessibilityLabel="다음 달 그래프 보기"
            accessibilityRole="button"
            accessibilityState={{disabled: !canMoveNext}}
            disabled={!canMoveNext}
            onPress={() => setMonth(value => shiftMonth(value, 1))}
            style={({pressed}) => [
              styles.monthButton,
              !canMoveNext ? styles.monthButtonDisabled : null,
              pressed ? styles.pressed : null,
            ]}>
            <ChevronRight color={colors.white} size={22} />
          </Pressable>
        </View>

        <View accessibilityLabel="그래프 기간 선택" accessibilityRole="radiogroup" style={styles.rangeSelector}>
          {RANGE_OPTIONS.map(option => {
            const selected = range === option.value;
            return (
              <Pressable
                accessibilityLabel={`${option.label} 그래프`}
                accessibilityRole="radio"
                accessibilityState={{checked: selected}}
                key={option.value}
                onPress={() => setRange(option.value)}
                style={({pressed}) => [
                  styles.rangeButton,
                  selected ? styles.rangeButtonSelected : null,
                  pressed ? styles.pressed : null,
                ]}>
                <Text style={[
                  styles.rangeText,
                  selected ? styles.rangeTextSelected : null,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {resource.isLoading && !resource.data ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={styles.stateTitle}>성장 그래프를 불러오는 중이에요.</Text>
          </View>
        ) : resource.error && !resource.data ? (
          <View style={styles.stateCard}>
            <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>그래프를 불러오지 못했어요.</Text>
            <Text style={styles.stateText}>{resource.error}</Text>
            <Pressable
              accessibilityLabel="성장 그래프 다시 불러오기"
              accessibilityRole="button"
              onPress={() => void resource.refresh()}
              style={({pressed}) => [styles.retryButton, pressed ? styles.pressed : null]}>
              <RefreshCw color={colors.white} size={17} />
              <Text style={styles.retryText}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : resource.data ? (
          <>
            {resource.error ? (
              <Pressable
                accessibilityLabel="새로고침 실패, 다시 시도"
                accessibilityRole="button"
                onPress={() => void resource.refresh()}
                style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{resource.error}</Text>
              </Pressable>
            ) : null}
            <JourneyScoreChart
              endDate={endDate}
              goalScore={resource.data.goalScore}
              points={resource.data.points}
              startDate={startDate}
            />
            <View style={styles.goalNotice}>
              <Text style={styles.goalNoticeTitle}>
                {resource.data.goalScore === null
                  ? '목표 미설정'
                  : `현재 목표 ${resource.data.goalScore}점`}
              </Text>
              <Text style={styles.goalNoticeText}>
                {resource.data.goalScore === null
                  ? '메이크업 성장 설정을 저장하면 목표선과 달성 상태를 볼 수 있어요.'
                  : '목표를 바꿔도 점수는 유지되고 상태 색과 목표선만 새 기준으로 바뀌어요.'}
              </Text>
            </View>
            <SummaryGrid summary={resource.data.summary} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.xl,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  fixedHeader: {
    alignItems: 'center',
    backgroundColor: colors.headerSurface,
    borderBottomColor: colors.headerOverlayBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  goalNotice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  goalNoticeText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  goalNoticeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  headerAction: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
  },
  headerActionText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  headerSpacer: {
    flex: 1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  inlineError: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  inlineErrorText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  intro: {
    gap: spacing.sm,
  },
  monthButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  monthButtonDisabled: {
    opacity: 0.28,
  },
  monthEyebrow: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  monthNavigator: {
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  monthTextGroup: {
    alignItems: 'center',
    gap: 2,
  },
  monthTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  pressed: {
    opacity: 0.72,
  },
  rangeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  rangeButtonSelected: {
    backgroundColor: colors.blackSurface,
  },
  rangeSelector: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  rangeText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  rangeTextSelected: {
    color: colors.white,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 260,
    padding: spacing.xl,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  stateTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryItem: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 90,
    justifyContent: 'center',
    padding: spacing.md,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
});
