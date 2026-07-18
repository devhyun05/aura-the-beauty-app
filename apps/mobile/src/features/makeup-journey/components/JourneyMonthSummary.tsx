import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, type LayoutChangeEvent} from 'react-native';
import Svg, {Circle, Line, Path, Text as SvgText} from 'react-native-svg';
import {CalendarDays, Flame, Sparkles, Trophy} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {
  MakeupJourneyCalendarDay,
  MakeupJourneyMonthSummary,
} from '../types';
import {addDays} from '../utils/date';
import {getCappedJourneyGoalProgress} from '../utils/presentation';

const RING_SIZE = 116;
const RING_STROKE = 10;
const WEEKLY_CHART_HEIGHT = 106;
const WEEKLY_CHART_TOP = 18;
const WEEKLY_CHART_BOTTOM = 24;
const WEEKLY_CHART_SIDE = 10;
const JOURNEY_BRIGHT_YELLOW = '#FFD84D';

type JourneyMonthSummaryProps = {
  days: MakeupJourneyCalendarDay[];
  endDate: string;
  goalScore: number | null;
  onOpenTrend: () => void;
  summary?: MakeupJourneyMonthSummary | null;
};

type WeeklyPoint = {
  date: string;
  dayLabel: string;
  score: number | null;
};

function getDayScore(day: MakeupJourneyCalendarDay | undefined): number | null {
  return day?.representativeScore ?? day?.latestScore ?? null;
}

function buildWeeklyPoints(
  days: MakeupJourneyCalendarDay[],
  endDate: string,
): WeeklyPoint[] {
  const dayByDate = new Map(days.map(day => [day.date, day]));
  return Array.from({length: 7}, (_, index) => {
    const date = addDays(endDate, index - 6);
    return {
      date,
      dayLabel: String(Number(date.slice(8, 10))),
      score: getDayScore(dayByDate.get(date)),
    };
  });
}

function scoreToY(score: number): number {
  const drawableHeight = WEEKLY_CHART_HEIGHT - WEEKLY_CHART_TOP - WEEKLY_CHART_BOTTOM;
  return WEEKLY_CHART_TOP + (1 - Math.max(0, Math.min(100, score)) / 100) * drawableHeight;
}

function WeeklyScoreMiniChart({
  days,
  endDate,
}: {
  days: MakeupJourneyCalendarDay[];
  endDate: string;
}) {
  const [width, setWidth] = useState(150);
  const points = useMemo(() => buildWeeklyPoints(days, endDate), [days, endDate]);
  const scoredPoints = points.flatMap((point, index) => {
    if (point.score === null) {
      return [];
    }
    const drawableWidth = Math.max(1, width - WEEKLY_CHART_SIDE * 2);
    return [{
      ...point,
      index,
      x: WEEKLY_CHART_SIDE + (drawableWidth * index) / 6,
      y: scoreToY(point.score),
    }];
  });
  const path = scoredPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const latestPoint = scoredPoints[scoredPoints.length - 1];
  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.max(120, event.nativeEvent.layout.width));
  };

  return (
    <View accessibilityLabel="최근 7일 점수 추이" onLayout={onLayout} style={styles.weeklyChart}>
      <Text style={styles.weeklyTitle}>주간 점수 추이</Text>
      <Svg height={WEEKLY_CHART_HEIGHT} width={width}>
        {[20, 60, 100].map(score => {
          const y = scoreToY(score);
          return (
            <Line
              key={`weekly-grid-${score}`}
              stroke={colors.divider}
              strokeWidth={1}
              x1={WEEKLY_CHART_SIDE}
              x2={width - WEEKLY_CHART_SIDE}
              y1={y}
              y2={y}
            />
          );
        })}
        {path ? (
          <Path
            d={path}
            fill="none"
            stroke={colors.textPrimary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
          />
        ) : null}
        {scoredPoints.map(point => (
          <Circle
            cx={point.x}
            cy={point.y}
            fill={colors.white}
            key={point.date}
            r={4}
            stroke={colors.textPrimary}
            strokeWidth={2.5}
          />
        ))}
        {latestPoint ? (
          <SvgText
            fill={JOURNEY_BRIGHT_YELLOW}
            fontFamily={typography.fontFamily.bold}
            fontSize={10}
            textAnchor="middle"
            x={latestPoint.x}
            y={Math.max(11, latestPoint.y - 8)}>
            {latestPoint.score}점
          </SvgText>
        ) : (
          <SvgText
            fill={colors.textTertiary}
            fontFamily={typography.fontFamily.medium}
            fontSize={10}
            textAnchor="middle"
            x={width / 2}
            y={50}>
            최근 기록 없음
          </SvgText>
        )}
        {points.map((point, index) => (
          <SvgText
            fill={colors.textSecondary}
            fontFamily={typography.fontFamily.regular}
            fontSize={9}
            key={`weekly-label-${point.date}`}
            textAnchor="middle"
            x={WEEKLY_CHART_SIDE + ((width - WEEKLY_CHART_SIDE * 2) * index) / 6}
            y={WEEKLY_CHART_HEIGHT - 5}>
            {point.dayLabel}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function GoalProgressRing({
  goalScore,
  progress,
}: {
  goalScore: number | null;
  progress: number;
}) {
  const radiusValue = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <View
      accessibilityLabel={goalScore === null
        ? '목표 점수 미설정'
        : `목표 ${goalScore}점, 달성률 ${progress}퍼센트`}
      style={styles.ringContainer}>
      <Svg height={RING_SIZE} width={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          fill="none"
          r={radiusValue}
          stroke={colors.surfaceMuted}
          strokeWidth={RING_STROKE}
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          fill="none"
          r={radiusValue}
          stroke={JOURNEY_BRIGHT_YELLOW}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={RING_STROKE}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringContent}>
        <Text style={styles.ringGoal}>
          {goalScore === null ? '목표 미설정' : `목표 ${goalScore}점`}
        </Text>
        <Text style={styles.ringValue}>{goalScore === null ? '—' : `${progress}%`}</Text>
        <Text style={styles.ringCaption}>달성률</Text>
      </View>
    </View>
  );
}

export function JourneyMonthSummary({
  days,
  endDate,
  goalScore,
  onOpenTrend,
  summary,
}: JourneyMonthSummaryProps) {
  const averageScore = summary?.averageScore ?? null;
  const recordedDays = summary?.recordedDays ?? 0;
  const currentStreak = summary?.currentStreak ?? 0;
  const highestScore = days.reduce<number | null>((highest, day) => {
    const score = getDayScore(day);
    if (score === null) {
      return highest;
    }
    return highest === null ? score : Math.max(highest, score);
  }, null);
  const goalDifference = averageScore !== null && goalScore !== null
    ? averageScore - goalScore
    : null;
  const progress = getCappedJourneyGoalProgress(averageScore, goalScore);
  const hasReachedGoal = goalDifference !== null && goalDifference >= 0;
  const insight = averageScore === null
    ? '첫 피드백을 남기면 이달의 변화가 시작돼요.'
    : goalScore === null
      ? '목표 점수를 설정하면 달성 흐름을 함께 보여드려요.'
      : hasReachedGoal
        ? goalDifference === 0
          ? '이번 달 평균이 목표에 정확히 도달했어요.'
          : `목표보다 ${goalDifference}점 높게 달성했어요.`
        : `목표까지 ${Math.abs(goalDifference ?? 0)}점 남았어요.`;
  const metrics = [
    {
      color: colors.textPrimary,
      icon: CalendarDays,
      label: '기록한 날',
      value: `${recordedDays}일`,
    },
    {
      color: colors.textSecondary,
      icon: Flame,
      label: '연속 기록',
      value: `${currentStreak}일`,
    },
    {
      color: JOURNEY_BRIGHT_YELLOW,
      icon: Trophy,
      label: '최고 점수',
      value: highestScore === null ? '—' : `${highestScore}점`,
    },
  ];

  return (
    <View accessibilityLabel="이번 달 성장 요약" style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.eyebrow}>MONTHLY REVIEW</Text>
          <Text style={styles.title}>이번 달 성장 리포트</Text>
        </View>
        <Sparkles color={JOURNEY_BRIGHT_YELLOW} size={24} strokeWidth={1.7} />
      </View>

      <View style={styles.heroRow}>
        <View style={styles.heroText}>
          <Text style={styles.averageLabel}>메이크업 평균 점수</Text>
          <View style={styles.averageRow}>
            <Text style={styles.averageValue}>{averageScore ?? '—'}</Text>
            {averageScore !== null ? <Text style={styles.averageUnit}>점</Text> : null}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.insight}>{insight}</Text>
        </View>
        <GoalProgressRing goalScore={goalScore} progress={progress} />
      </View>

      {goalScore !== null ? (
        <View accessibilityLabel={`목표 진행률 ${progress}퍼센트`} style={styles.progressSection}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {width: `${progress}%`}]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressText}>
              {averageScore === null ? '아직 평균 없음' : `평균 ${averageScore}점`}
            </Text>
            <Text style={styles.progressGoal}>목표 {goalScore}점</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.insightsRow}>
        <Pressable
          accessibilityHint="분석 페이지로 이동합니다"
          accessibilityLabel="주간 점수 추이 분석 보기"
          accessibilityRole="button"
          onPress={onOpenTrend}
          style={({pressed}) => [styles.weeklyCard, pressed ? styles.weeklyCardPressed : null]}>
          <WeeklyScoreMiniChart days={days} endDate={endDate} />
        </Pressable>
        <View style={styles.metricRow}>
          {metrics.map(item => {
            const MetricIcon = item.icon;
            return (
              <View
                accessibilityLabel={`${item.label} ${item.value}`}
                key={item.label}
                style={styles.metricItem}>
                <MetricIcon color={item.color} size={20} strokeWidth={1.9} />
                <Text style={styles.metricLabel}>{item.label}</Text>
                <Text style={[styles.metricValue, {color: item.color}]}>{item.value}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  averageLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  averageRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  averageUnit: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    paddingBottom: 6,
  },
  averageValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 52,
    lineHeight: 58,
  },
  container: {
    ...shadows.soft,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.6,
    lineHeight: 14,
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  heroText: {
    flex: 1,
    gap: spacing.xs,
  },
  insight: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  insightsRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricItem: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: spacing.sm,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  metricRow: {
    flex: 1.15,
    flexDirection: 'row',
    gap: 5,
  },
  metricValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  progressFill: {
    backgroundColor: JOURNEY_BRIGHT_YELLOW,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressGoal: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  progressMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressSection: {
    gap: spacing.sm,
  },
  progressText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden',
  },
  ringCaption: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 9,
    lineHeight: 12,
  },
  ringContainer: {
    alignItems: 'center',
    height: RING_SIZE,
    justifyContent: 'center',
    width: RING_SIZE,
  },
  ringContent: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  ringGoal: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 9,
    lineHeight: 12,
  },
  ringValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  titleGroup: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weeklyCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flex: 1.35,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  weeklyCardPressed: {
    opacity: 0.66,
  },
  weeklyChart: {
    flex: 1,
  },
  weeklyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
