import {
  getCappedJourneyGoalProgress,
  getJourneyDigestContent,
  getJourneyScorePresentation,
  getMakeupJourneyLandingMode,
  getMissionDifficultyGuide,
  resolveMakeupJourneyActiveReportId,
} from './presentation';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const single = getJourneyScorePresentation({
  firstScore: 84,
  latestScore: 84,
  reportCount: 1,
  scoreDelta: 0,
});
expect(single?.label === '최초 84 · 최신 84', 'single report shows equal first/latest scores');
expect(single?.deltaLabel === null, 'single report hides the score delta');

const multiple = getJourneyScorePresentation({
  firstScore: 76,
  latestScore: 84,
  reportCount: 2,
  scoreDelta: 8,
});
expect(multiple?.label === '최초 76 → 최신 84', 'multiple reports show the score transition');
expect(multiple?.deltaLabel === '+8', 'positive score delta includes a plus sign');

expect(
  getCappedJourneyGoalProgress(65, 60) === 100,
  'goal progress never renders above 100 percent',
);
expect(
  getCappedJourneyGoalProgress(30, 60) === 50,
  'goal progress reflects the stored score and goal below the cap',
);
expect(
  getCappedJourneyGoalProgress(null, 60) === 0 &&
    getCappedJourneyGoalProgress(60, null) === 0,
  'goal progress stays empty when real score or goal data is unavailable',
);

expect(
  getMakeupJourneyLandingMode({
    calendarError: null,
    calendarHasData: false,
    calendarIsLoading: false,
    settings: null,
    settingsError: null,
    settingsIsLoading: false,
  }) === 'onboarding',
  'missing settings enters onboarding without blocking the empty calendar',
);
expect(
  getMakeupJourneyLandingMode({
    calendarError: null,
    calendarHasData: false,
    calendarIsLoading: false,
    settings: null,
    settingsError: 'network unavailable',
    settingsIsLoading: false,
  }) === 'settings-error',
  'settings error exposes the retry state',
);
expect(
  getMakeupJourneyLandingMode({
    calendarError: 'late refresh failed',
    calendarHasData: true,
    calendarIsLoading: false,
    settings: {goalScore: 80},
    settingsError: null,
    settingsIsLoading: false,
  }) === 'calendar',
  'refresh errors preserve already rendered calendar data',
);

const longText = '긴 문장 '.repeat(120).trim();
const digest = getJourneyDigestContent({
  headline: longText,
  improvementCount: 3,
  improvements: ['아이섀도', '블러셔', '아이라인'],
  nextAction: longText,
  reportId: 'report-1',
  strengthCount: 3,
  strengths: ['눈썹', '피부', '립'],
});
expect(digest.headline === longText, 'large-text headline is not truncated');
expect(digest.nextAction === longText, 'large-text action expands without truncation');
expect(digest.strengths.length === 3, 'digest renders every stored strength title');
expect(digest.improvements.length === 3, 'digest renders every stored improvement title');

const beginnerMission = getMissionDifficultyGuide('beginner');
const intermediateMission = getMissionDifficultyGuide('intermediate');
const advancedMission = getMissionDifficultyGuide('advanced');
expect(beginnerMission.duration === '1~5분', 'beginner mission is an immediately accessible habit');
expect(intermediateMission.shortDescription.includes('루틴'), 'intermediate mission is one beauty routine');
expect(advancedMission.shortDescription.includes('도전'), 'advanced mission leaves a result or record');

const sameDayReports = [{reportId: 'first'}, {reportId: 'second'}];
expect(
  resolveMakeupJourneyActiveReportId({
    currentReportId: 'first',
    preserveCurrent: false,
    reports: sameDayReports,
    representativeReportId: 'second',
  }) === 'second',
  'a freshly opened day shows the latest or explicitly selected representative report',
);
expect(
  resolveMakeupJourneyActiveReportId({
    currentReportId: 'first',
    preserveCurrent: true,
    reports: sameDayReports,
    representativeReportId: 'second',
  }) === 'first',
  'a user-swiped report remains active during background refreshes',
);
expect(
  resolveMakeupJourneyActiveReportId({
    currentReportId: null,
    initialReportId: 'first',
    preserveCurrent: false,
    reports: sameDayReports,
    representativeReportId: 'second',
  }) === 'first',
  'an explicit report deep link wins over the default representative report',
);
expect(
  resolveMakeupJourneyActiveReportId({
    currentReportId: 'missing',
    preserveCurrent: true,
    reports: sameDayReports,
    representativeReportId: null,
  }) === 'second',
  'a missing current report safely falls back to the newest completed report',
);

console.log('makeup journey presentation contract passed');
