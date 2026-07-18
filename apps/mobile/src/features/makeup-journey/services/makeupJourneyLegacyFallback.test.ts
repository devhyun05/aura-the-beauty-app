import {BackendApiError} from '../../../shared/services/backendApi';
import {
  buildLegacyMakeupJourneyCalendar,
  buildLegacyMakeupJourneyDay,
  buildLegacyMakeupJourneyTrend,
  isMissingMakeupJourneyRoute,
  toSeoulCalendarDate,
  type LegacyFeedbackReport,
} from './makeupJourneyLegacyFallback';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const reports: LegacyFeedbackReport[] = [
  {
    completedAt: '2026-07-17T01:00:00.000Z',
    createdAt: '2026-07-17T00:00:00.000Z',
    entryDate: '2026-07-17',
    feedbackPayload: {
      request: {cdnUrl: 'https://example.com/first.jpg'},
      result: {scoreReason: '첫 기록'},
    },
    id: 'first',
    score: 70,
  },
  {
    completedAt: '2026-07-17T02:00:00.000Z',
    entryDate: '2026-07-17',
    feedbackKind: 'correction',
    feedbackPayload: {
      request: {sourceUrl: 'https://example.com/latest.jpg'},
      result: {
        points: [{actionSteps: ['블렌딩을 정리해 보세요.'], title: '블렌딩'}],
        strengths: [{title: '피부 표현'}],
      },
    },
    id: 'latest',
    parentFeedbackReportId: 'first',
    score: 85,
  },
  {
    // Legacy rows without entryDate must follow the DB backfill's Seoul date.
    completedAt: '2026-07-17T15:30:00.000Z',
    id: 'seoul-next-day',
    score: 90,
  },
  {completedAt: 'invalid', id: 'invalid-date', score: 100},
  {completedAt: '2026-07-18T03:00:00.000Z', id: 'invalid-score', score: null},
];

expect(
  toSeoulCalendarDate('2026-07-17T15:30:00.000Z') === '2026-07-18',
  'legacy timestamps use Asia/Seoul day boundaries',
);

const calendar = buildLegacyMakeupJourneyCalendar('2026-07', reports);
const july17 = calendar.days.find(day => day.date === '2026-07-17');
expect(calendar.days.length === 2, 'calendar drops malformed rows and groups valid report dates');
expect(july17?.firstScore === 70, 'calendar preserves the first score of the day');
expect(july17?.latestScore === 85, 'calendar preserves the latest score of the day');
expect(july17?.scoreDelta === 15, 'calendar computes the daily score delta');
expect(july17?.reportCount === 2, 'calendar counts all completed feedback reports for the day');
expect(july17?.status === 'success', 'legacy goal score determines success consistently');

const day = buildLegacyMakeupJourneyDay('2026-07-17', reports);
expect(day.reports.length === 2, 'day fallback includes all reports for the selected day');
expect(day.reports[1]?.imageUrl?.endsWith('latest.jpg') === true, 'day fallback keeps report image URLs');
expect(day.feedbackDigest?.nextAction === '블렌딩을 정리해 보세요.', 'day fallback maps digest action');

const trend = buildLegacyMakeupJourneyTrend('7d', '2026-07-18', reports);
expect(trend.points.length === 2, 'trend fallback uses the latest score for every recorded day');
expect(trend.summary.firstScore === 85, 'trend summary starts with the earliest daily latest score');
expect(trend.summary.latestScore === 90, 'trend summary ends with the latest daily score');

expect(
  isMissingMakeupJourneyRoute(new BackendApiError('Not Found', 404, 'HTTP_ERROR')),
  'plain route-missing 404 activates legacy reads',
);
expect(
  !isMissingMakeupJourneyRoute(
    new BackendApiError('Disabled', 404, 'MAKEUP_JOURNEY_DISABLED'),
  ),
  'feature-disabled responses are not hidden by compatibility fallback',
);
expect(
  !isMissingMakeupJourneyRoute(new BackendApiError('Unauthorized', 401, 'AUTH_REQUIRED')),
  'authentication failures are not hidden by compatibility fallback',
);

console.log('makeup journey legacy fallback contract passed');
