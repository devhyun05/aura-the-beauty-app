import {Pressable, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyCalendarDay, MakeupJourneyStatus} from '../types';
import {
  getJourneyDateAccessibilityLabel,
  type JourneyCalendarCell,
} from '../utils/date';

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
  if (!day || day.latestScore === null) {
    return `${dateLabel}, 기록 없음`;
  }
  return `${dateLabel}, ${day.latestScore}점, ${getStatusLabel(day.status)}, 피드백 ${day.reportCount}개`;
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
  const statusStyle = status === 'success'
    ? styles.success
    : status === 'failure'
      ? styles.failure
      : styles.empty;

  return (
    <Pressable
      accessibilityLabel={getJourneyDayCellAccessibilityLabel(calendarCell, day, isToday)}
      accessibilityRole="button"
      onPress={() => onPress(calendarCell.date)}
      style={({pressed}) => [
        styles.cell,
        statusStyle,
        columnIndex < 6 ? styles.withRightDivider : null,
        weekIndex < 5 ? styles.withBottomDivider : null,
        !calendarCell.inCurrentMonth ? styles.outsideMonth : null,
        pressed ? styles.pressed : null,
      ]}>
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
      {day?.latestScore !== null && day?.latestScore !== undefined ? (
        <View style={styles.recordBlock}>
          <Text style={styles.score}>{day.latestScore}점</Text>
          <View style={styles.statusRow}>
            <View style={[
              styles.statusDot,
              status === 'success' ? styles.successDot : styles.failureDot,
            ]} />
            <Text style={[
              styles.statusText,
              status === 'success' ? styles.successText : styles.failureText,
            ]}>
              {status === 'success' ? '달성' : '미달'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyState} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: colors.white,
    borderColor: colors.divider,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'space-between',
    minHeight: 82,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
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
  empty: {
    backgroundColor: colors.white,
  },
  emptyState: {
    minHeight: 34,
  },
  failure: {
    backgroundColor: 'rgba(91, 120, 166, 0.14)',
  },
  failureDot: {
    backgroundColor: '#5B78A6',
  },
  failureText: {
    color: '#5B78A6',
  },
  outsideMonth: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.34,
  },
  pressed: {
    opacity: 0.7,
  },
  score: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recordBlock: {
    gap: 1,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  statusText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 12,
  },
  todayBadge: {
    backgroundColor: colors.black,
  },
  todayDayText: {
    color: colors.white,
  },
  saturdayText: {
    color: '#5B78A6',
  },
  statusDot: {
    borderRadius: radius.pill,
    height: 5,
    width: 5,
  },
  success: {
    backgroundColor: 'rgba(242, 93, 97, 0.14)',
  },
  successDot: {
    backgroundColor: colors.heart,
  },
  successText: {
    color: colors.heart,
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
