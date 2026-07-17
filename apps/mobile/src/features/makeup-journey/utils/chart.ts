import type {MakeupJourneyTrendPoint} from '../types';
import {getDateParts} from './date';

export const JOURNEY_CHART_HEIGHT = 260;
export const JOURNEY_CHART_HORIZONTAL_PADDING = 28;
export const JOURNEY_CHART_TOP_PADDING = 28;
export const JOURNEY_CHART_BOTTOM_PADDING = 38;

export type JourneyChartPoint = MakeupJourneyTrendPoint & {
  x: number;
  y: number;
};

export type JourneyChartGeometry = {
  goalY: number | null;
  path: string | null;
  points: JourneyChartPoint[];
};

export function journeyScoreToY(
  score: number,
  height = JOURNEY_CHART_HEIGHT,
): number {
  const plotHeight = height - JOURNEY_CHART_TOP_PADDING - JOURNEY_CHART_BOTTOM_PADDING;
  const normalizedScore = Math.max(0, Math.min(100, score));
  return JOURNEY_CHART_TOP_PADDING + ((100 - normalizedScore) / 100) * plotHeight;
}

export function buildJourneyChartGeometry(
  points: MakeupJourneyTrendPoint[],
  goalScore: number | null,
  width: number,
  startDate: string,
  endDate: string,
  height = JOURNEY_CHART_HEIGHT,
): JourneyChartGeometry {
  const plotWidth = Math.max(1, width - JOURNEY_CHART_HORIZONTAL_PADDING * 2);
  const toDayNumber = (value: string) => {
    const parts = getDateParts(value);
    return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
  };
  const startDay = toDayNumber(startDate);
  const endDay = toDayNumber(endDate);
  const daySpan = Math.max(1, endDay - startDay);
  const chartPoints = points.map(point => {
    const dayOffset = Math.max(0, Math.min(daySpan, toDayNumber(point.date) - startDay));
    const x = JOURNEY_CHART_HORIZONTAL_PADDING + (plotWidth * dayOffset) / daySpan;
    return {...point, x, y: journeyScoreToY(point.score, height)};
  });
  const path = chartPoints.length >= 2
    ? chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    : null;

  return {
    goalY: goalScore === null ? null : journeyScoreToY(goalScore, height),
    path,
    points: chartPoints,
  };
}
