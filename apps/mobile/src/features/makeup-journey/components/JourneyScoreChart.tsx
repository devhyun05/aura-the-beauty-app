import {useState} from 'react';
import {StyleSheet, type LayoutChangeEvent} from 'react-native';
import Svg, {Circle, G, Line, Path, Text as SvgText} from 'react-native-svg';
import {ChartNoAxesCombined} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyTrendPoint} from '../types';
import {
  buildJourneyChartGeometry,
  JOURNEY_CHART_HEIGHT,
  JOURNEY_CHART_HORIZONTAL_PADDING,
  journeyScoreToY,
} from '../utils/chart';
import {formatJourneyDate} from '../utils/date';

type JourneyScoreChartProps = {
  endDate: string;
  goalScore: number | null;
  points: MakeupJourneyTrendPoint[];
  startDate: string;
};

export function JourneyScoreChart({endDate, goalScore, points, startDate}: JourneyScoreChartProps) {
  const [width, setWidth] = useState(320);
  const geometry = buildJourneyChartGeometry(points, goalScore, width, startDate, endDate);
  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.max(280, event.nativeEvent.layout.width));
  };

  if (points.length === 0) {
    return (
      <View
        accessibilityLabel="성장 그래프 기록 없음"
        onLayout={handleLayout}
        style={styles.empty}>
        <ChartNoAxesCombined color={colors.textTertiary} size={34} />
        <Text style={styles.emptyTitle}>그래프로 볼 기록이 없어요.</Text>
        <Text style={styles.emptyText}>피드백을 받으면 날짜별 최신 점수가 표시돼요.</Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={
        goalScore === null
          ? `성장 점수 그래프, 기록 ${points.length}개, 목표 미설정`
          : `성장 점수 그래프, 기록 ${points.length}개, 목표 ${goalScore}점`
      }
      onLayout={handleLayout}
      style={styles.chartContainer}>
      <Svg accessibilityLabel="성장 점수 선 그래프" height={JOURNEY_CHART_HEIGHT} width={width}>
        {[0, 25, 50, 75, 100].map(score => {
          const y = journeyScoreToY(score, JOURNEY_CHART_HEIGHT);
          return (
            <G key={`grid-${score}`}>
              <Line
                stroke={colors.divider}
                strokeWidth={1}
                x1={JOURNEY_CHART_HORIZONTAL_PADDING}
                x2={width - JOURNEY_CHART_HORIZONTAL_PADDING}
                y1={y}
                y2={y}
              />
            </G>
          );
        })}
        {goalScore !== null && geometry.goalY !== null ? (
          <>
            <Line
              stroke={colors.textSecondary}
              strokeDasharray="6 5"
              strokeWidth={1.5}
              x1={JOURNEY_CHART_HORIZONTAL_PADDING}
              x2={width - JOURNEY_CHART_HORIZONTAL_PADDING}
              y1={geometry.goalY}
              y2={geometry.goalY}
            />
            <SvgText
              fill={colors.textSecondary}
              fontFamily={typography.fontFamily.semibold}
              fontSize={11}
              textAnchor="end"
              x={width - JOURNEY_CHART_HORIZONTAL_PADDING}
              y={Math.max(12, geometry.goalY - 6)}>
              목표 {goalScore}
            </SvgText>
          </>
        ) : null}
        {geometry.path ? (
          <Path
            d={geometry.path}
            fill="none"
            stroke={colors.textPrimary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
          />
        ) : null}
        {geometry.points.map(point => {
          const pointColor = point.status === 'success' ? colors.successMuted : colors.danger;
          return (
            <G
              accessible
              accessibilityLabel={`${formatJourneyDate(point.date, false)}, ${point.score}점, ${point.status === 'success' ? '목표 달성' : '목표 미달'}`}
              key={point.date}>
              <Circle
                cx={point.x}
                cy={point.y}
                fill={colors.background}
                r={7}
                stroke={pointColor}
                strokeWidth={3}
              />
              <SvgText
                fill={pointColor}
                fontFamily={typography.fontFamily.bold}
                fontSize={11}
                textAnchor="middle"
                x={point.x}
                y={Math.max(14, point.y - 11)}>
                {point.score}
              </SvgText>
            </G>
          );
        })}
        <SvgText
          fill={colors.textSecondary}
          fontFamily={typography.fontFamily.regular}
          fontSize={10}
          textAnchor="start"
          x={JOURNEY_CHART_HORIZONTAL_PADDING}
          y={JOURNEY_CHART_HEIGHT - 12}>
          {startDate.slice(5).replace('-', '.')}
        </SvgText>
        <SvgText
          fill={colors.textSecondary}
          fontFamily={typography.fontFamily.regular}
          fontSize={10}
          textAnchor="end"
          x={width - JOURNEY_CHART_HORIZONTAL_PADDING}
          y={JOURNEY_CHART_HEIGHT - 12}>
          {endDate.slice(5).replace('-', '.')}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: JOURNEY_CHART_HEIGHT,
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
});
