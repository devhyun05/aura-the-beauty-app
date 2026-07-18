import {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet} from 'react-native';
import {ChevronLeft, ChevronRight, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  getCurrentMonthString,
  getYearMonthParts,
} from '../utils/date';

const MONTHS = Array.from({length: 12}, (_, index) => index + 1);
const YEARS_PER_PAGE = 10;

type JourneyMonthPickerSheetProps = {
  isVisible: boolean;
  month: string;
  onClose: () => void;
  onSelectMonth: (month: string) => void;
};

function getDecadeStart(year: number): number {
  return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
}

function formatMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function JourneyMonthPickerSheet({
  isVisible,
  month,
  onClose,
  onSelectMonth,
}: JourneyMonthPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const initialParts = getYearMonthParts(month);
  const [selectedYear, setSelectedYear] = useState(initialParts.year);
  const [decadeStart, setDecadeStart] = useState(getDecadeStart(initialParts.year));

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const parts = getYearMonthParts(month);
    setSelectedYear(parts.year);
    setDecadeStart(getDecadeStart(parts.year));
  }, [isVisible, month]);

  const years = Array.from(
    {length: YEARS_PER_PAGE},
    (_, index) => decadeStart + index,
  ).filter(year => year >= 1 && year <= 9999);
  const currentMonth = getCurrentMonthString();
  const currentParts = getYearMonthParts(currentMonth);
  const canOpenPreviousDecade = decadeStart > 1;
  const canOpenNextDecade = decadeStart + YEARS_PER_PAGE <= 9999;

  const selectCurrentMonth = () => {
    onSelectMonth(currentMonth);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={isVisible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="연도와 월 선택 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, spacing.xl)},
          ]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text accessibilityRole="header" style={styles.title}>날짜로 빠르게 이동</Text>
              <Text style={styles.description}>연도를 고른 다음 원하는 달을 눌러 주세요.</Text>
            </View>
            <Pressable
              accessibilityLabel="연도와 월 선택 닫기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}>
              <X color={colors.textPrimary} size={21} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.decadeHeader}>
              <Pressable
                accessibilityLabel="이전 10년 보기"
                accessibilityRole="button"
                accessibilityState={{disabled: !canOpenPreviousDecade}}
                disabled={!canOpenPreviousDecade}
                onPress={() => setDecadeStart(value => Math.max(0, value - YEARS_PER_PAGE))}
                style={({pressed}) => [
                  styles.decadeButton,
                  !canOpenPreviousDecade ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}>
                <ChevronLeft color={colors.textPrimary} size={19} />
              </Pressable>
              <Text style={styles.decadeTitle}>
                {years[0]}–{years[years.length - 1]}년
              </Text>
              <Pressable
                accessibilityLabel="다음 10년 보기"
                accessibilityRole="button"
                accessibilityState={{disabled: !canOpenNextDecade}}
                disabled={!canOpenNextDecade}
                onPress={() => setDecadeStart(value => value + YEARS_PER_PAGE)}
                style={({pressed}) => [
                  styles.decadeButton,
                  !canOpenNextDecade ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}>
                <ChevronRight color={colors.textPrimary} size={19} />
              </Pressable>
            </View>
            <View style={styles.yearGrid}>
              {years.map(year => {
                const isSelected = year === selectedYear;
                const isCurrent = year === currentParts.year;
                return (
                  <Pressable
                    accessibilityLabel={`${year}년 선택`}
                    accessibilityRole="button"
                    accessibilityState={{selected: isSelected}}
                    key={year}
                    onPress={() => setSelectedYear(year)}
                    style={({pressed}) => [
                      styles.yearButton,
                      isCurrent ? styles.currentOutline : null,
                      isSelected ? styles.selectedButton : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Text style={[
                      styles.yearText,
                      isSelected ? styles.selectedText : null,
                    ]}>
                      {year}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{selectedYear}년 월 선택</Text>
            <View style={styles.monthGrid}>
              {MONTHS.map(monthNumber => {
                const monthKey = formatMonthKey(selectedYear, monthNumber);
                const isSelected = monthKey === month;
                const isCurrent = monthKey === currentMonth;
                return (
                  <Pressable
                    accessibilityLabel={`${selectedYear}년 ${monthNumber}월로 이동`}
                    accessibilityRole="button"
                    accessibilityState={{selected: isSelected}}
                    key={monthNumber}
                    onPress={() => onSelectMonth(monthKey)}
                    style={({pressed}) => [
                      styles.monthButton,
                      isCurrent ? styles.currentOutline : null,
                      isSelected ? styles.selectedButton : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Text style={[
                      styles.monthText,
                      isSelected ? styles.selectedText : null,
                    ]}>
                      {monthNumber}월
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityLabel="이번 달로 이동"
            accessibilityRole="button"
            onPress={selectCurrentMonth}
            style={({pressed}) => [styles.currentMonthButton, pressed ? styles.pressed : null]}>
            <Text style={styles.currentMonthText}>이번 달로 이동</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  currentMonthButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  currentMonthText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  currentOutline: {
    borderColor: colors.textPrimary,
  },
  decadeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  decadeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  decadeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  disabled: {
    opacity: 0.35,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 40,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  monthButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '22%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  monthText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pressed: {
    opacity: 0.72,
  },
  scrim: {
    backgroundColor: 'rgba(17, 17, 17, 0.48)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  selectedButton: {
    backgroundColor: colors.blackSurface,
    borderColor: colors.blackSurface,
  },
  selectedText: {
    color: colors.white,
  },
  sheet: {
    backgroundColor: colors.bottomSheetSurface,
    borderColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xl,
    maxHeight: '92%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  yearButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexBasis: '17%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  yearText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
