import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {resolveMakeupJourneyVisibleState} from '../hooks/useMakeupJourneyResource';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function source(fileName: string): string {
  return readFileSync(
    join(process.cwd(), 'apps/mobile/src/features/makeup-journey', fileName),
    'utf8',
  );
}

const monthScreen = source('screens/MakeupJourneyScreen.tsx');
const detailScreen = source('screens/MakeupJourneyDayDetailScreen.tsx');
const trendScreen = source('screens/MakeupJourneyTrendScreen.tsx');
const digestCard = source('components/JourneyFeedbackDigestCard.tsx');
const missionCard = source('components/JourneyMissionCard.tsx');
const promptCard = source('components/JourneyPromptCard.tsx');
const reportPhotoGallery = source('components/JourneyReportPhotoGallery.tsx');
const dayCell = source('components/JourneyDayCell.tsx');
const calendarGrid = source('components/JourneyCalendarGrid.tsx');
const scoreChart = source('components/JourneyScoreChart.tsx');
const settingsSheet = source('components/JourneySettingsSheet.tsx');
const monthPickerSheet = source('components/JourneyMonthPickerSheet.tsx');
const monthSummary = source('components/JourneyMonthSummary.tsx');
const journeyService = source('services/makeupJourneyService.ts');
const journeyPrefetch = source('services/makeupJourneyPrefetch.ts');
const journeyPrivateImage = source('services/makeupJourneyPrivateImage.ts');
const authSessionContext = readFileSync(
  join(
    process.cwd(),
    'apps/mobile/src/features/auth/services/authSessionContext.tsx',
  ),
  'utf8',
);
const feedbackRoutes = readFileSync(
  join(
    process.cwd(),
    'apps/mobile/src/app/navigation/routes/makeupFeedbackRoutes.tsx',
  ),
  'utf8',
);
const feedbackService = readFileSync(
  join(
    process.cwd(),
    'apps/mobile/src/features/makeup-feedback/services/makeupFeedbackService.ts',
  ),
  'utf8',
);
const feedbackResultScreen = readFileSync(
  join(
    process.cwd(),
    'apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackResultScreen.tsx',
  ),
  'utf8',
);
const journeyRoutes = readFileSync(
  join(
    process.cwd(),
    'apps/mobile/src/app/navigation/routes/makeupJourneyRoutes.tsx',
  ),
  'utf8',
);
const rootNavigator = readFileSync(
  join(process.cwd(), 'apps/mobile/src/app/navigation/RootNavigator.tsx'),
  'utf8',
);

expect(
  monthScreen.includes('<RefreshControl') &&
    monthScreen.includes("mode === 'settings-error'") &&
    monthScreen.includes("mode === 'calendar-error'"),
  'month screen keeps explicit refresh and settings/calendar error states',
);
expect(
  monthScreen.includes('<JourneySettingsSheet') &&
    monthScreen.includes('settingsSheetVisible'),
  'month screen keeps first-entry onboarding settings in the same feature',
);
expect(
  monthScreen.includes("void loadSettings('silent');") &&
    monthScreen.includes('}, [loadSettings, monthResource.refresh, syncTodayDate]),') &&
    !monthScreen.includes('[loadSettings, monthResource.refresh, settings]'),
  'focus refresh does not depend on the newly allocated settings response object',
);
expect(
  monthScreen.includes("loadSettings('refresh')") &&
    monthScreen.includes('refreshing={settingsRefreshing || monthResource.isRefreshing}'),
  'onboarding pull-to-refresh exposes settings request progress',
);
const saveSettingsStart = monthScreen.indexOf('const saveSettings = async');
const saveSettingsAwait = monthScreen.indexOf(
  'await saveMakeupJourneySettings(input)',
  saveSettingsStart,
);
const invalidateSettingsRead = monthScreen.indexOf(
  'settingsRequestRef.current += 1;',
  saveSettingsStart,
);
expect(
  monthScreen.includes('if (settingsMutationActiveRef.current)') &&
    invalidateSettingsRead > saveSettingsStart &&
    invalidateSettingsRead < saveSettingsAwait &&
    monthScreen.includes('settingsMutationActiveRef.current = false;'),
  'settings writes block new reads and invalidate older GET responses before awaiting PUT',
);

const disabledResourceState = {
  data: null,
  enabled: false,
  error: null,
  isLoading: false,
  isRefreshing: false,
  key: '2026-07',
};
const newlyEnabledResourceState = resolveMakeupJourneyVisibleState(
  disabledResourceState,
  {cached: null, enabled: true, key: '2026-07'},
);
expect(
  newlyEnabledResourceState.isLoading && newlyEnabledResourceState.data === null,
  'enabling the month resource cannot flash a false empty-calendar state before its request',
);
const cachedResource = {month: '2026-07'};
const newlyEnabledCachedState = resolveMakeupJourneyVisibleState(
  disabledResourceState,
  {cached: cachedResource, enabled: true, key: '2026-07'},
);
expect(
  !newlyEnabledCachedState.isLoading && newlyEnabledCachedState.data === cachedResource,
  'enabling a cached resource renders cache data without a loading flash',
);
expect(
  settingsSheet.includes('useSafeAreaInsets') &&
    settingsSheet.includes('paddingBottom: Math.max(insets.bottom, spacing.xxl)'),
  'settings sheet keeps its final action above the physical-device bottom safe area',
);

const headerIndex = detailScreen.indexOf('\n      <DetailHeader');
const pagerIndex = detailScreen.indexOf('\n        <FlatList');
expect(headerIndex >= 0 && pagerIndex > headerIndex, 'fixed detail header is outside and before the report pager');
expect(
  detailScreen.match(/\n\s*<ScrollView\n/g)?.length === 1,
  'each report page reuses one vertical ScrollView implementation',
);
expect(
  detailScreen.includes('dayScrollOffsets') &&
    detailScreen.includes('synchronizePageOffsets') &&
    detailScreen.includes('instance.scrollTo({animated: false, y'),
  'day detail restores and synchronizes the vertical offset across report pages',
);
expect(
  detailScreen.includes('keyboardShouldPersistTaps="handled"') &&
    detailScreen.includes('<RefreshControl'),
  'day detail preserves keyboard and pull-to-refresh behavior',
);
expect(
    detailScreen.includes('<DayDateNavigator') &&
    detailScreen.includes('addDays(entryDate, -1)') &&
    detailScreen.includes('addDays(entryDate, 1)') &&
    detailScreen.includes('accessibilityLabel={`이전 날 ${formatJourneyDate(previousDate, false)} 보기`}') &&
    detailScreen.includes('accessibilityLabel={`다음 날 ${formatJourneyDate(nextDate, false)} 보기`}') &&
    !detailScreen.includes('nextDate <= getTodayDateString()') &&
    journeyRoutes.includes(
      'navigation.setParams({entryDate: nextEntryDate, initialReportId: undefined});',
    ),
  'day detail moves one day backward or forward in place without a today boundary',
);
expect(
  detailScreen.indexOf('<JourneyReportPhotoGallery') < detailScreen.indexOf('<JourneyFeedbackDigestCard') &&
    detailScreen.indexOf('<JourneyReportPhotoGallery') < detailScreen.indexOf('<JourneyPromptCard') &&
    detailScreen.indexOf('<JourneyPromptCard') < detailScreen.indexOf('<JourneyFeedbackDigestCard') &&
    detailScreen.indexOf('<JourneyFeedbackDigestCard') < detailScreen.indexOf('<CorrectionCard') &&
    detailScreen.indexOf('<CorrectionCard') < detailScreen.indexOf('<JourneyMissionCard') &&
    detailScreen.indexOf('<JourneyMissionCard') < detailScreen.indexOf('<JourneyNoteCard'),
  'day detail keeps the photo, original prompt, report summary, and correction action order',
);
expect(
  reportPhotoGallery.includes('source={{uri: report.imageUrl') &&
    reportPhotoGallery.includes('onOpenReport(report.reportId)') &&
    reportPhotoGallery.includes('화면 어디서든 좌우로 밀어 이전·다음 기록을 볼 수 있어요.') &&
    !reportPhotoGallery.includes('<ScrollView') &&
    reportPhotoGallery.includes('사진을 불러오지 못했어요.'),
  'the photo card renders only the active report while the parent page owns horizontal paging',
);
expect(
  detailScreen.includes('<FlatList') &&
    detailScreen.includes('horizontal') &&
    detailScreen.includes('pagingEnabled') &&
    detailScreen.includes('onMomentumScrollEnd={settleActiveReport}') &&
    detailScreen.includes('renderItem={({item: report})') &&
    detailScreen.includes('getMakeupJourneyReportPrompt(') &&
    detailScreen.includes('report.goalContext') &&
    detailScreen.includes('report.feedbackKind') &&
    detailScreen.includes('digest={report.feedbackDigest}') &&
    detailScreen.includes('score={report.score}') &&
    detailScreen.includes('representativeReportId={detail?.representativeReportId ?? null}') &&
    detailScreen.includes('await selectMakeupJourneyScore(entryDate, activeReport.reportId)') &&
    detailScreen.includes('missions={detail.missions}') &&
    detailScreen.includes('note={report.note}') &&
    detailScreen.includes('saveNote(content, report.reportId)') &&
    journeyService.includes('/score-selection') &&
    journeyService.includes('{method: \'PUT\', body: {reportId}}') &&
    journeyService.includes('{method: \'PUT\', body: {content, reportId}}'),
  'the whole detail page pages smoothly with each report prompt and note while missions stay date-shared',
);
expect(
  rootNavigator.includes('name="MakeupJourneyDayDetail"') &&
    rootNavigator.includes(
      'getComponent={() => loadMakeupJourneyRoutes().MakeupJourneyDayDetailRouteScreen}',
    ) &&
    rootNavigator.includes('options={{gestureEnabled: false}}') &&
    detailScreen.includes('onFirstReportActiveChange(isFirstReportActive)') &&
    journeyRoutes.includes('onFirstReportActiveChange={setIsFirstReportActive}') &&
    journeyRoutes.includes('const swipeBackEnabled = isFirstReportActive && navigation.canGoBack();') &&
    journeyRoutes.includes('fullScreenGestureEnabled: swipeBackEnabled') &&
    journeyRoutes.includes('gestureEnabled: swipeBackEnabled'),
  'native swipe-back is disabled by default and enabled only while the first report is active',
);
expect(
  monthScreen.includes('accessibilityLabel="전체 성장 그래프 보기"') &&
    monthScreen.includes('onOpenTrend(getJourneyTrendEndDateForMonth(month))') &&
    journeyRoutes.includes("rootNavigation?.navigate('MakeupJourneyTrend', {entryDate});"),
  'calendar header exposes the full growth graph route',
);
expect(
  !digestCard.includes('numberOfLines=') &&
    digestCard.includes('AI 피드백') &&
    digestCard.includes('현재 선택한 사진의 실제 분석 결과예요.') &&
    digestCard.includes('styles.card') &&
    digestCard.includes('styles.findings') &&
    digestCard.includes('먼저 해볼 것') &&
    digestCard.includes('전체 AI 보고서 보기'),
  'digest copy grows vertically in one restrained surface with findings, next action, and report hierarchy',
);
expect(
  promptCard.includes('내가 요청한 내용') &&
    promptCard.includes('이전 피드백의 요청을 이어받아 분석했어요.') &&
    promptCard.includes('numberOfLines={expanded ? undefined : 3}') &&
    promptCard.includes("accessibilityRole=\"button\""),
  'the report-specific original prompt is readable, collapsible, and labels correction inheritance',
);
expect(
  !journeyService.includes('legacy-read-fallback') &&
    !journeyService.includes('legacyMakeupJourneySettings') &&
    journeyService.includes('/makeup-journey/calendar') &&
    journeyService.includes('/makeup-journey/days/'),
  'calendar and record screens display only authenticated backend data instead of legacy placeholder values',
);
expect(
  dayCell.includes('columnIndex < 6 ? styles.withRightDivider : null') &&
    dayCell.includes('weekIndex < 5 ? styles.withBottomDivider : null') &&
    dayCell.includes('<CachedImage') &&
    dayCell.includes('day?.representativeThumbnailUrl?.trim()') &&
    dayCell.includes('cachePolicy="memory"') &&
    dayCell.includes('getMakeupJourneyPrivateImageSource(') &&
    dayCell.includes('styles.recordOverlay') &&
    dayCell.includes("backgroundColor: 'rgba(17, 17, 17, 0.62)'") &&
    dayCell.includes("alignSelf: 'flex-start'") &&
    dayCell.includes('{getStatusLabel(status)}') &&
    dayCell.includes("const JOURNEY_FAILURE_COLOR = '#5B78A6';") &&
    !dayCell.includes('styles.successTint') &&
    !dayCell.includes('styles.failureTint') &&
    dayCell.includes('styles.emptyDot') &&
    dayCell.includes('isToday ? styles.todayBadge : null') &&
    monthScreen.includes('todayDate={todayDate}') &&
    monthScreen.includes('<Text style={styles.legendText}>사진 기록</Text>') &&
    monthScreen.includes('<Text style={styles.legendText}>점수·달성 여부</Text>') &&
    calendarGrid.includes('...shadows.soft') &&
    calendarGrid.includes('borderColor: colors.border') &&
    calendarGrid.includes("overflow: 'hidden'"),
  'calendar uses cached face thumbnails, top-left dates, compact status overlays, neutral fallbacks, and a real today marker',
);
expect(
  monthScreen.includes('prefetchMakeupJourneyCalendarThumbnails(currentMonthData)') &&
    monthScreen.includes('[shiftMonth(month, -1), shiftMonth(month, 1)]') &&
    monthScreen.includes('prefetchMakeupJourneyMonth(adjacentMonth)') &&
    journeyPrefetch.includes('MAKEUP_JOURNEY_THUMBNAIL_PREFETCH_CONCURRENCY = 4') &&
    journeyPrefetch.includes('cacheRevision !== getMakeupJourneyCacheRevision()') &&
    journeyPrefetch.includes('representativeThumbnailUrl?.trim()') &&
    journeyPrefetch.includes('prefetchMakeupJourneyPrivateImage(queued.uri, queued.cacheRevision)') &&
    journeyPrivateImage.includes("cachePolicy: 'memory'") &&
    journeyPrivateImage.includes('headers: {Authorization: `Bearer ${authToken}`}') &&
    journeyPrivateImage.includes('ExpoImage.clearMemoryCache()'),
  'calendar warms current and adjacent thumbnail caches with bounded concurrency and account-safe revisions',
);
expect(
  monthScreen.includes('nextMidnight.setHours(24, 0, 0, 100)') &&
    monthScreen.includes('syncTodayDate();') &&
    monthPickerSheet.includes('날짜로 빠르게 이동') &&
    monthPickerSheet.includes("JOURNEY_MONTH_PICKER_MODE = 'wheel'") &&
    monthPickerSheet.includes("JOURNEY_MONTH_PICKER_COLUMNS = ['year', 'month']") &&
    monthPickerSheet.includes('accessibilityLabel="달력 연도 선택"') &&
    monthPickerSheet.includes('accessibilityLabel="달력 월 선택"') &&
    monthPickerSheet.includes('suffix="년"') &&
    monthPickerSheet.includes('suffix="월"') &&
    !monthPickerSheet.includes('suffix="일"') &&
    monthPickerSheet.includes('onPress={confirmSelection}') &&
    monthPickerSheet.includes('이번 달로 이동') &&
    monthScreen.includes('setMonthPickerVisible(true)'),
  'calendar refreshes its real local today marker and opens a year-month wheel picker without a day column',
);
expect(
  monthScreen.includes('PanResponder.create({') &&
    monthScreen.includes('Math.abs(dx) > Math.abs(dy) * 1.15') &&
    monthScreen.includes('Math.abs(gesture.dx) >= 36') &&
    monthScreen.includes('changeMonthBySwipe(gesture.dx < 0 ? 1 : -1)') &&
    monthScreen.includes('setMonth(current => shiftMonth(current, direction))') &&
    monthScreen.includes('requestAnimationFrame(() => restoreCalendarPosition(210))') &&
    !monthScreen.includes('Animated.spring(calendarTranslateX') &&
    monthScreen.includes('transform: [{translateX: calendarTranslateX}]') &&
    monthScreen.includes('accessibilityLabel="월간 달력, 좌우로 넘겨 월 이동"') &&
    monthScreen.includes("event.nativeEvent.actionName === 'decrement'") &&
    monthScreen.includes("event.nativeEvent.actionName === 'increment'"),
  'calendar horizontal swipes animate to the previous or next month without stealing vertical scroll',
);
expect(
  monthSummary.includes('이번 달 성장 리포트') &&
    monthSummary.includes('<GoalProgressRing') &&
    monthSummary.includes('<WeeklyScoreMiniChart') &&
    monthSummary.includes('styles.progressTrack') &&
    monthSummary.includes('getCappedJourneyGoalProgress(averageScore, goalScore)') &&
    monthSummary.includes("const JOURNEY_BRIGHT_YELLOW = '#FFD84D'") &&
    monthSummary.includes('backgroundColor: JOURNEY_BRIGHT_YELLOW') &&
    monthSummary.includes('stroke={JOURNEY_BRIGHT_YELLOW}') &&
    monthSummary.includes('color: JOURNEY_BRIGHT_YELLOW') &&
    monthSummary.includes('accessibilityLabel="주간 점수 추이 분석 보기"') &&
    monthSummary.includes('onPress={onOpenTrend}') &&
    monthSummary.includes('목표까지 ${Math.abs(goalDifference ?? 0)}점 남았어요.') &&
    monthSummary.includes('CalendarDays') &&
    monthSummary.includes('Flame') &&
    monthSummary.includes('Trophy') &&
    monthScreen.includes('days={calendarDays}') &&
    monthScreen.includes('endDate={getJourneyTrendEndDateForMonth(month, todayDate)}') &&
    monthScreen.includes('onOpenTrend={() => onOpenTrend(getJourneyTrendEndDateForMonth(month, todayDate))}') &&
    monthScreen.includes('<Text style={styles.headerActionLabel}>분석</Text>') &&
    monthScreen.includes('<Text style={styles.headerActionLabel}>설정</Text>') &&
    monthScreen.indexOf('accessibilityLabel="달력 범례"') <
      monthScreen.indexOf('<JourneyCalendarGrid') &&
    !monthSummary.includes('MY GROWTH') &&
    !monthSummary.includes('colors.successMuted') &&
    !monthSummary.includes('colors.brandMuted') &&
    !monthSummary.includes('backgroundColor: colors.black,'),
  'month screen uses real score history, capped yellow progress highlights, and a tappable weekly analysis card',
);
expect(
  digestCard.includes("const JOURNEY_IMPROVEMENT_BLUE = '#5B78A6'") &&
    digestCard.includes("const JOURNEY_BLUE_TINT = 'rgba(91, 120, 166, 0.09)'") &&
    digestCard.includes("const JOURNEY_RED_TINT = 'rgba(255, 90, 77, 0.08)'") &&
    digestCard.includes('const accent = isStrength ? colors.danger : JOURNEY_IMPROVEMENT_BLUE') &&
    !digestCard.includes('JOURNEY_GOLD') &&
    detailScreen.includes('backgroundColor: colors.black') &&
    missionCard.includes('backgroundColor: colors.black'),
  'record detail reserves red and blue for feedback meaning while controls use the shared neutral action color',
);
expect(
  dayCell.includes('day?.representativeScore ?? day?.latestScore ?? null'),
  'calendar cells show the user-selected representative score with a latest-score fallback',
);
expect(
  trendScreen.includes("{label: '7일', value: '7d'}") &&
    trendScreen.includes("{label: '30일', value: '30d'}") &&
    trendScreen.includes("{label: '3개월', value: '90d'}") &&
    trendScreen.includes('<RefreshControl'),
  'trend screen keeps all ranges and refresh behavior',
);
expect(
  trendScreen.includes('getJourneyTrendEndDateForMonth(month)') &&
    trendScreen.includes('getJourneyTrendStartDate(range, endDate)') &&
    trendScreen.includes('setMonth(value => shiftMonth(value, -1))') &&
    trendScreen.includes('setMonth(value => shiftMonth(value, 1))') &&
    scoreChart.includes('buildJourneyChartGeometry(points, goalScore, width, startDate, endDate)') &&
    scoreChart.includes('{startDate.slice(5)') &&
    scoreChart.includes('{endDate.slice(5)'),
  'trend graph supports month navigation and date-proportional range boundaries',
);
expect(
  detailScreen.includes('goalScore={detail.goalScore}') &&
    digestCard.includes("const hasGoal = goalScore !== null") &&
    digestCard.includes("hasGoal ? getJourneyStatusLabel(status) : '목표 미설정'") &&
    digestCard.includes('목표 {goalScore}점 기준') &&
    trendScreen.includes("resource.data.goalScore === null"),
  'pre-onboarding detail and trend use a neutral missing-goal state',
);
expect(
  digestCard.includes("status === 'success'") &&
    digestCard.includes('? colors.danger') &&
    digestCard.includes(': JOURNEY_IMPROVEMENT_BLUE') &&
    digestCard.includes('<Sparkles color={statusAccent}'),
  'detail sparkle uses the stored report goal result: red when achieved and blue when missed',
);
expect(
  authSessionContext.includes('invalidateMakeupJourneyCache();') &&
    authSessionContext.includes('clearMakeupJourneyPrivateImageMemoryCache();') &&
    authSessionContext.includes('}, [session?.user.id]);') &&
    authSessionContext.includes('const userChanged = previousUserId !== nextUserId;'),
  'account changes invalidate user-scoped makeup journey caches',
);
expect(
  feedbackRoutes.match(/beginMakeupFeedbackFlow\(flowContext\);/g)?.length === 3,
  'loading error recovery restores the frozen journey context before every alternate route',
);
expect(
  feedbackRoutes.includes('getMakeupJourneySafeReturnResetState(route.params?.entryDate)') &&
    !feedbackRoutes.includes('if (navigation.canGoBack()) {\n      navigation.goBack();'),
  'journey results always reset to their resolved entry date instead of an older day below them',
);
expect(
  journeyRoutes.includes("navigation.addListener('focus'") &&
    journeyRoutes.includes("feedbackFlowOriginRef.current !== 'journeyDay'"),
  'native stack pop back to the journey day clears any stale correction context',
);
expect(
  journeyRoutes.match(/onBack=\{\(\) => navigation\.reset\(getHomeTabResetState\(\)\)\}/g)
    ?.length === 2,
  'disabled day and trend deep links both expose a safe Home escape route',
);
expect(
  journeyRoutes.includes('onOpenReport={reportId => {') &&
    journeyRoutes.includes("navigation.navigate('MakeupFeedbackResult', {") &&
    journeyRoutes.includes('reportId,'),
  'day detail forwards the selected stored report id to the existing result route',
);
expect(
  feedbackRoutes.includes('void fetchMakeupFeedbackReport(reportId)') &&
    feedbackService.includes('return mapStoredMakeupFeedbackReport(report, reportId);'),
  'stored journey reports reuse the existing feedback report endpoint and result mapper',
);
expect(
  feedbackResultScreen.includes('메이크업 기록에서 보기') &&
    feedbackResultScreen.includes('onPress={onOpenMakeupJourney}') &&
    feedbackRoutes.includes('notifyMakeupJourneyFeedbackCompleted(resultEntryDate)') &&
    feedbackRoutes.includes(
      'getMakeupJourneySafeReturnResetState(resultEntryDate, resultReportId)',
    ),
  'feedback result exposes a bottom journey CTA that resets to the report date',
);
expect(
  feedbackService.includes('entryDate: firstText(job.entryDate)') &&
    journeyRoutes.includes('initialReportId={route.params?.initialReportId}') &&
    detailScreen.includes('initialReportId && reports.some') &&
    detailScreen.includes('return initialReportId;') &&
    detailScreen.includes(
      'pagerRef.current?.scrollToOffset({animated: false, offset: index * pageWidth})',
    ),
  'feedback result date and report id focus the matching horizontal journey page',
);
expect(
  feedbackRoutes.includes('entryDate: flowContext.entryDate,') &&
    feedbackRoutes.includes(': {\n              entryDate: flowContext.entryDate,') &&
    journeyRoutes.includes(
      'navigation.setParams({entryDate: nextEntryDate, initialReportId: undefined})',
    ),
  'general feedback result keeps its date and manual day navigation clears one-time report focus',
);

console.log('makeup journey screen source contract passed');
