import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Animated, Easing, Keyboard, Modal, Pressable, StyleSheet, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CalendarDays, Mail} from 'lucide-react-native';
import {Text, XStack, YStack} from 'tamagui';

import {profileGenderOptions} from '../../profile/constants/profileEditOptions';
import {
  createCalendarCells,
  profileEditWeekLabels,
  startOfMonth,
} from '../../profile/services/profileEditModel';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen, ChevronLeftIcon, ChevronRightIcon, IconButton} from '../../../shared/ui';
import {AuraLogo} from '../components/AuraLogo';
import type {AuthUser} from '../types';

export type ProfileSetupFormValues = {
  birthDate: string;
  email: string;
  gender: string;
  name: string;
  nickname: string;
};


type ProfileSetupScreenProps = {
  onSubmit?: (values: ProfileSetupFormValues) => void;
  user?: AuthUser | null;
};

type ProfileSetupProgressProps = {
  completedStepCount: number;
  totalStepCount: number;
};

type BirthDateCalendarSheetProps = {
  calendarCells: ReturnType<typeof createCalendarCells>;
  calendarMonth: Date;
  bottomInset: number;
  isVisible: boolean;
  onClose: () => void;
  onMoveMonth: (offset: number) => void;
  onMoveYear: (offset: number) => void;
  onSelectDate: (dateValue: string) => void;
  selectedDate: string;
};

const birthDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const defaultBirthDateMonth = new Date(2000, 0, 1);
const devAuthPlaceholderValues = new Set(['Local Dev', 'dev@example.com']);
const profileSetupTotalStepCount = 5;

function sanitizeDevAuthPlaceholder(value: string) {
  return devAuthPlaceholderValues.has(value) ? '' : value;
}

function getInitialEmail(user?: AuthUser | null) {
  return sanitizeDevAuthPlaceholder(user?.email?.trim() ?? '');
}

function getInitialName(user?: AuthUser | null) {
  return sanitizeDevAuthPlaceholder(user?.name?.trim() ?? '');
}

function getInitialNickname(user?: AuthUser | null) {
  const nickname = sanitizeDevAuthPlaceholder(user?.nickname?.trim() ?? '');
  const email = getInitialEmail(user);
  const name = getInitialName(user);

  if (!nickname || nickname === 'AURA User' || nickname === email || nickname === name) {
    return '';
  }

  return nickname;
}

function normalizeFormValues(values: ProfileSetupFormValues): ProfileSetupFormValues {
  return {
    birthDate: values.birthDate.trim(),
    email: values.email.trim(),
    gender: values.gender.trim(),
    name: values.name.trim(),
    nickname: values.nickname.trim(),
  };
}

function ProfileSetupProgress({
  completedStepCount,
  totalStepCount,
}: ProfileSetupProgressProps) {
  const progressValue = useRef(new Animated.Value(completedStepCount / totalStepCount)).current;
  const progressWidth = progressValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  useEffect(() => {
    Animated.timing(progressValue, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: completedStepCount / totalStepCount,
      useNativeDriver: false,
    }).start();
  }, [completedStepCount, progressValue, totalStepCount]);

  return (
    <YStack style={styles.progressBlock}>
      <XStack style={styles.progressHeader}>
        <Text style={styles.progressLabel}>프로필 완성도</Text>
        <Text style={styles.progressCount}>
          {completedStepCount}/{totalStepCount}
        </Text>
      </XStack>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, {width: progressWidth}]} />
      </View>
    </YStack>
  );
}

function BirthDateCalendarSheet({
  calendarCells,
  calendarMonth,
  bottomInset,
  isVisible,
  onClose,
  onMoveMonth,
  onMoveYear,
  onSelectDate,
  selectedDate,
}: BirthDateCalendarSheetProps) {
  const [isSheetMounted, setIsSheetMounted] = useState(isVisible);
  const transitionValue = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const backdropOpacity = transitionValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const sheetTranslateY = transitionValue.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
  });

  useEffect(() => {
    if (isVisible) {
      setIsSheetMounted(true);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isSheetMounted) {
      return;
    }

    transitionValue.stopAnimation();
    Animated.timing(transitionValue, {
      duration: isVisible ? 220 : 180,
      easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      toValue: isVisible ? 1 : 0,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished && !isVisible) {
        setIsSheetMounted(false);
      }
    });
  }, [isSheetMounted, isVisible, transitionValue]);

  if (!isSheetMounted) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={isSheetMounted}>
      <View style={styles.sheetRoot}>
        <Animated.View style={[styles.sheetBackdropHost, {opacity: backdropOpacity}]}>
          <Pressable
            accessibilityLabel="생년월일 선택 닫기"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.sheetBackdrop}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheetPanel,
            {
              paddingBottom: Math.max(bottomInset, spacing.lg) + spacing.sm,
              transform: [{translateY: sheetTranslateY}],
            },
          ]}>
          <View style={styles.sheetHandle} />
          <XStack style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>생년월일 선택</Text>
            <Pressable
              accessibilityLabel="생년월일 선택 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.sheetCloseButton}>
              <Text style={styles.sheetCloseText}>닫기</Text>
            </Pressable>
          </XStack>

          <View style={styles.calendarPanelInSheet}>
            <View style={styles.calendarYearRow}>
              <Pressable
                accessibilityLabel="이전 해로 이동"
                accessibilityRole="button"
                onPress={() => onMoveYear(-1)}
                style={styles.yearButton}>
                <Text style={styles.yearButtonText}>이전 해</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="다음 해로 이동"
                accessibilityRole="button"
                onPress={() => onMoveYear(1)}
                style={styles.yearButton}>
                <Text style={styles.yearButtonText}>다음 해</Text>
              </Pressable>
            </View>

            <View style={styles.calendarHeader}>
              <IconButton
                accessibilityLabel="이전 달"
                onPress={() => onMoveMonth(-1)}
                size={34}>
                <ChevronLeftIcon />
              </IconButton>
              <Text style={styles.calendarTitle}>
                {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
              </Text>
              <IconButton
                accessibilityLabel="다음 달"
                onPress={() => onMoveMonth(1)}
                size={34}>
                <ChevronRightIcon />
              </IconButton>
            </View>

            <View style={styles.weekRow}>
              {profileEditWeekLabels.map((label) => (
                <Text key={label} style={styles.weekLabel}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.dayGrid}>
              {calendarCells.map((cell) => {
                const selected = Boolean(cell.day) && cell.value === selectedDate;

                return (
                  <Pressable
                    accessibilityLabel={cell.day ? `${cell.value} 선택` : '빈 날짜'}
                    accessibilityRole="button"
                    disabled={!cell.day}
                    key={cell.key}
                    onPress={() => onSelectDate(cell.value)}
                    style={[styles.dayCell, selected ? styles.dayCellSelected : null]}>
                    <Text
                      style={[
                        styles.dayText,
                        !cell.day ? styles.dayTextMuted : null,
                        selected ? styles.dayTextSelected : null,
                      ]}>
                      {cell.day ?? ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
function FieldGroup({children}: {children: ReactNode}) {
  return <YStack style={styles.fieldGroup}>{children}</YStack>;
}

export function ProfileSetupScreen({onSubmit, user}: ProfileSetupScreenProps) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<ProfileSetupFormValues>(() => ({
    birthDate: '',
    email: getInitialEmail(user),
    gender: '',
    name: getInitialName(user),
    nickname: getInitialNickname(user),
  }));
  const [isCalendarSheetVisible, setIsCalendarSheetVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(defaultBirthDateMonth));

  const normalizedValues = useMemo(() => normalizeFormValues(values), [values]);
  const calendarCells = useMemo(() => createCalendarCells(calendarMonth), [calendarMonth]);
  const isBirthDateValid = birthDatePattern.test(normalizedValues.birthDate);
  const completedStepCount = useMemo(
    () =>
      [
        Boolean(normalizedValues.name),
        Boolean(normalizedValues.nickname),
        Boolean(normalizedValues.email),
        isBirthDateValid,
        Boolean(normalizedValues.gender),
      ].filter(Boolean).length,
    [
      isBirthDateValid,
      normalizedValues.email,
      normalizedValues.gender,
      normalizedValues.name,
      normalizedValues.nickname,
    ],
  );
  const canSubmit = completedStepCount === profileSetupTotalStepCount;

  const updateValue = (key: keyof ProfileSetupFormValues, nextValue: string) => {
    setValues((currentValues) => ({...currentValues, [key]: nextValue}));
  };

  const moveCalendarMonth = (offset: number) => {
    setCalendarMonth(
      (currentMonth) =>
        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1),
    );
  };

  const moveCalendarYear = (offset: number) => {
    setCalendarMonth(
      (currentMonth) =>
        new Date(currentMonth.getFullYear() + offset, currentMonth.getMonth(), 1),
    );
  };

  const closeCalendarSheet = () => {
    setIsCalendarSheetVisible(false);
  };

  const openCalendarSheet = () => {
    Keyboard.dismiss();
    setIsCalendarSheetVisible(true);
  };

  const selectBirthDate = (dateValue: string) => {
    updateValue('birthDate', dateValue);
    closeCalendarSheet();
  };

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }

    onSubmit?.(normalizedValues);
  };

  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      horizontalPadding={spacing.xl}
      topPadding="safeArea">
      <YStack style={styles.header}>
        <AuraLogo variant="intro" />
      </YStack>

      <YStack style={styles.formPanel}>
        <ProfileSetupProgress
          completedStepCount={completedStepCount}
          totalStepCount={profileSetupTotalStepCount}
        />

        <FieldGroup>
          <Text style={styles.label}>이름</Text>
          <TextInput
            accessibilityLabel="이름"
            autoCapitalize="none"
            onChangeText={(nextValue) => updateValue('name', nextValue)}
            placeholder="이름을 입력해 주세요"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            value={values.name}
          />
        </FieldGroup>

        <FieldGroup>
          <Text style={styles.label}>닉네임</Text>
          <TextInput
            accessibilityLabel="닉네임"
            autoCapitalize="none"
            onChangeText={(nextValue) => updateValue('nickname', nextValue)}
            placeholder="앱에서 사용할 닉네임"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            value={values.nickname}
          />
        </FieldGroup>

        <FieldGroup>
          <Text style={styles.label}>이메일</Text>
          <XStack style={styles.readOnlyField}>
            <Mail color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
            <Text numberOfLines={1} style={styles.readOnlyText}>
              {normalizedValues.email || 'OAuth 이메일을 불러오는 중'}
            </Text>
          </XStack>
        </FieldGroup>

        <FieldGroup>
          <Text style={styles.label}>생년월일</Text>
          <Pressable
            accessibilityLabel="생년월일 선택"
            accessibilityRole="button"
            onPress={openCalendarSheet}
            style={styles.birthDateButton}>
            <CalendarDays color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
            <Text
              numberOfLines={1}
              style={[
                styles.birthDateText,
                !normalizedValues.birthDate ? styles.birthDatePlaceholder : null,
              ]}>
              {normalizedValues.birthDate || '생년월일 선택'}
            </Text>
          </Pressable>
        </FieldGroup>

        <FieldGroup>
          <Text style={styles.label}>성별</Text>
          <XStack style={styles.genderRow}>
            {profileGenderOptions.map((option) => {
              const selected = values.gender === option;

              return (
                <Pressable
                  accessibilityLabel={`${option} 선택`}
                  accessibilityRole="button"
                  key={option}
                  onPress={() => updateValue('gender', option)}
                  style={[styles.genderButton, selected ? styles.genderButtonSelected : null]}>
                  <Text style={[styles.genderText, selected ? styles.genderTextSelected : null]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </XStack>
        </FieldGroup>
      </YStack>

      <Pressable
        accessibilityLabel="정보 등록"
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={handleSubmit}
        style={[styles.submitButton, !canSubmit ? styles.submitButtonDisabled : null]}>
        <Text style={[styles.submitText, !canSubmit ? styles.submitTextDisabled : null]}>
          정보 등록
        </Text>
      </Pressable>

      <BirthDateCalendarSheet
        bottomInset={insets.bottom}
        calendarCells={calendarCells}
        calendarMonth={calendarMonth}
        isVisible={isCalendarSheetVisible}
        onClose={closeCalendarSheet}
        onMoveMonth={moveCalendarMonth}
        onMoveYear={moveCalendarYear}
        onSelectDate={selectBirthDate}
        selectedDate={normalizedValues.birthDate}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  birthDateButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  birthDatePlaceholder: {
    color: colors.textTertiary,
  },
  birthDateText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
  },
  calendarPanelInSheet: {
    gap: spacing.sm,
  },
  calendarTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
    width: 128,
  },
  calendarYearRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: '14.285%',
  },
  dayCellSelected: {
    backgroundColor: colors.black,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 204,
  },
  dayText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  dayTextMuted: {
    color: colors.textTertiary,
  },
  dayTextSelected: {
    color: colors.white,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  formPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  genderButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  genderButtonSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  genderRow: {
    gap: spacing.sm,
  },
  genderText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  genderTextSelected: {
    color: colors.white,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  input: {
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  progressBlock: {
    gap: spacing.sm,
  },
  progressCount: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  progressFill: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
  },
  readOnlyField: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  readOnlyText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetBackdropHost: {
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetCloseButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  sheetCloseText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetPanel: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    width: '100%',
    ...shadows.soft,
  },
  sheetRoot: {
    alignItems: 'stretch',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  submitButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  submitButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  submitText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  submitTextDisabled: {
    color: colors.textTertiary,
  },
  weekLabel: {
    color: colors.textTertiary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  yearButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  yearButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
