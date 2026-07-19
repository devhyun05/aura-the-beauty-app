import {type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowRight,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  RefreshCw,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {trackMakeupJourneyEvent} from '../../../shared/services/makeupJourneyAnalytics';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppHeader} from '../../../shared/ui/AppHeader';
import {useTransientToast} from '../../../shared/ui/TransientToast';
import type {MakeupFeedbackContext} from '../../makeup-feedback/types';
import {JourneyFeedbackDigestCard} from '../components/JourneyFeedbackDigestCard';
import {JourneyMissionCard} from '../components/JourneyMissionCard';
import {JourneyNoteCard} from '../components/JourneyNoteCard';
import {JourneyPromptCard} from '../components/JourneyPromptCard';
import {JourneyReportPhotoGallery} from '../components/JourneyReportPhotoGallery';
import {useMakeupJourneyDay} from '../hooks/useMakeupJourneyDay';
import {invalidateMakeupJourneyCache} from '../services/makeupJourneyCache';
import {
  createMakeupJourneyMission,
  deleteMakeupJourneyMission,
  generateMakeupJourneyMissions,
  saveMakeupJourneyNote,
  selectMakeupJourneyScore,
  updateMakeupJourneyMission,
} from '../services/makeupJourneyService';
import type {
  MakeupJourneyCorrectionContext,
  MakeupJourneyDayResponse,
  MakeupJourneyMission,
  MakeupJourneyReport,
  MakeupJourneyStatus,
} from '../types';
import {
  addDays,
  formatJourneyDate,
  getTodayDateString,
  isFutureJourneyDate,
} from '../utils/date';
import {getMakeupJourneyReportPrompt} from '../utils/reportPrompt';

const dayScrollOffsets = new Map<string, number>();
const MAX_SAVED_DAY_OFFSETS = 20;

export type MakeupJourneyDayDetailScreenProps = {
  entryDate: string;
  initialReportId?: string;
  onBackToCalendar: () => void;
  onChangeDate: (entryDate: string) => void;
  onFirstReportActiveChange: (isFirstReportActive: boolean) => void;
  onOpenReport: (reportId: string) => void;
  onOpenTrend: (entryDate: string) => void;
  onStartCorrection: (context: MakeupJourneyCorrectionContext) => void;
  onStartInitial: (entryDate: string) => void;
};

function replaceMission(
  detail: MakeupJourneyDayResponse,
  mission: MakeupJourneyMission,
): MakeupJourneyDayResponse {
  return {
    ...detail,
    missions: detail.missions
      .map(item => item.id === mission.id ? mission : item)
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

function mergeMissions(
  current: MakeupJourneyMission[],
  incoming: MakeupJourneyMission[],
): MakeupJourneyMission[] {
  const byId = new Map(current.map(mission => [mission.id, mission]));
  incoming.forEach(mission => byId.set(mission.id, mission));
  return [...byId.values()].sort((left, right) => left.sortOrder - right.sortOrder);
}

function getInheritedGoalContext(
  context: Partial<MakeupFeedbackContext> & Record<string, unknown>,
): MakeupFeedbackContext {
  return {
    ...context,
    userGoalText:
      typeof context.userGoalText === 'string' && context.userGoalText.trim()
        ? context.userGoalText
        : '메이크업 피드백',
  };
}

function DetailHeader({
  entryDate,
  onBack,
  onOpenTrend,
  topInset,
}: {
  entryDate: string;
  onBack: () => void;
  onOpenTrend: () => void;
  topInset: number;
}) {
  return (
    <AppHeader
      contextLabel="메이크업 기록"
      onBack={onBack}
      rightSlot={(
        <Pressable
          accessibilityLabel="성장 그래프 보기"
          accessibilityRole="button"
          onPress={onOpenTrend}
          style={({pressed}) => [styles.headerIconButton, pressed ? styles.pressed : null]}>
          <ChartNoAxesCombined color={colors.textPrimary} size={20} strokeWidth={1.9} />
        </Pressable>
      )}
      title={formatJourneyDate(entryDate, false)}
      topInset={topInset}
    />
  );
}

function DetailStateCard({
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
      {loading ? <ActivityIndicator color={colors.textPrimary} /> : <CircleAlert color={colors.danger} size={28} />}
      <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>
        {loading ? '이날의 기록을 불러오는 중이에요.' : '이날의 기록을 불러오지 못했어요.'}
      </Text>
      {error ? <Text style={styles.stateText}>{error}</Text> : null}
      {onRetry ? (
        <Pressable
          accessibilityLabel="날짜 상세 다시 불러오기"
          accessibilityRole="button"
          onPress={onRetry}
          style={({pressed}) => [styles.retryButton, pressed ? styles.pressed : null]}>
          <RefreshCw color={colors.white} size={17} />
          <Text style={styles.retryText}>다시 불러오기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DayDateNavigator({
  activeReport,
  entryDate,
  isSelectingScore,
  onChangeDate,
  onSelectScore,
  representativeReportId,
}: {
  activeReport: MakeupJourneyReport | null;
  entryDate: string;
  isSelectingScore: boolean;
  onChangeDate: (entryDate: string) => void;
  onSelectScore: () => void;
  representativeReportId: string | null;
}) {
  const previousDate = addDays(entryDate, -1);
  const nextDate = addDays(entryDate, 1);
  const isSelected = activeReport?.reportId === representativeReportId;

  return (
    <View accessibilityLabel="상세 날짜 이동" style={styles.dateNavigator}>
      <Pressable
        accessibilityLabel={`이전 날 ${formatJourneyDate(previousDate, false)} 보기`}
        accessibilityRole="button"
        onPress={() => onChangeDate(previousDate)}
        style={({pressed}) => [
          styles.dateNavigatorButton,
          styles.dateNavigatorButtonPrevious,
          pressed ? styles.pressed : null,
        ]}>
        <ChevronLeft color={colors.textPrimary} size={19} />
        <View style={styles.dateNavigatorTextGroup}>
          <Text style={styles.dateNavigatorLabel}>이전 날</Text>
          <Text style={styles.dateNavigatorDate}>
            {formatJourneyDate(previousDate, false)}
          </Text>
        </View>
      </Pressable>
      {activeReport ? (
        <Pressable
          accessibilityLabel={isSelected
            ? `${activeReport.score}점이 이 날짜의 대표 점수로 선택됨`
            : `${activeReport.score}점을 이 날짜의 대표 점수로 선택`}
          accessibilityRole="button"
          accessibilityState={{disabled: isSelected || isSelectingScore, selected: isSelected}}
          disabled={isSelected || isSelectingScore}
          onPress={onSelectScore}
          style={({pressed}) => [
            styles.scoreSelectionButton,
            isSelected ? styles.scoreSelectionButtonSelected : null,
            pressed ? styles.pressed : null,
          ]}>
          {isSelectingScore ? (
            <ActivityIndicator color={isSelected ? colors.white : colors.textPrimary} size="small" />
          ) : isSelected ? (
            <CheckCircle2 color={colors.white} size={15} />
          ) : null}
          <Text style={[
            styles.scoreSelectionText,
            isSelected ? styles.scoreSelectionTextSelected : null,
          ]}>
            {isSelected ? `${activeReport.score}점 선택됨` : `${activeReport.score}점 선택`}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.dateNavigatorDivider} />
      )}
      <Pressable
        accessibilityLabel={`다음 날 ${formatJourneyDate(nextDate, false)} 보기`}
        accessibilityRole="button"
        onPress={() => onChangeDate(nextDate)}
        style={({pressed}) => [
          styles.dateNavigatorButton,
          styles.dateNavigatorButtonNext,
          pressed ? styles.pressed : null,
        ]}>
        <View style={[styles.dateNavigatorTextGroup, styles.dateNavigatorTextGroupNext]}>
          <Text style={styles.dateNavigatorLabel}>다음 날</Text>
          <Text style={styles.dateNavigatorDate}>
            {formatJourneyDate(nextDate, false)}
          </Text>
        </View>
        <ChevronRight color={colors.textPrimary} size={19} />
      </Pressable>
    </View>
  );
}

function getReportStatus(
  report: MakeupJourneyReport | null,
  goalScore: number | null,
): MakeupJourneyStatus {
  if (!report || goalScore === null) {
    return 'empty';
  }
  return report.score >= goalScore ? 'success' : 'failure';
}

function EmptyFeedbackCard({
  isFuture,
  isSettingsMissing,
  isToday,
  onStart,
}: {
  isFuture: boolean;
  isSettingsMissing: boolean;
  isToday: boolean;
  onStart: () => void;
}) {
  return (
    <View style={styles.emptyFeedbackCard}>
      <Camera color={colors.textTertiary} size={30} />
      <Text style={styles.emptyFeedbackTitle}>아직 피드백 기록이 없어요.</Text>
      <Text style={styles.emptyFeedbackText}>
        {isFuture
          ? '미래 날짜는 기록을 조회만 할 수 있어요.'
          : isSettingsMissing
            ? '목표 설정을 저장한 뒤 피드백과 기록을 시작할 수 있어요.'
            : isToday
              ? '메이크업 피드백을 받으면 점수와 한눈 요약이 자동으로 쌓여요.'
              : '새 피드백은 오늘 날짜 기록으로 저장돼요.'}
      </Text>
      {!isFuture && !isSettingsMissing ? (
        <Pressable
          accessibilityLabel={isToday ? '메이크업 피드백 받기' : '오늘 메이크업 피드백 받기'}
          accessibilityRole="button"
          onPress={onStart}
          style={({pressed}) => [styles.primaryButton, pressed ? styles.pressed : null]}>
          <Text style={styles.primaryButtonText}>
            {isToday ? '피드백 받기' : '오늘 피드백 받기'}
          </Text>
          <ArrowRight color={colors.white} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

function CorrectionCard({onStart}: {onStart: () => void}) {
  return (
    <View style={styles.correctionCard}>
      <View style={styles.correctionHero}>
        <View style={styles.correctionText}>
          <Text style={styles.correctionEyebrow}>다음 성장 기록</Text>
          <Text style={styles.correctionTitle}>피드백을 반영한 새 사진을 올려보세요</Text>
          <Text style={styles.correctionDescription}>
            이전 결과와 비교해 달라진 점을 바로 확인할 수 있어요.
          </Text>
        </View>
        <View style={styles.correctionIcon}>
          <Camera color={colors.textPrimary} size={22} strokeWidth={1.8} />
        </View>
      </View>
      <Pressable
        accessibilityLabel="수정 메이크업 업로드"
        accessibilityRole="button"
        onPress={onStart}
        style={({pressed}) => [styles.primaryButton, pressed ? styles.pressed : null]}>
        <Camera color={colors.white} size={18} />
        <Text style={styles.primaryButtonText}>재피드백 받기</Text>
      </Pressable>
    </View>
  );
}

function JourneyDayScrollPage({
  bottomInset,
  children,
  onRefresh,
  onScroll,
  refreshing,
  scrollRef,
}: {
  bottomInset: number;
  children: ReactNode;
  onRefresh: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  refreshing: boolean;
  scrollRef: (instance: ScrollView | null) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {paddingBottom: Math.max(bottomInset, spacing.xl) + spacing.xxl},
      ]}
      directionalLockEnabled
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      onScroll={onScroll}
      ref={scrollRef}
      refreshControl={(
        <RefreshControl
          onRefresh={onRefresh}
          refreshing={refreshing}
          tintColor={colors.textPrimary}
        />
      )}
      scrollEventThrottle={16}
      style={styles.pageScroll}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

export function MakeupJourneyDayDetailScreen({
  entryDate,
  initialReportId,
  onBackToCalendar,
  onChangeDate,
  onFirstReportActiveChange,
  onOpenReport,
  onOpenTrend,
  onStartCorrection,
  onStartInitial,
}: MakeupJourneyDayDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const {width: pageWidth} = useWindowDimensions();
  const resource = useMakeupJourneyDay(entryDate);
  const pagerRef = useRef<FlatList<MakeupJourneyReport>>(null);
  const pageScrollRefsRef = useRef(new Map<string, ScrollView>());
  const currentVerticalOffsetRef = useRef(dayScrollOffsets.get(entryDate) ?? 0);
  const focusCountRef = useRef(0);
  const trackedDateRef = useRef<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(
    initialReportId ?? null,
  );
  const [pendingMissionIds, setPendingMissionIds] = useState<Set<string>>(new Set());
  const [isGeneratingMissions, setIsGeneratingMissions] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSelectingScore, setIsSelectingScore] = useState(false);
  const {showToast, toast} = useTransientToast();
  const isFuture = isFutureJourneyDate(entryDate);
  const isToday = entryDate === getTodayDateString();

  useEffect(() => {
    pageScrollRefsRef.current.clear();
    currentVerticalOffsetRef.current = dayScrollOffsets.get(entryDate) ?? 0;
  }, [entryDate]);

  useEffect(() => {
    const reports = resource.data?.reports ?? [];
    setActiveReportId(current => {
      if (current && reports.some(report => report.reportId === current)) {
        return current;
      }
      if (initialReportId && reports.some(report => report.reportId === initialReportId)) {
        return initialReportId;
      }
      return reports[0]?.reportId ?? null;
    });
  }, [entryDate, initialReportId, resource.data?.reports]);

  useFocusEffect(
    useCallback(() => {
      if (focusCountRef.current > 0) {
        void resource.refresh();
      }
      focusCountRef.current += 1;
      return undefined;
    }, [resource.refresh]),
  );

  useEffect(() => {
    const detail = resource.data;
    if (!detail || trackedDateRef.current === entryDate) {
      return;
    }
    trackedDateRef.current = entryDate;
    trackMakeupJourneyEvent({
      name: 'makeup_journey_day_opened',
      properties: {
        hasReport: detail.reportCount > 0,
        reportCount: detail.reportCount,
        status: detail.status,
      },
    });
  }, [entryDate, resource.data]);

  const saveOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = Math.max(0, event.nativeEvent.contentOffset.y);
    currentVerticalOffsetRef.current = offset;
    dayScrollOffsets.set(entryDate, offset);
    if (dayScrollOffsets.size > MAX_SAVED_DAY_OFFSETS) {
      const oldestKey = dayScrollOffsets.keys().next().value;
      if (typeof oldestKey === 'string') {
        dayScrollOffsets.delete(oldestKey);
      }
    }
  };

  const registerPageScrollRef = (pageKey: string, instance: ScrollView | null) => {
    if (!instance) {
      pageScrollRefsRef.current.delete(pageKey);
      return;
    }
    pageScrollRefsRef.current.set(pageKey, instance);
    requestAnimationFrame(() => {
      instance.scrollTo({animated: false, y: currentVerticalOffsetRef.current});
    });
  };

  const synchronizePageOffsets = () => {
    const y = currentVerticalOffsetRef.current;
    pageScrollRefsRef.current.forEach(instance => {
      instance.scrollTo({animated: false, y});
    });
  };

  const setMissionPending = (missionId: string, pending: boolean) => {
    setPendingMissionIds(current => {
      const next = new Set(current);
      if (pending) {
        next.add(missionId);
      } else {
        next.delete(missionId);
      }
      return next;
    });
  };

  const toggleMission = async (mission: MakeupJourneyMission) => {
    const nextCompleted = !mission.isCompleted;
    setMissionPending(mission.id, true);
    resource.setData(detail => replaceMission(detail, {
      ...mission,
      isCompleted: nextCompleted,
      completedAt: nextCompleted ? new Date().toISOString() : null,
    }));
    try {
      const savedMission = await updateMakeupJourneyMission(mission.id, {
        isCompleted: nextCompleted,
      });
      resource.setData(detail => replaceMission(detail, savedMission));
      invalidateMakeupJourneyCache({entryDate});
      if (nextCompleted) {
        trackMakeupJourneyEvent({
          name: 'makeup_journey_mission_completed',
          properties: {difficulty: mission.difficulty, source: mission.source},
        });
      }
    } catch (error) {
      resource.setData(detail => replaceMission(detail, mission));
      showToast(error instanceof Error ? error.message : '미션 상태를 저장하지 못했어요.');
    } finally {
      setMissionPending(mission.id, false);
    }
  };

  const createMission = async (title: string) => {
    try {
      const mission = await createMakeupJourneyMission(entryDate, title);
      resource.setData(detail => ({
        ...detail,
        missions: mergeMissions(detail.missions, [mission]),
      }));
      invalidateMakeupJourneyCache({entryDate});
    } catch (error) {
      showToast(error instanceof Error ? error.message : '미션을 추가하지 못했어요.');
      throw error;
    }
  };

  const generateMissions = async () => {
    setIsGeneratingMissions(true);
    try {
      const missions = await generateMakeupJourneyMissions(entryDate);
      resource.setData(detail => ({
        ...detail,
        missions: mergeMissions(detail.missions, missions),
      }));
      invalidateMakeupJourneyCache({entryDate});
    } catch (error) {
      showToast(error instanceof Error ? error.message : '맞춤 미션을 만들지 못했어요.');
    } finally {
      setIsGeneratingMissions(false);
    }
  };

  const updateMissionTitle = async (mission: MakeupJourneyMission, title: string) => {
    setMissionPending(mission.id, true);
    try {
      const savedMission = await updateMakeupJourneyMission(mission.id, {title});
      resource.setData(detail => replaceMission(detail, savedMission));
      invalidateMakeupJourneyCache({entryDate});
    } catch (error) {
      showToast(error instanceof Error ? error.message : '미션을 수정하지 못했어요.');
      throw error;
    } finally {
      setMissionPending(mission.id, false);
    }
  };

  const deleteMission = async (mission: MakeupJourneyMission) => {
    resource.setData(detail => ({
      ...detail,
      missions: detail.missions.filter(item => item.id !== mission.id),
    }));
    try {
      await deleteMakeupJourneyMission(mission.id);
      invalidateMakeupJourneyCache({entryDate});
    } catch (error) {
      resource.setData(detail => ({
        ...detail,
        missions: mergeMissions(detail.missions, [mission]),
      }));
      showToast(error instanceof Error ? error.message : '미션을 삭제하지 못했어요.');
    }
  };

  const saveNote = async (content: string, reportId: string | null) => {
    setIsSavingNote(true);
    try {
      const note = await saveMakeupJourneyNote(entryDate, content, reportId);
      resource.setData(detail => ({
        ...detail,
        note: reportId === null || detail.representativeReportId === reportId
          ? note
          : detail.note,
        reports: reportId === null
          ? detail.reports
          : detail.reports.map(report => report.reportId === reportId
            ? {...report, note}
            : report),
      }));
      invalidateMakeupJourneyCache({entryDate});
      showToast(content.trim() ? '메모를 저장했어요.' : '메모를 삭제했어요.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '메모를 저장하지 못했어요.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const correctionContext = useMemo<MakeupJourneyCorrectionContext | null>(() => {
    const detail = resource.data;
    const latestReport = detail?.reports[detail.reports.length - 1];
    if (!detail || !latestReport) {
      return null;
    }
    return {
      entryDate,
      feedbackKind: 'correction',
      parentFeedbackReportId: latestReport.reportId,
      inheritedGoalContext: getInheritedGoalContext(latestReport.goalContext ?? {}),
      parentScore: detail.latestScore ?? latestReport.score,
    };
  }, [entryDate, resource.data]);

  const detail = resource.data;
  const isSettingsMissing = detail?.goalScore === null;
  const writesDisabled = isFuture || isSettingsMissing;
  const activeReport = useMemo(
    () => detail?.reports.find(report => report.reportId === activeReportId)
      ?? detail?.reports[0]
      ?? null,
    [activeReportId, detail?.reports],
  );
  const activeReportIndex = detail?.reports.findIndex(
    report => report.reportId === activeReport?.reportId,
  ) ?? -1;
  const isFirstReportActive = activeReportIndex <= 0;

  useEffect(() => {
    onFirstReportActiveChange(isFirstReportActive);
  }, [isFirstReportActive, onFirstReportActiveChange]);

  useEffect(() => {
    if (!detail || !activeReport || pageWidth <= 0) {
      return;
    }
    const index = detail.reports.findIndex(report => report.reportId === activeReport.reportId);
    if (index < 0) {
      return;
    }
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToOffset({animated: false, offset: index * pageWidth});
    });
  }, [activeReport, detail, pageWidth]);

  const settleActiveReport = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!detail || pageWidth <= 0) {
      return;
    }
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    const index = Math.max(0, Math.min(detail.reports.length - 1, rawIndex));
    const nextReport = detail.reports[index];
    if (nextReport) {
      setActiveReportId(nextReport.reportId);
    }
  };

  const selectActiveScore = async () => {
    if (!detail || !activeReport || activeReport.reportId === detail.representativeReportId) {
      return;
    }
    setIsSelectingScore(true);
    try {
      const selection = await selectMakeupJourneyScore(entryDate, activeReport.reportId);
      resource.setData(current => ({
        ...current,
        feedbackDigest: activeReport.feedbackDigest,
        representativeReportId: selection.reportId,
        representativeScore: selection.score,
        scoreDelta: current.firstScore === null ? null : selection.score - current.firstScore,
        status: getReportStatus(activeReport, current.goalScore),
      }));
      invalidateMakeupJourneyCache({entryDate});
      showToast(`${selection.score}점을 이 날짜의 대표 점수로 선택했어요.`);
      await resource.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '대표 점수를 저장하지 못했어요.');
    } finally {
      setIsSelectingScore(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <DetailHeader
        entryDate={entryDate}
        onBack={onBackToCalendar}
        onOpenTrend={() => onOpenTrend(entryDate)}
        topInset={insets.top}
      />
      <DayDateNavigator
        activeReport={activeReport}
        entryDate={entryDate}
        isSelectingScore={isSelectingScore}
        onChangeDate={onChangeDate}
        onSelectScore={() => void selectActiveScore()}
        representativeReportId={detail?.representativeReportId ?? null}
      />
      {detail && detail.reports.length > 0 ? (
        <FlatList
          bounces={false}
          data={detail.reports}
          decelerationRate="fast"
          directionalLockEnabled
          getItemLayout={(_data, index) => ({
            index,
            length: pageWidth,
            offset: pageWidth * index,
          })}
          horizontal
          initialNumToRender={Math.min(2, detail.reports.length)}
          key={entryDate}
          keyExtractor={report => report.reportId}
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={3}
          nestedScrollEnabled
          onMomentumScrollEnd={settleActiveReport}
          onScrollBeginDrag={synchronizePageOffsets}
          pagingEnabled
          ref={pagerRef}
          removeClippedSubviews={false}
          renderItem={({item: report}) => {
            const prompt = getMakeupJourneyReportPrompt(
              report.goalContext,
              report.feedbackKind,
            );

            return (
              <View style={[styles.reportPage, {width: pageWidth}]}>
                <JourneyDayScrollPage
                bottomInset={insets.bottom}
                onRefresh={() => void resource.refresh()}
                onScroll={saveOffset}
                refreshing={resource.isRefreshing}
                scrollRef={instance => registerPageScrollRef(report.reportId, instance)}>
                {resource.error ? (
                  <Pressable
                    accessibilityLabel="새로고침 실패, 다시 시도"
                    accessibilityRole="button"
                    onPress={() => void resource.refresh()}
                    style={styles.inlineError}>
                    <Text style={styles.inlineErrorText}>{resource.error}</Text>
                  </Pressable>
                ) : null}
                <JourneyReportPhotoGallery
                  activeReportId={report.reportId}
                  onOpenReport={onOpenReport}
                  reports={detail.reports}
                />
                {prompt ? <JourneyPromptCard prompt={prompt} /> : null}
                {report.feedbackDigest ? (
                  <JourneyFeedbackDigestCard
                    digest={report.feedbackDigest}
                    goalScore={detail.goalScore}
                    onOpenReport={onOpenReport}
                    score={report.score}
                    status={getReportStatus(report, detail.goalScore)}
                  />
                ) : (
                  <EmptyFeedbackCard
                    isFuture={isFuture}
                    isSettingsMissing={isSettingsMissing}
                    isToday={isToday}
                    onStart={() => onStartInitial(entryDate)}
                  />
                )}
                {correctionContext && !writesDisabled ? (
                  <CorrectionCard onStart={() => onStartCorrection(correctionContext)} />
                ) : null}
                <JourneyMissionCard
                  disabled={writesDisabled}
                  isGenerating={isGeneratingMissions}
                  missions={detail.missions}
                  onCreate={createMission}
                  onDelete={deleteMission}
                  onGenerate={generateMissions}
                  onToggle={toggleMission}
                  onUpdateTitle={updateMissionTitle}
                  pendingMissionIds={pendingMissionIds}
                />
                <JourneyNoteCard
                  key={`journey-note-${report.reportId}`}
                  disabled={writesDisabled}
                  isSaving={isSavingNote}
                  note={report.note}
                  onSave={content => saveNote(content, report.reportId)}
                />
                </JourneyDayScrollPage>
              </View>
            );
          }}
          scrollEnabled={detail.reports.length > 1}
          showsHorizontalScrollIndicator={false}
          style={styles.reportPager}
          windowSize={3}
        />
      ) : (
        <JourneyDayScrollPage
          bottomInset={insets.bottom}
          onRefresh={() => void resource.refresh()}
          onScroll={saveOffset}
          refreshing={resource.isRefreshing}
          scrollRef={instance => registerPageScrollRef('empty', instance)}>
          {resource.isLoading && !detail ? (
            <DetailStateCard loading />
          ) : resource.error && !detail ? (
            <DetailStateCard error={resource.error} onRetry={() => void resource.refresh()} />
          ) : detail ? (
            <>
              {resource.error ? (
                <Pressable
                  accessibilityLabel="새로고침 실패, 다시 시도"
                  accessibilityRole="button"
                  onPress={() => void resource.refresh()}
                  style={styles.inlineError}>
                  <Text style={styles.inlineErrorText}>{resource.error}</Text>
                </Pressable>
              ) : null}
              <EmptyFeedbackCard
                isFuture={isFuture}
                isSettingsMissing={isSettingsMissing}
                isToday={isToday}
                onStart={() => onStartInitial(entryDate)}
              />
              <JourneyMissionCard
                disabled={writesDisabled}
                isGenerating={isGeneratingMissions}
                missions={detail.missions}
                onCreate={createMission}
                onDelete={deleteMission}
                onGenerate={generateMissions}
                onToggle={toggleMission}
                onUpdateTitle={updateMissionTitle}
                pendingMissionIds={pendingMissionIds}
              />
              <JourneyNoteCard
                disabled={writesDisabled}
                isSaving={isSavingNote}
                note={detail.note}
                onSave={content => saveNote(content, null)}
              />
            </>
          ) : null}
        </JourneyDayScrollPage>
      )}
      {toast}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  correctionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.025,
    shadowRadius: 10,
  },
  correctionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  correctionEyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  correctionHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  correctionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  correctionText: {
    flex: 1,
    gap: spacing.xs,
  },
  correctionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  dateNavigator: {
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  dateNavigatorButton: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.sm,
  },
  dateNavigatorButtonNext: {
    justifyContent: 'flex-end',
  },
  dateNavigatorButtonPrevious: {
    justifyContent: 'flex-start',
  },
  dateNavigatorDate: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  dateNavigatorDivider: {
    alignSelf: 'center',
    backgroundColor: colors.divider,
    height: 28,
    width: 1,
  },
  dateNavigatorLabel: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  dateNavigatorTextGroup: {
    gap: 1,
  },
  dateNavigatorTextGroupNext: {
    alignItems: 'flex-end',
  },
  emptyFeedbackCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 230,
    padding: spacing.xl,
  },
  emptyFeedbackText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyFeedbackTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: colors.headerControlSurface,
    borderColor: colors.headerControlBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.04,
    shadowRadius: 10,
    width: 40,
  },
  inlineError: {
    backgroundColor: 'rgba(255, 90, 77, 0.08)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  inlineErrorText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  scoreSelectionButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    width: 88,
  },
  scoreSelectionButtonSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  scoreSelectionText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
  scoreSelectionTextSelected: {
    color: colors.white,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  pageScroll: {
    flex: 1,
  },
  reportPage: {
    flex: 1,
  },
  reportPager: {
    flex: 1,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 280,
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
