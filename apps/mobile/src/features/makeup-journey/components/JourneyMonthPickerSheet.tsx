import {useEffect, useRef, useState} from 'react';
import {
  FlatList,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  getCurrentMonthString,
  getYearMonthParts,
} from '../utils/date';

const MONTHS = Array.from({length: 12}, (_, index) => index + 1);
const YEARS = Array.from({length: 9999}, (_, index) => index + 1);
const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ITEM_COUNT = 5;
const WHEEL_VERTICAL_PADDING =
  (WHEEL_ITEM_HEIGHT * (WHEEL_VISIBLE_ITEM_COUNT - 1)) / 2;

export const JOURNEY_MONTH_PICKER_MODE = 'wheel';
export const JOURNEY_MONTH_PICKER_COLUMNS = ['year', 'month'] as const;

type JourneyMonthPickerSheetProps = {
  isVisible: boolean;
  month: string;
  onClose: () => void;
  onSelectMonth: (month: string) => void;
};

type JourneyMonthWheelColumnProps = {
  accessibilityLabel: string;
  onChange: (value: number) => void;
  options: readonly number[];
  suffix: string;
  value: number;
};

function formatMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function JourneyMonthWheelColumn({
  accessibilityLabel,
  onChange,
  options,
  suffix,
  value,
}: JourneyMonthWheelColumnProps) {
  const listRef = useRef<FlatList<number>>(null);

  const scrollToValue = (nextValue: number, animated: boolean) => {
    const nextIndex = options.indexOf(nextValue);

    if (nextIndex >= 0) {
      listRef.current?.scrollToIndex({
        animated,
        index: nextIndex,
      });
    }
  };

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      scrollToValue(value, false);
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [options, value]);

  const selectNearestValue = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.max(
      0,
      Math.min(
        options.length - 1,
        Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT),
      ),
    );
    const nextValue = options[nextIndex];

    if (nextValue === undefined) {
      return;
    }

    if (nextValue !== value) {
      onChange(nextValue);
    }

    const nextOffset = nextIndex * WHEEL_ITEM_HEIGHT;
    if (Math.abs(event.nativeEvent.contentOffset.y - nextOffset) > 0.5) {
      listRef.current?.scrollToOffset({animated: true, offset: nextOffset});
    }
  };

  const selectAfterDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const verticalVelocity = Math.abs(event.nativeEvent.velocity?.y ?? 0);

    if (verticalVelocity < 0.05) {
      selectNearestValue(event);
    }
  };

  return (
    <FlatList
      accessibilityLabel={accessibilityLabel}
      bounces={false}
      contentContainerStyle={styles.wheelColumnContent}
      data={options}
      decelerationRate="fast"
      disableIntervalMomentum
      getItemLayout={(_, index) => ({
        index,
        length: WHEEL_ITEM_HEIGHT,
        offset: index * WHEEL_ITEM_HEIGHT,
      })}
      initialNumToRender={WHEEL_VISIBLE_ITEM_COUNT + 2}
      keyExtractor={option => String(option)}
      maxToRenderPerBatch={WHEEL_VISIBLE_ITEM_COUNT + 4}
      nestedScrollEnabled
      onMomentumScrollEnd={selectNearestValue}
      onScrollEndDrag={selectAfterDrag}
      ref={listRef}
      removeClippedSubviews
      renderItem={({item: option}) => {
        const selected = option === value;

        return (
          <Pressable
            accessibilityLabel={`${option}${suffix}`}
            accessibilityRole="button"
            accessibilityState={{selected}}
            onPress={() => {
              onChange(option);
              scrollToValue(option, true);
            }}
            style={styles.wheelItem}>
            <Text
              style={[
                styles.wheelItemText,
                selected ? styles.wheelItemTextSelected : null,
              ]}>
              {option}
              {suffix}
            </Text>
          </Pressable>
        );
      }}
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={WHEEL_ITEM_HEIGHT}
      style={styles.wheelColumn}
      windowSize={5}
    />
  );
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
  const [selectedMonth, setSelectedMonth] = useState(initialParts.month);
  const currentMonth = getCurrentMonthString();

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const parts = getYearMonthParts(month);
    setSelectedYear(parts.year);
    setSelectedMonth(parts.month);
  }, [isVisible, month]);

  const confirmSelection = () => {
    onSelectMonth(formatMonthKey(selectedYear, selectedMonth));
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
          accessibilityLabel="연도와 월 선택 취소"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.xxl)},
          ]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="연도와 월 선택 취소"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.headerAction}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              날짜로 빠르게 이동
            </Text>
            <Pressable
              accessibilityLabel="선택한 연도와 월로 이동"
              accessibilityRole="button"
              onPress={confirmSelection}
              style={styles.headerAction}>
              <Text style={styles.confirmText}>완료</Text>
            </Pressable>
          </View>

          <Text accessibilityLiveRegion="polite" style={styles.selectionText}>
            {selectedYear}년 {selectedMonth}월
          </Text>

          <View style={styles.wheel}>
            <View pointerEvents="none" style={styles.selectionIndicator} />
            <JourneyMonthWheelColumn
              accessibilityLabel="달력 연도 선택"
              onChange={setSelectedYear}
              options={YEARS}
              suffix="년"
              value={selectedYear}
            />
            <JourneyMonthWheelColumn
              accessibilityLabel="달력 월 선택"
              onChange={setSelectedMonth}
              options={MONTHS}
              suffix="월"
              value={selectedMonth}
            />
          </View>

          <Text style={styles.guideText}>
            연도와 월을 위아래로 스크롤해 선택해 주세요.
          </Text>

          <Pressable
            accessibilityLabel="이번 달로 이동"
            accessibilityRole="button"
            onPress={() => onSelectMonth(currentMonth)}
            style={({pressed}) => [
              styles.currentMonthButton,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.currentMonthText}>이번 달로 이동</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cancelText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  confirmText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
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
  guideText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 52,
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
  selectionIndicator: {
    backgroundColor: colors.surfaceMuted,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderRadius: radius.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: WHEEL_ITEM_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    top: WHEEL_VERTICAL_PADDING,
  },
  selectionText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  sheet: {
    backgroundColor: colors.bottomSheetSurface,
    borderColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
    width: '100%',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  wheel: {
    flexDirection: 'row',
    gap: spacing.sm,
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEM_COUNT,
    overflow: 'hidden',
    position: 'relative',
  },
  wheelColumn: {
    flex: 1,
    zIndex: 1,
  },
  wheelColumnContent: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  wheelItem: {
    alignItems: 'center',
    height: WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
  },
  wheelItemText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  wheelItemTextSelected: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
  },
});
