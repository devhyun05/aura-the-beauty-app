import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Settings2,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {trackMakeupJourneyEvent} from '../../../shared/services/makeupJourneyAnalytics';
import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../../shared/ui/AppFooter';
import {JourneyCalendarGrid} from '../components/JourneyCalendarGrid';
import {JourneyMonthPickerSheet} from '../components/JourneyMonthPickerSheet';
import {JourneyMonthSummary} from '../components/JourneyMonthSummary';
import {JourneySettingsSheet} from '../components/JourneySettingsSheet';
import {useMakeupJourneyMonth} from '../hooks/useMakeupJourneyMonth';
import {invalidateMakeupJourneyCache} from '../services/makeupJourneyCache';
import {
  prefetchMakeupJourneyCalendarThumbnails,
  prefetchMakeupJourneyMonth,
} from '../services/makeupJourneyPrefetch';
import {
  getMakeupJourneySettings,
  saveMakeupJourneySettings,
} from '../services/makeupJourneyService';
import type {MakeupJourneyMissionLevel, MakeupJourneySettings} from '../types';
import {
  formatJourneyMonth,
  getCurrentMonthString,
  getJourneyTrendEndDateForMonth,
  getTodayDateString,
  isYearMonthString,
  shiftMonth,
} from '../utils/date';
import {getMakeupJourneyLandingMode} from '../utils/presentation';

export type MakeupJourneyScreenProps = {
  initialMonth?: string;
  onOpenDay: (entryDate: string) => void;
  onOpenTrend: (entryDate: string) => void;
};

function StateCard({
  error,
  loading,
  onRetry,
}: {
  error?: string | null;
  loading?: boolean;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.stateCard}>
      {loading ? <ActivityIndicator color={colors.textPrimary} size="small" /> : null}
      <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>
        {loading ? '메이크업 성장을 불러오는 중이에요.' : '기록을 불러오지 못했어요.'}
      </Text>
      {error ? <Text style={styles.stateText}>{error}</Text> : null}
      {onRetry ? (
        <Pressable
          accessibilityLabel="메이크업 성장 다시 불러오기"
          accessibilityRole="button"
          onPress={onRetry}
          style={({pressed}) => [styles.retryButton, pressed ? styles.pressed : null]}>
          <Text style={styles.retryText}>다시 불러오기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MakeupJourneyScreen({
  initialMonth,
  onOpenDay,
  onOpenTrend,
}: MakeupJourneyScreenProps) {
  const insets = useSafeAreaInsets();
  const {width: screenWidth} = useWindowDimensions();
  const calendarTranslateX = useRef(new Animated.Value(0)).current;
  const isCalendarTransitioningRef = useRef(false);
  const [month, setMonth] = useState(() =>
    initialMonth && isYearMonthString(initialMonth)
      ? initialMonth
      : getCurrentMonthString(),
  );
  const [todayDate, setTodayDate] = useState(() => getTodayDateString());
  const [settings, setSettings] = useState<MakeupJourneySettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsRefreshing, setSettingsRefreshing] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [focusSession, setFocusSession] = useState(0);
  const didPromptOnboardingRef = useRef(false);
  const focusCountRef = useRef(0);
  const trackedOpeningsRef = useRef(new Set<string>());
  const settingsRequestRef = useRef(0);
  const settingsMutationActiveRef = useRef(false);
  const todayDateRef = useRef(todayDate);
  const monthResource = useMakeupJourneyMonth(month, Boolean(settings));

  useEffect(() => {
    const currentMonthData = monthResource.data;
    if (!settings || !currentMonthData || currentMonthData.month !== month) {
      return;
    }

    void prefetchMakeupJourneyCalendarThumbnails(currentMonthData);
    [shiftMonth(month, -1), shiftMonth(month, 1)].forEach(adjacentMonth => {
      void prefetchMakeupJourneyMonth(adjacentMonth).catch(() => undefined);
    });
  }, [month, monthResource.data, settings]);

  const syncTodayDate = useCallback(() => {
    const nextToday = getTodayDateString();
    const previousToday = todayDateRef.current;
    if (nextToday === previousToday) {
      return;
    }
    todayDateRef.current = nextToday;
    setTodayDate(nextToday);
    setMonth(current => current === previousToday.slice(0, 7)
      ? nextToday.slice(0, 7)
      : current);
  }, []);

  useEffect(() => {
    if (initialMonth && isYearMonthString(initialMonth)) {
      setMonth(initialMonth);
    }
  }, [initialMonth]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 100);
    const timer = setTimeout(syncTodayDate, nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(timer);
  }, [syncTodayDate, todayDate]);

  const loadSettings = useCallback(async (
    mode: 'initial' | 'refresh' | 'silent' = 'initial',
  ) => {
    if (settingsMutationActiveRef.current) {
      return;
    }
    const requestId = settingsRequestRef.current + 1;
    settingsRequestRef.current = requestId;
    if (mode === 'initial') {
      setSettingsLoading(true);
    }
    if (mode === 'refresh') {
      setSettingsRefreshing(true);
    }
    setSettingsError(null);
    try {
      const response = await getMakeupJourneySettings();
      if (settingsRequestRef.current !== requestId) {
        return;
      }
      setSettings(response.settings);
    } catch (error) {
      if (settingsRequestRef.current !== requestId) {
        return;
      }
      setSettingsError(
        error instanceof Error ? error.message : '설정을 불러오지 못했어요.',
      );
    } finally {
      if (settingsRequestRef.current === requestId) {
        setSettingsLoading(false);
        setSettingsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useFocusEffect(
    useCallback(() => {
      syncTodayDate();
      setFocusSession(value => value + 1);
      if (focusCountRef.current > 0) {
        void loadSettings('silent');
        void monthResource.refresh();
      }
      focusCountRef.current += 1;
      return undefined;
    }, [loadSettings, monthResource.refresh, syncTodayDate]),
  );

  useEffect(() => {
    if (!settingsLoading && !settingsError && !settings && !didPromptOnboardingRef.current) {
      didPromptOnboardingRef.current = true;
      setSettingsSheetVisible(true);
    }
  }, [settings, settingsError, settingsLoading]);

  useEffect(() => {
    const openingKey = `${focusSession}:${month}`;
    if (
      focusSession === 0 ||
      trackedOpeningsRef.current.has(openingKey) ||
      settingsLoading ||
      (Boolean(settingsError) && !settings) ||
      (Boolean(settings) && !monthResource.data)
    ) {
      return;
    }
    trackedOpeningsRef.current.add(openingKey);
    trackMakeupJourneyEvent({
      name: 'makeup_journey_opened',
      properties: {
        hasRecords: Boolean(monthResource.data?.days.length),
        month,
      },
    });
  }, [
    focusSession,
    month,
    monthResource.data,
    monthResource.error,
    monthResource.isLoading,
    settings,
    settingsError,
    settingsLoading,
  ]);

  const saveSettings = async (input: {
    goalScore: number;
    missionLevel: MakeupJourneyMissionLevel;
  }) => {
    if (settingsMutationActiveRef.current) {
      return;
    }
    settingsMutationActiveRef.current = true;
    settingsRequestRef.current += 1;
    setSettingsLoading(false);
    setSettingsRefreshing(false);
    setSettingsError(null);
    setIsSavingSettings(true);
    setSettingsSaveError(null);
    try {
      const response = await saveMakeupJourneySettings(input);
      if (!response.settings) {
        throw new Error('저장된 설정을 확인하지 못했어요.');
      }
      setSettings(response.settings);
      setSettingsSheetVisible(false);
      invalidateMakeupJourneyCache();
      trackMakeupJourneyEvent({
        name: 'makeup_journey_settings_saved',
        properties: input,
      });
    } catch (error) {
      setSettingsSaveError(
        error instanceof Error ? error.message : '설정을 저장하지 못했어요.',
      );
    } finally {
      settingsMutationActiveRef.current = false;
      setIsSavingSettings(false);
    }
  };

  const openDay = (entryDate: string) => {
    onOpenDay(entryDate);
  };

  const selectMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    setMonthPickerVisible(false);
  };

  const restoreCalendarPosition = useCallback((duration = 150) => {
    Animated.timing(calendarTranslateX, {
      duration,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      isCalendarTransitioningRef.current = false;
    });
  }, [calendarTranslateX]);

  const changeMonthBySwipe = useCallback((direction: -1 | 1) => {
    if (isCalendarTransitioningRef.current) {
      return;
    }
    isCalendarTransitioningRef.current = true;
    Animated.timing(calendarTranslateX, {
      duration: 160,
      easing: Easing.in(Easing.cubic),
      toValue: direction > 0 ? -screenWidth : screenWidth,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (!finished) {
        restoreCalendarPosition();
        return;
      }
      setMonth(current => shiftMonth(current, direction));
      calendarTranslateX.setValue(direction > 0 ? screenWidth : -screenWidth);
      requestAnimationFrame(() => restoreCalendarPosition(210));
    });
  }, [calendarTranslateX, restoreCalendarPosition, screenWidth]);

  const calendarSwipeResponder = useMemo(() => {
    const shouldClaimHorizontalSwipe = (dx: number, dy: number) => (
      !isCalendarTransitioningRef.current
      && Math.abs(dx) >= 10
      && Math.abs(dx) > Math.abs(dy) * 1.15
    );

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => (
        shouldClaimHorizontalSwipe(gesture.dx, gesture.dy)
      ),
      onMoveShouldSetPanResponderCapture: (_event, gesture) => (
        shouldClaimHorizontalSwipe(gesture.dx, gesture.dy)
      ),
      onPanResponderMove: (_event, gesture) => {
        const clampedX = Math.max(-screenWidth, Math.min(screenWidth, gesture.dx));
        calendarTranslateX.setValue(clampedX);
      },
      onPanResponderRelease: (_event, gesture) => {
        const shouldMove = Math.abs(gesture.dx) >= 36 || Math.abs(gesture.vx) >= 0.28;
        if (!shouldMove) {
          isCalendarTransitioningRef.current = true;
          restoreCalendarPosition(120);
          return;
        }
        changeMonthBySwipe(gesture.dx < 0 ? 1 : -1);
      },
      onPanResponderTerminate: () => {
        isCalendarTransitioningRef.current = true;
        restoreCalendarPosition(120);
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [calendarTranslateX, changeMonthBySwipe, restoreCalendarPosition, screenWidth]);

  const refreshAll = async () => {
    await Promise.all([
      loadSettings('refresh'),
      settings ? monthResource.refresh() : Promise.resolve(),
    ]);
  };

  const mode = getMakeupJourneyLandingMode({
    calendarHasData: Boolean(monthResource.data),
    calendarIsLoading: monthResource.isLoading,
    calendarError: monthResource.error,
    settings,
    settingsError,
    settingsIsLoading: settingsLoading,
  });
  const showCalendar = mode === 'calendar' || mode === 'onboarding';
  const calendarDays = monthResource.data?.days ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + Math.max(insets.bottom, spacing.md) + spacing.xxl,
            paddingTop: Math.max(insets.top, spacing.lg) + spacing.md,
          },
        ]}
        refreshControl={(
          <RefreshControl
            onRefresh={() => void refreshAll()}
            refreshing={settingsRefreshing || monthResource.isRefreshing}
            tintColor={colors.textPrimary}
          />
        )}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>나의 변화 기록</Text>
            <View style={styles.screenTitleRow}>
              <Text accessibilityRole="header" style={styles.screenTitle}>메이크업 성장</Text>
              <Leaf color={colors.heart} size={20} strokeWidth={1.8} />
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="전체 성장 그래프 보기"
              accessibilityRole="button"
              onPress={() => onOpenTrend(getJourneyTrendEndDateForMonth(month))}
              style={({pressed}) => [styles.headerActionButton, pressed ? styles.pressed : null]}>
              <ChartNoAxesCombined color={colors.textPrimary} size={22} />
              <Text style={styles.headerActionLabel}>분석</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="메이크업 성장 설정 열기"
              accessibilityRole="button"
              onPress={() => {
                setSettingsSaveError(null);
                setSettingsSheetVisible(true);
              }}
              style={({pressed}) => [styles.headerActionButton, pressed ? styles.pressed : null]}>
              <Settings2 color={colors.textPrimary} size={22} />
              <Text style={styles.headerActionLabel}>설정</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.monthHeader}>
          <Pressable
            accessibilityLabel="이전 달 보기"
            accessibilityRole="button"
            onPress={() => setMonth(current => shiftMonth(current, -1))}
            style={({pressed}) => [styles.monthArrowButton, pressed ? styles.pressed : null]}>
            <ChevronLeft color={colors.textPrimary} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel={`${formatJourneyMonth(month)}, 연도와 월 선택 열기`}
            accessibilityRole="button"
            onPress={() => setMonthPickerVisible(true)}
            style={({pressed}) => [styles.monthTitleButton, pressed ? styles.pressed : null]}>
            <Text accessibilityRole="header" style={styles.monthTitle}>
              {formatJourneyMonth(month)}
            </Text>
            <ChevronDown color={colors.textSecondary} size={19} />
          </Pressable>
          <Pressable
            accessibilityLabel="다음 달 보기"
            accessibilityRole="button"
            onPress={() => setMonth(current => shiftMonth(current, 1))}
            style={({pressed}) => [styles.monthArrowButton, pressed ? styles.pressed : null]}>
            <ChevronRight color={colors.textPrimary} size={22} />
          </Pressable>
        </View>

        {mode === 'settings-loading' || mode === 'calendar-loading' ? (
          <StateCard loading />
        ) : mode === 'settings-error' ? (
          <StateCard error={settingsError} onRetry={() => void loadSettings()} />
        ) : mode === 'calendar-error' ? (
          <StateCard error={monthResource.error} onRetry={() => void monthResource.refresh()} />
        ) : null}

        {showCalendar ? (
          <>
            {!settings ? (
              <View style={styles.onboardingBanner}>
                <View style={styles.onboardingText}>
                  <Text style={styles.bannerTitle}>목표를 설정해 주세요.</Text>
                  <Text style={styles.bannerText}>설정 전에는 빈 달력을 둘러볼 수 있어요.</Text>
                </View>
                <Pressable
                  accessibilityLabel="메이크업 성장 목표 설정"
                  accessibilityRole="button"
                  onPress={() => setSettingsSheetVisible(true)}
                  style={({pressed}) => [styles.bannerButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.bannerButtonText}>설정하기</Text>
                </Pressable>
              </View>
            ) : null}

            {settingsError && settings ? (
              <Pressable
                accessibilityLabel="설정 새로고침 실패, 다시 시도"
                accessibilityRole="button"
                onPress={() => void loadSettings('silent')}
                style={styles.inlineError}>
                <Text accessibilityLiveRegion="polite" style={styles.inlineErrorText}>
                  {settingsError}
                </Text>
              </Pressable>
            ) : null}

            {monthResource.error && monthResource.data ? (
              <Pressable
                accessibilityLabel="새로고침 실패, 다시 시도"
                accessibilityRole="button"
                onPress={() => void monthResource.refresh()}
                style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{monthResource.error}</Text>
              </Pressable>
            ) : null}

            <JourneyMonthSummary
              days={calendarDays}
              endDate={getJourneyTrendEndDateForMonth(month, todayDate)}
              goalScore={settings?.goalScore ?? null}
              onOpenTrend={() => onOpenTrend(getJourneyTrendEndDateForMonth(month, todayDate))}
              summary={monthResource.data?.summary}
            />

            {settings && calendarDays.length === 0 && !monthResource.isLoading ? (
              <View style={styles.emptyMonth}>
                <Text style={styles.emptyMonthTitle}>이달의 피드백 기록이 없어요.</Text>
                <Text style={styles.emptyMonthText}>날짜를 눌러 메모나 미션을 남길 수 있어요.</Text>
              </View>
            ) : null}

            <Animated.View
              {...calendarSwipeResponder.panHandlers}
              accessibilityActions={[
                {name: 'decrement', label: '이전 달 보기'},
                {name: 'increment', label: '다음 달 보기'},
              ]}
              accessibilityLabel="월간 달력, 좌우로 넘겨 월 이동"
              accessibilityRole="adjustable"
              onAccessibilityAction={event => {
                if (event.nativeEvent.actionName === 'decrement') {
                  changeMonthBySwipe(-1);
                } else if (event.nativeEvent.actionName === 'increment') {
                  changeMonthBySwipe(1);
                }
              }}
              style={[
                styles.calendarCard,
                {
                  transform: [{translateX: calendarTranslateX}],
                },
              ]}>
              <View accessibilityLabel="달력 범례" style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.recordSwatch]} />
                  <Text style={styles.legendText}>사진 기록</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.scoreSwatch]} />
                  <Text style={styles.legendText}>점수·달성 여부</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.todaySwatch]} />
                  <Text style={styles.legendText}>오늘</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.emptySwatch]} />
                  <Text style={styles.legendText}>기록 없음</Text>
                </View>
              </View>

              <JourneyCalendarGrid
                days={calendarDays}
                month={month}
                onPressDay={openDay}
                todayDate={todayDate}
              />
            </Animated.View>
          </>
        ) : null}
      </ScrollView>

      <JourneySettingsSheet
        error={settingsSaveError}
        isSaving={isSavingSettings}
        isVisible={settingsSheetVisible}
        onClose={() => setSettingsSheetVisible(false)}
        onSave={input => void saveSettings(input)}
        settings={settings}
      />
      <JourneyMonthPickerSheet
        isVisible={monthPickerVisible}
        month={month}
        onClose={() => setMonthPickerVisible(false)}
        onSelectMonth={selectMonth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bannerButton: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  bannerButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  bannerText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  bannerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.screenX,
  },
  emptyMonth: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  emptyMonthText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  emptyMonthTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  calendarCard: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.heart,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: {
    gap: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerActionButton: {
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 3,
    height: 64,
    justifyContent: 'center',
    width: 52,
  },
  headerActionLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  inlineError: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  inlineErrorText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  legendItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
  },
  legendText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    lineHeight: 13,
  },
  legendSwatch: {
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  recordSwatch: {
    backgroundColor: colors.textTertiary,
  },
  scoreSwatch: {
    backgroundColor: colors.blackSurface,
  },
  emptySwatch: {
    backgroundColor: colors.divider,
  },
  todaySwatch: {
    backgroundColor: colors.black,
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthArrowButton: {
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  monthTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  monthTitleButton: {
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: spacing.xl,
  },
  onboardingBanner: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  onboardingText: {
    flex: 1,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.72,
  },
  retryButton: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    lineHeight: typography.lineHeight.xxl,
  },
  screenTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 220,
    padding: spacing.xl,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  stateTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
});
