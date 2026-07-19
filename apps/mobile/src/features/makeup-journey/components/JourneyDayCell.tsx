import {Pressable, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {CachedImage} from '../../../shared/ui/CachedImage';
import {getMakeupJourneyCacheRevision} from '../services/makeupJourneyCache';
import {getMakeupJourneyPrivateImageSource} from '../services/makeupJourneyPrivateImage';
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
  const thumbnailUrl = day?.representativeThumbnailUrl?.trim() || null;
  const thumbnailSource = getMakeupJourneyPrivateImageSource(
    thumbnailUrl,
    getMakeupJourneyCacheRevision(),
  );

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
      {score !== null && thumbnailSource ? (
        <CachedImage
          accessible={false}
          cachePolicy="memory"
          contentFit="cover"
          recyclingKey={thumbnailSource.cacheKey ?? `${calendarCell.date}:${day?.representativeReportId}`}
          source={thumbnailSource}
          style={styles.thumbnail}
          transition={0}
        />
      ) : score !== null ? (
        <View pointerEvents="none" style={styles.thumbnailPlaceholder} />
      ) : null}
      <View style={[
        styles.dayNumberBadge,
        score !== null ? styles.recordDayBadge : null,
        isToday ? styles.todayBadge : null,
      ]}>
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
        <View pointerEvents="none" style={styles.recordOverlay}>
          <Text style={styles.score}>{score}점</Text>
          <Text style={styles.statusLabel}>{getStatusLabel(status)}</Text>
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
    flex: 1,
    minHeight: 72,
    overflow: 'hidden',
    padding: spacing.xs,
    position: 'relative',
  },
  dayNumberBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
    zIndex: 2,
  },
  dayNumber: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  emptyDot: {
    backgroundColor: colors.divider,
    bottom: spacing.md,
    borderRadius: radius.pill,
    height: 5,
    left: '50%',
    marginLeft: -2.5,
    position: 'absolute',
    width: 5,
  },
  outsideMonth: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.34,
  },
  pressed: {
    opacity: 0.7,
  },
  recordDayBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
  },
  recordOverlay: {
    backgroundColor: 'rgba(17, 17, 17, 0.62)',
    bottom: 0,
    gap: 1,
    left: 0,
    paddingHorizontal: 5,
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
  },
  score: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 12,
  },
  statusLabel: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.medium,
    fontSize: 8,
    lineHeight: 10,
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
  thumbnail: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  thumbnailPlaceholder: {
    backgroundColor: colors.surfaceMuted,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
