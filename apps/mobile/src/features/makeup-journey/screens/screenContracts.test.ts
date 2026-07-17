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
const reportPhotoGallery = source('components/JourneyReportPhotoGallery.tsx');
const dayCell = source('components/JourneyDayCell.tsx');
const calendarGrid = source('components/JourneyCalendarGrid.tsx');
const scoreChart = source('components/JourneyScoreChart.tsx');
const settingsSheet = source('components/JourneySettingsSheet.tsx');
const monthPickerSheet = source('components/JourneyMonthPickerSheet.tsx');
const monthSummary = source('components/JourneyMonthSummary.tsx');
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
const journeyRoutes = readFileSync(
  join(
    process.cwd(),
    'apps/mobile/src/app/navigation/routes/makeupJourneyRoutes.tsx',
  ),
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
const scrollIndex = detailScreen.indexOf('\n      <ScrollView');
expect(headerIndex >= 0 && scrollIndex > headerIndex, 'fixed detail header is outside and before ScrollView');
expect(
  detailScreen.match(/\n\s*<ScrollView\n/g)?.length === 1,
  'day detail uses one vertical ScrollView',
);
expect(
  detailScreen.includes('dayScrollOffsets') && detailScreen.includes('scrollTo({animated: false'),
  'day detail restores the session scroll offset',
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
    journeyRoutes.includes('navigation.setParams({entryDate: nextEntryDate});'),
  'day detail moves one day backward or forward in place without a today boundary',
);
expect(
  detailScreen.indexOf('<JourneyReportPhotoGallery') < detailScreen.indexOf('<DayOverview') &&
    detailScreen.indexOf('<DayOverview') < detailScreen.indexOf('<JourneyFeedbackDigestCard') &&
    detailScreen.indexOf('<JourneyFeedbackDigestCard') < detailScreen.indexOf('<CorrectionCard') &&
    detailScreen.indexOf('<CorrectionCard') < detailScreen.indexOf('<JourneyMissionCard') &&
    detailScreen.indexOf('<JourneyMissionCard') < detailScreen.indexOf('<JourneyNoteCard'),
  'day detail keeps the photo-first summary and correction-first action order',
);
expect(
  reportPhotoGallery.includes('source={{uri: report.imageUrl}}') &&
    reportPhotoGallery.includes('onOpenReport(report.reportId)') &&
    reportPhotoGallery.includes('사진을 불러오지 못했어요.'),
  'day detail renders every owned report image with loading failure and report navigation',
);
expect(
  monthScreen.includes('accessibilityLabel="전체 성장 그래프 보기"') &&
    monthScreen.includes('onOpenTrend(getJourneyTrendEndDateForMonth(month))') &&
    journeyRoutes.includes("rootNavigation?.navigate('MakeupJourneyTrend', {entryDate});"),
  'calendar header exposes the full growth graph route',
);
expect(
  !digestCard.includes('numberOfLines=') && digestCard.includes('...shadows.soft'),
  'digest copy grows vertically without line truncation',
);
expect(
  dayCell.includes('columnIndex < 6 ? styles.withRightDivider : null') &&
    dayCell.includes('weekIndex < 5 ? styles.withBottomDivider : null') &&
    dayCell.includes("backgroundColor: 'rgba(242, 93, 97, 0.14)'") &&
    dayCell.includes("backgroundColor: 'rgba(91, 120, 166, 0.14)'") &&
    dayCell.includes("status === 'success' ? '달성' : '미달'") &&
    dayCell.includes('isToday ? styles.todayBadge : null') &&
    monthScreen.includes('todayDate={todayDate}') &&
    calendarGrid.includes("borderColor: 'rgba(17, 17, 17, 0.10)'") &&
    calendarGrid.includes("overflow: 'hidden'"),
  'calendar uses one flat divided grid with pink success, blue failure, explicit labels, and a real today marker',
);
expect(
  monthScreen.includes('nextMidnight.setHours(24, 0, 0, 100)') &&
    monthScreen.includes('syncTodayDate();') &&
    monthPickerSheet.includes('날짜로 빠르게 이동') &&
    monthPickerSheet.includes('const YEARS_PER_PAGE = 10') &&
    monthPickerSheet.includes('MONTHS.map') &&
    monthPickerSheet.includes('이번 달로 이동') &&
    monthScreen.includes('setMonthPickerVisible(true)'),
  'calendar refreshes its real local today marker and opens a direct year-month picker',
);
expect(
  monthSummary.includes('이번 달 성장 리포트') &&
    monthSummary.includes('styles.progressTrack') &&
    monthSummary.includes('목표까지 ${Math.abs(goalDifference ?? 0)}점 남았어요.') &&
    monthSummary.includes('CalendarDays') &&
    monthSummary.includes('Flame') &&
    !monthSummary.includes('MY GROWTH') &&
    !monthSummary.includes('backgroundColor: colors.black,'),
  'month summary uses a readable light report hierarchy instead of the oversized black panel',
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
  detailScreen.includes("detail.goalScore === null") &&
    trendScreen.includes("resource.data.goalScore === null"),
  'pre-onboarding detail and trend use a neutral missing-goal state',
);
expect(
  authSessionContext.includes('invalidateMakeupJourneyCache();') &&
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

console.log('makeup journey screen source contract passed');
