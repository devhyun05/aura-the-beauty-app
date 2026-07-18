import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {trackMakeupJourneyEvent} from '../../../shared/services/makeupJourneyAnalytics';
import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import {useTransientToast} from '../../../shared/ui/TransientToast';
import type {MakeupFeedbackContext} from '../../makeup-feedback/types';
import {JourneyFeedbackDigestCard} from '../components/JourneyFeedbackDigestCard';
import {JourneyMissionCard} from '../components/JourneyMissionCard';
import {JourneyNoteCard} from '../components/JourneyNoteCard';
import {JourneyReportPhotoGallery} from '../components/JourneyReportPhotoGallery';
import {useMakeupJourneyDay} from '../hooks/useMakeupJourneyDay';
import {invalidateMakeupJourneyCache} from '../services/makeupJourneyCache';
import {
  createMakeupJourneyMission,
  deleteMakeupJourneyMission,
  generateMakeupJourneyMissions,
  saveMakeupJourneyNote,
  updateMakeupJourneyMission,
} from '../services/makeupJourneyService';
import type {
  MakeupJourneyCorrectionContext,
  MakeupJourneyDayResponse,
  MakeupJourneyMission,
} from '../types';
import {
  addDays,
  formatJourneyDate,
  getTodayDateString,
  isFutureJourneyDate,
} from '../utils/date';
import {getJourneyStatusLabel} from '../utils/presentation';

const dayScrollOffsets = new Map<string, number>();
const MAX_SAVED_DAY_OFFSETS = 20;

export type MakeupJourneyDayDetailScreenProps = {
  entryDate: string;
  onBackToCalendar: () => void;
  onChangeDate: (entryDate: string) => void;
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
    <View style={[styles.fixedHeader, {paddingTop: topInset}]}>
      <Pressable
        accessibilityLabel="달력으로"
        accessibilityRole="button"
        onPress={onBack}
        style={({pressed}) => [styles.headerIconButton, pressed ? styles.pressed : null]}>
        <ArrowLeft color={colors.textPrimary} size={22} />
      </Pressable>
      <View style={styles.headerTitleGroup}>
        <Text style={styles.headerEyebrow}>메이크업 기록</Text>
        <Text accessibilityRole="header" style={styles.headerDate}>
          {formatJourneyDate(entryDate, false)}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="성장 그래프 보기"
        accessibilityRole="button"
        onPress={onOpenTrend}
        style={({pressed}) => [styles.headerIconButton, pressed ? styles.pressed : null]}>
        <ChartNoAxesCombined color={colors.textPrimary} size={22} />
      </Pressable>
    </View>
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
  entryDate,
  onChangeDate,
}: {
  entryDate: string;
  onChangeDate: (entryDate: string) => void;
}) {
  const previousDate = addDays(entryDate, -1);
  const nextDate = addDays(entryDate, 1);

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
        <ArrowLeft color={colors.textPrimary} size={18} />
        <View style={styles.dateNavigatorTextGroup}>
          <Text style={styles.dateNavigatorLabel}>이전 날</Text>
          <Text style={styles.dateNavigatorDate}>
            {formatJourneyDate(previousDate, false)}
          </Text>
        </View>
      </Pressable>
      <View style={styles.dateNavigatorDivider} />
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
        <ArrowRight color={colors.textPrimary} size={18} />
      </Pressable>
    </View>
  );
}

function DayOverview({detail}: {detail: MakeupJourneyDayResponse}) {
  const successful = detail.status === 'success';
  const StatusIcon = successful ? CheckCircle2 : CircleAlert;
  const statusColor = successful
    ? colors.danger
    : detail.status === 'failure'
      ? colors.textSecondary
      : colors.textTertiary;
  const latestScore = detail.latestScore;
  const scoreDelta = detail.scoreDelta;
  const goalDifference = latestScore !== null && detail.goalScore !== null
    ? latestScore - detail.goalScore
    : null;
  const goalMessage = detail.goalScore === null
    ? '목표 점수를 설정하면 달성 여부를 알려드려요.'
    : latestScore === null
      ? `오늘의 목표는 ${detail.goalScore}점이에요.`
      : goalDifference === 0
        ? `목표 ${detail.goalScore}점에 정확히 도달했어요.`
        : goalDifference !== null && goalDifference > 0
          ? `목표보다 ${goalDifference}점 높아요. 오늘 메이크업이 잘 맞았어요.`
          : `목표까지 ${Math.abs(goalDifference ?? 0)}점 남았어요. 다음 피드백에서 채워봐요.`;

  return (
    <View style={[
      styles.overviewCard,
      detail.status === 'success'
        ? styles.overviewSuccess
        : detail.status === 'failure'
          ? styles.overviewFailure
          : styles.overviewEmpty,
    ]}>
      <View style={styles.overviewHeader}>
        <Text style={styles.overviewEyebrow}>오늘의 메이크업 점수</Text>
        <View style={styles.statusBadge}>
          <StatusIcon color={statusColor} size={16} />
          <Text style={[styles.statusBadgeText, {color: statusColor}]}>
            {getJourneyStatusLabel(detail.status)}
          </Text>
        </View>
      </View>
      <View style={styles.scoreHeroRow}>
        <Text style={styles.scoreHero}>{latestScore ?? '—'}</Text>
        {latestScore !== null ? <Text style={styles.scoreUnit}>점</Text> : null}
      </View>
      <Text style={styles.goalText}>{goalMessage}</Text>
      <View accessibilityLabel="점수 변화" style={styles.scoreStats}>
        <View style={styles.scoreStatItem}>
          <Text style={styles.scoreStatLabel}>첫 피드백</Text>
          <Text style={styles.scoreStatValue}>
            {detail.firstScore === null ? '—' : `${detail.firstScore}점`}
          </Text>
        </View>
        <View style={styles.scoreStatDivider} />
        <View style={styles.scoreStatItem}>
          <Text style={styles.scoreStatLabel}>최신 피드백</Text>
          <Text style={styles.scoreStatValue}>
            {latestScore === null ? '—' : `${latestScore}점`}
          </Text>
        </View>
        <View style={styles.scoreStatDivider} />
        <View style={styles.scoreStatItem}>
          <Text style={styles.scoreStatLabel}>점수 변화</Text>
          <Text style={styles.scoreStatValue}>
            {scoreDelta === null ? '—' : scoreDelta > 0 ? `+${scoreDelta}점` : `${scoreDelta}점`}
          </Text>
        </View>
      </View>
    </View>
  );
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
      <View style={styles.correctionText}>
        <Text style={styles.correctionEyebrow}>다음 성장 기록</Text>
        <Text style={styles.correctionTitle}>피드백을 반영해 보셨나요?</Text>
        <Text style={styles.correctionDescription}>
          새 사진을 올리면 이전 결과와 비교해 달라진 점을 바로 보여드려요.
        </Text>
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

export function MakeupJourneyDayDetailScreen({
  entryDate,
  onBackToCalendar,
  onChangeDate,
  onOpenReport,
  onOpenTrend,
  onStartCorrection,
  onStartInitial,
}: MakeupJourneyDayDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const resource = useMakeupJourneyDay(entryDate);
  const scrollRef = useRef<ScrollView>(null);
  const didRestoreScrollRef = useRef(false);
  const focusCountRef = useRef(0);
  const trackedDateRef = useRef<string | null>(null);
  const [pendingMissionIds, setPendingMissionIds] = useState<Set<string>>(new Set());
  const [isGeneratingMissions, setIsGeneratingMissions] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const {showToast, toast} = useTransientToast();
  const isFuture = isFutureJourneyDate(entryDate);
  const isToday = entryDate === getTodayDateString();

  useEffect(() => {
    didRestoreScrollRef.current = false;
  }, [entryDate]);

  useEffect(() => {
    if (!resource.data || didRestoreScrollRef.current) {
      return;
    }
    didRestoreScrollRef.current = true;
    const savedOffset = dayScrollOffsets.get(entryDate) ?? 0;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({animated: false, y: savedOffset});
    });
  }, [entryDate, resource.data]);

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
    dayScrollOffsets.set(entryDate, event.nativeEvent.contentOffset.y);
    if (dayScrollOffsets.size > MAX_SAVED_DAY_OFFSETS) {
      const oldestKey = dayScrollOffsets.keys().next().value;
      if (typeof oldestKey === 'string') {
        dayScrollOffsets.delete(oldestKey);
      }
    }
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

  const saveNote = async (content: string) => {
    setIsSavingNote(true);
    try {
      const note = await saveMakeupJourneyNote(entryDate, content);
      resource.setData(detail => ({...detail, note}));
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
        entryDate={entryDate}
        onChangeDate={onChangeDate}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl},
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={saveOffset}
        ref={scrollRef}
        refreshControl={(
          <RefreshControl
            onRefresh={() => void resource.refresh()}
            refreshing={resource.isRefreshing}
            tintColor={colors.textPrimary}
          />
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
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
            <JourneyReportPhotoGallery
              onOpenReport={onOpenReport}
              reports={detail.reports}
            />
            <DayOverview detail={detail} />
            {detail.feedbackDigest && detail.latestScore !== null ? (
              <JourneyFeedbackDigestCard
                digest={detail.feedbackDigest}
                goalScore={detail.goalScore}
                latestScore={detail.latestScore}
                onOpenReport={onOpenReport}
                status={detail.status}
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
              disabled={writesDisabled}
              isSaving={isSavingNote}
              note={detail.note}
              onSave={saveNote}
            />
          </>
        ) : null}
      </ScrollView>
      {toast}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.lg,
  },
  correctionCard: {
    ...shadows.soft,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  correctionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  correctionEyebrow: {
    color: colors.danger,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  correctionText: {
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
    backgroundColor: colors.white,
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
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
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
  fixedHeader: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  goalText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  headerDate: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  headerEyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerTitleGroup: {
    alignItems: 'center',
    gap: 1,
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
  overviewCard: {
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.xl,
  },
  overviewEmpty: {
    backgroundColor: colors.surfaceMuted,
  },
  overviewEyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  overviewFailure: {
    backgroundColor: 'rgba(17, 17, 17, 0.07)',
  },
  overviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overviewSuccess: {
    backgroundColor: 'rgba(255, 90, 77, 0.10)',
  },
  pressed: {
    opacity: 0.7,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.blackSurface,
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
  scoreHero: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 48,
    lineHeight: 54,
  },
  scoreHeroRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  scoreStatDivider: {
    backgroundColor: 'rgba(17, 17, 17, 0.08)',
    height: 32,
    width: 1,
  },
  scoreStatItem: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  scoreStatLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  scoreStats: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: radius.md,
    flexDirection: 'row',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  scoreStatValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  scoreUnit: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    paddingBottom: spacing.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stateCard: {
    ...shadows.soft,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
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
  statusBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusBadgeText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
