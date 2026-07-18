import {Pressable, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyCalendarDay, MakeupJourneyStatus} from '../types';
import {
  getJourneyDateAccessibilityLabel,
  type JourneyCalendarCell,
} from '../utils/date';

const JOURNEY_FAILURE_COLOR = '#5B78A6';

type JourneyDayCellProps = {
  calendarCell: JourneyCalendarCell;
  columnIndex: number;
  day?: MakeupJourneyCalendarDay;
  isToday?: boolean;
  onPress: (date: string) => void;
  weekIndex: number;
};

function getStatusLabel(status: MakeupJourneyStatus): string {
  if (status === 'success') {
    return '목표 달성';
  }
  if (status === 'failure') {
    return '목표 미달';
  }
  return '기록 없음';
}

export function getJourneyDayCellAccessibilityLabel(
  calendarCell: JourneyCalendarCell,
  day?: MakeupJourneyCalendarDay,
  isToday = false,
): string {
  const dateLabel = `${getJourneyDateAccessibilityLabel(calendarCell.date)}${isToday ? ', 오늘' : ''}`;
  const score = day?.representativeScore ?? day?.latestScore ?? null;
  if (!day || score === null) {
    return `${dateLabel}, 기록 없음`;
  }
  return `${dateLabel}, ${score}점, ${getStatusLabel(day.status)}, 피드백 ${day.reportCount}개`;
}

export function JourneyDayCell({
  calendarCell,
  columnIndex,
  day,
  isToday = false,
  onPress,
  weekIndex,
}: JourneyDayCellProps) {
  const status = day?.status ?? 'empty';
  const score = day?.representativeScore ?? day?.latestScore ?? null;

  return (
    <Pressable
      accessibilityLabel={getJourneyDayCellAccessibilityLabel(calendarCell, day, isToday)}
      accessibilityRole="button"
      onPress={() => onPress(calendarCell.date)}
      style={({pressed}) => [
        styles.cell,
        columnIndex < 6 ? styles.withRightDivider : null,
        weekIndex < 5 ? styles.withBottomDivider : null,
        !calendarCell.inCurrentMonth ? styles.outsideMonth : null,
        pressed ? styles.pressed : null,
      ]}>
      {score !== null ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.statusTint,
            status === 'success' ? styles.successTint : styles.failureTint,
          ]}
        />
      ) : null}
      <View style={[styles.dayNumberBadge, isToday ? styles.todayBadge : null]}>
        <Text style={[
          styles.dayNumber,
          calendarCell.dayOfWeek === 0 ? styles.sundayText : null,
          calendarCell.dayOfWeek === 6 ? styles.saturdayText : null,
          isToday ? styles.todayDayText : null,
        ]}>
          {calendarCell.day}
        </Text>
      </View>
      {score !== null ? (
        <View style={styles.recordBlock}>
          <Text style={[
            styles.score,
            status === 'success' ? styles.successScore : styles.failureScore,
          ]}>
            {score}점
          </Text>
        </View>
      ) : (
        <View style={styles.emptyDot} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: colors.white,
    borderColor: colors.divider,
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'space-between',
    minHeight: 72,
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  dayNumberBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  dayNumber: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  emptyDot: {
    backgroundColor: colors.divider,
    borderRadius: radius.pill,
    height: 5,
    marginBottom: spacing.sm,
    width: 5,
  },
  failureScore: {
    color: JOURNEY_FAILURE_COLOR,
  },
  failureTint: {
    backgroundColor: JOURNEY_FAILURE_COLOR,
  },
  outsideMonth: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.34,
  },
  pressed: {
    opacity: 0.7,
  },
  score: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    lineHeight: 14,
  },
  recordBlock: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    minWidth: 38,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  todayBadge: {
    backgroundColor: colors.black,
  },
  todayDayText: {
    color: colors.white,
  },
  saturdayText: {
    color: JOURNEY_FAILURE_COLOR,
  },
  statusTint: {
    opacity: 0.14,
  },
  successScore: {
    color: colors.heart,
  },
  successTint: {
    backgroundColor: colors.heart,
  },
  sundayText: {
    color: colors.danger,
  },
  withBottomDivider: {
    borderBottomWidth: 1,
  },
  withRightDivider: {
    borderRightWidth: 1,
  },
});
