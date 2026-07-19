import {
  commitMakeupJourneyScoreSelection,
  createJourneyRequestGate,
  getCachedMakeupJourneyDay,
  getCachedMakeupJourneyMonth,
  getCachedMakeupJourneyTrend,
  getMakeupJourneyCacheRevision,
  invalidateMakeupJourneyCache,
  MAX_CACHED_MAKEUP_JOURNEY_MONTHS,
  matchesMakeupJourneyCacheTarget,
  setCachedMakeupJourneyDay,
  setCachedMakeupJourneyMonth,
  setCachedMakeupJourneyTrend,
  subscribeMakeupJourneyCacheInvalidation,
} from './makeupJourneyCache';
import type {
  MakeupJourneyCalendarResponse,
  MakeupJourneyDayResponse,
  MakeupJourneyTrendResponse,
} from '../types';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const gate = createJourneyRequestGate();
const julyRequest = gate.begin('2026-07');
const augustRequest = gate.begin('2026-08');
expect(!gate.isCurrent(julyRequest, '2026-07'), 'late prior-month response is rejected');
expect(gate.isCurrent(augustRequest, '2026-08'), 'latest requested month may update the screen');
expect(!gate.isCurrent(augustRequest, '2026-07'), 'response cannot update a different month key');

expect(
  matchesMakeupJourneyCacheTarget(
    {entryDate: '2026-07-17'},
    {month: '2026-07'},
  ),
  'day mutation invalidates its month',
);
expect(
  !matchesMakeupJourneyCacheTarget(
    {entryDate: '2026-08-01'},
    {month: '2026-07'},
  ),
  'day mutation does not invalidate unrelated months',
);
expect(matchesMakeupJourneyCacheTarget(null, {month: '2026-07'}), 'global invalidation matches all');

const monthData = {} as MakeupJourneyCalendarResponse;
const dayData = {} as MakeupJourneyDayResponse;
const trendData = {} as MakeupJourneyTrendResponse;
setCachedMakeupJourneyMonth('2026-07', monthData);
setCachedMakeupJourneyDay('2026-07-17', dayData);
setCachedMakeupJourneyTrend('30d', '2026-07-17', trendData);
invalidateMakeupJourneyCache();
expect(getCachedMakeupJourneyMonth('2026-07') === null, 'account boundary clears month cache');
expect(getCachedMakeupJourneyDay('2026-07-17') === null, 'account boundary clears day cache');
expect(
  getCachedMakeupJourneyTrend('30d', '2026-07-17') === null,
  'account boundary clears trend cache',
);

const revisionBeforeTargetedInvalidation = getMakeupJourneyCacheRevision();
invalidateMakeupJourneyCache({month: '2026-07'});
expect(
  getMakeupJourneyCacheRevision() === revisionBeforeTargetedInvalidation + 1,
  'every invalidation advances the revision so stale background prefetches cannot refill cache',
);

const selectedDigest = {
  reportId: 'report-first',
  headline: '첫 보고서 요약',
  strengthCount: 1,
  strengths: ['고른 피부 표현'],
  improvementCount: 1,
  improvements: ['눈썹 경계 풀기'],
  nextAction: '스크루 브러시로 경계를 풀어 주세요.',
};
const selectedNote = {content: '첫 보고서 메모'};
const selectionDay: MakeupJourneyDayResponse = {
  date: '2026-07-17',
  goalScore: 80,
  status: 'success',
  firstScore: 60,
  latestScore: 90,
  representativeReportId: 'report-latest',
  representativeScore: 90,
  scoreDelta: 30,
  reportCount: 2,
  feedbackDigest: null,
  reports: [
    {
      reportId: 'report-first',
      score: 75,
      feedbackKind: 'initial',
      parentFeedbackReportId: null,
      completedAt: '2026-07-17T01:00:00Z',
      imageUrl: 'https://cdn.example/first.jpg',
      goalContext: {},
      feedbackDigest: selectedDigest,
      note: selectedNote,
    },
    {
      reportId: 'report-latest',
      score: 90,
      feedbackKind: 'correction',
      parentFeedbackReportId: 'report-first',
      completedAt: '2026-07-17T02:00:00Z',
      imageUrl: 'https://cdn.example/latest.jpg',
      goalContext: {},
      feedbackDigest: null,
      note: null,
    },
  ],
  missions: [],
  note: null,
};
const selectionMonth: MakeupJourneyCalendarResponse = {
  month: '2026-07',
  goalScore: 80,
  summary: {averageScore: 80, recordedDays: 2, currentStreak: 2},
  days: [
    {
      date: '2026-07-17',
      status: 'success',
      firstScore: 60,
      latestScore: 90,
      representativeReportId: 'report-latest',
      representativeScore: 90,
      representativeThumbnailUrl: '/makeup-journey/reports/report-latest/thumbnail',
      scoreDelta: 30,
      reportCount: 2,
      hasNote: true,
      missionSummary: {completed: 0, total: 0},
    },
    {
      date: '2026-07-18',
      status: 'failure',
      firstScore: 70,
      latestScore: 70,
      representativeReportId: 'report-other',
      representativeScore: 70,
      representativeThumbnailUrl: '/makeup-journey/reports/report-other/thumbnail',
      scoreDelta: 0,
      reportCount: 1,
      hasNote: false,
      missionSummary: {completed: 0, total: 0},
    },
  ],
};
setCachedMakeupJourneyDay('2026-07-17', selectionDay);
setCachedMakeupJourneyMonth('2026-07', selectionMonth);
setCachedMakeupJourneyTrend('30d', '2026-07-18', trendData);
let selectedCacheTarget: {entryDate?: string; month?: string} | null | undefined;
const unsubscribeSelection = subscribeMakeupJourneyCacheInvalidation(target => {
  selectedCacheTarget = target;
});
const revisionBeforeSelection = getMakeupJourneyCacheRevision();
commitMakeupJourneyScoreSelection({
  date: '2026-07-17',
  reportId: 'report-first',
  representativeThumbnailUrl: '/makeup-journey/reports/report-first/thumbnail',
  score: 75,
  updatedAt: '2026-07-19T01:00:00Z',
});
unsubscribeSelection();

const patchedDay = getCachedMakeupJourneyDay('2026-07-17');
expect(patchedDay?.representativeReportId === 'report-first', 'selection patches the warm day report');
expect(patchedDay?.representativeScore === 75, 'selection patches the warm day score');
expect(patchedDay?.status === 'failure', 'selection re-evaluates the warm day against its goal');
expect(patchedDay?.scoreDelta === 15, 'selection recalculates the warm day score delta');
expect(patchedDay?.feedbackDigest === selectedDigest, 'selection uses the matching report digest');
expect(patchedDay?.note === selectedNote, 'selection uses the matching report note');

const patchedMonth = getCachedMakeupJourneyMonth('2026-07');
const patchedCalendarDay = patchedMonth?.days.find(day => day.date === '2026-07-17');
expect(
  patchedCalendarDay?.representativeReportId === 'report-first'
    && patchedCalendarDay.representativeScore === 75,
  'selection atomically patches the representative report and score in the warm month',
);
expect(
  patchedCalendarDay?.representativeThumbnailUrl
    === '/makeup-journey/reports/report-first/thumbnail',
  'selection atomically patches the representative thumbnail in the warm month',
);
expect(
  patchedCalendarDay?.status === 'failure' && patchedCalendarDay.scoreDelta === 15,
  'selection atomically patches calendar status and delta',
);
expect(
  patchedMonth?.summary.averageScore === 73 && patchedMonth.summary.recordedDays === 2,
  'selection immediately recalculates the representative-score month average',
);
expect(
  patchedMonth?.days[1] === selectionMonth.days[1],
  'selection preserves unrelated calendar days',
);
expect(
  getCachedMakeupJourneyTrend('30d', '2026-07-18') === null,
  'selection invalidates trend data derived from representative scores',
);
expect(
  getMakeupJourneyCacheRevision() === revisionBeforeSelection + 1,
  'selection advances the data revision so older month requests cannot refill stale data',
);
expect(
  selectedCacheTarget?.entryDate === '2026-07-17',
  'selection notifies mounted resources for the affected day and month',
);

commitMakeupJourneyScoreSelection({
  date: '2026-07-17',
  reportId: 'report-latest',
  representativeThumbnailUrl: '/makeup-journey/reports/report-latest/thumbnail',
  score: 90,
  updatedAt: '2026-07-19T01:05:00Z',
});
const nullContentDay = getCachedMakeupJourneyDay('2026-07-17');
expect(
  nullContentDay?.feedbackDigest === null,
  'selecting a report with no digest clears the prior representative digest',
);
expect(
  nullContentDay?.note === null,
  'selecting a report with no note clears the prior representative note',
);

invalidateMakeupJourneyCache({entryDate: '2026-07-17'});
expect(
  getCachedMakeupJourneyDay('2026-07-17') === null &&
    getCachedMakeupJourneyMonth('2026-07') === null,
  'a targeted mutation still removes stale values from normal cache reads',
);
commitMakeupJourneyScoreSelection({
  date: '2026-07-17',
  reportId: 'report-first',
  representativeThumbnailUrl: '/makeup-journey/reports/report-first/thumbnail',
  score: 75,
  updatedAt: '2026-07-19T01:10:00Z',
});
expect(
  getCachedMakeupJourneyDay('2026-07-17')?.representativeReportId === 'report-first',
  'selection recovers and patches a day snapshot invalidated by an earlier mutation',
);
expect(
  getCachedMakeupJourneyMonth('2026-07')?.days[0]?.representativeThumbnailUrl ===
    '/makeup-journey/reports/report-first/thumbnail',
  'selection recovers an invalidated month snapshot so the chosen face changes immediately',
);

for (let index = 0; index <= MAX_CACHED_MAKEUP_JOURNEY_MONTHS; index += 1) {
  const year = 2020 + Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, '0');
  setCachedMakeupJourneyMonth(`${year}-${month}`, monthData);
}
expect(
  getCachedMakeupJourneyMonth('2020-01') === null,
  'background neighbor prefetch keeps the month cache bounded',
);
invalidateMakeupJourneyCache();
commitMakeupJourneyScoreSelection({
  date: '2026-07-17',
  reportId: 'report-latest',
  representativeThumbnailUrl: '/makeup-journey/reports/report-latest/thumbnail',
  score: 90,
  updatedAt: '2026-07-19T01:15:00Z',
});
expect(
  getCachedMakeupJourneyDay('2026-07-17') === null &&
    getCachedMakeupJourneyMonth('2026-07') === null,
  'an account-boundary clear also removes invalidated snapshots from the prior user',
);

console.log('makeup journey cache contract passed');
