import {StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyCalendarDay} from '../types';
import {createJourneyCalendarGrid, JOURNEY_WEEKDAY_LABELS} from '../utils/date';
import {JourneyDayCell} from './JourneyDayCell';

type JourneyCalendarGridProps = {
  days: MakeupJourneyCalendarDay[];
  month: string;
  onPressDay: (date: string) => void;
  todayDate?: string | null;
};

export function JourneyCalendarGrid({
  days,
  month,
  onPressDay,
  todayDate,
}: JourneyCalendarGridProps) {
  const cells = createJourneyCalendarGrid(month);
  const dayByDate = new Map(days.map(day => [day.date, day]));
  const weeks = Array.from({length: 6}, (_, weekIndex) =>
    cells.slice(weekIndex * 7, weekIndex * 7 + 7),
  );

  return (
    <View accessibilityLabel={`${month} 월간 달력`} style={styles.container}>
      <View style={styles.weekRow}>
        {JOURNEY_WEEKDAY_LABELS.map((label, index) => (
          <View key={label} style={styles.weekdayCell}>
            <Text style={[
              styles.weekday,
              index === 0 ? styles.sunday : null,
              index === 6 ? styles.saturday : null,
            ]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={`${month}-week-${weekIndex}`} style={styles.weekRow}>
          {week.map((cell, columnIndex) => (
            <JourneyDayCell
              calendarCell={cell}
              columnIndex={columnIndex}
              day={dayByDate.get(cell.date)}
              isToday={todayDate === cell.date}
              key={cell.date}
              onPress={onPressDay}
              weekIndex={weekIndex}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...shadows.soft,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  weekdayCell: {
    backgroundColor: colors.white,
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flex: 1,
    paddingVertical: spacing.md,
  },
  saturday: {
    color: '#5B78A6',
  },
  sunday: {
    color: colors.danger,
  },
});
