import {BackendApiError, requestBackendJson} from '../../../shared/services/backendApi';
import type {
  MakeupJourneyCalendarDay,
  MakeupJourneyCalendarResponse,
  MakeupJourneyDayResponse,
  MakeupJourneyFeedbackDigest,
  MakeupJourneyReport,
  MakeupJourneySettingsResponse,
  MakeupJourneyTrendRange,
  MakeupJourneyTrendResponse,
} from '../types';
import {
  addDays,
  getJourneyTrendStartDate,
  getTodayDateString,
  isIsoDateString,
} from '../utils/date';

const LEGACY_GOAL_SCORE = 80;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

type JsonObject = Record<string, unknown>;

export type LegacyFeedbackReport = {
  completedAt?: unknown;
  createdAt?: unknown;
  entryDate?: unknown;
  feedbackKind?: unknown;
  feedbackPayload?: unknown;
  id?: unknown;
  parentFeedbackReportId?: unknown;
  score?: unknown;
};

type NormalizedLegacyReport = {
  completedAt: string;
  date: string;
  feedbackKind: 'initial' | 'correction';
  goalContext: JsonObject;
  id: string;
  imageUrl: string | null;
  parentFeedbackReportId: string | null;
  result: JsonObject;
  score: number;
  sortTime: number;
};

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function scoreValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value)
    : null;
}

function timestampValue(value: unknown): {iso: string; time: number} | null {
  const raw = textValue(value);
  if (!raw) {
    return null;
  }
  const time = Date.parse(raw);
  return Number.isFinite(time) ? {iso: new Date(time).toISOString(), time} : null;
}

export function toSeoulCalendarDate(value: unknown): string | null {
  const timestamp = timestampValue(value);
  return timestamp
    ? new Date(timestamp.time + SEOUL_OFFSET_MS).toISOString().slice(0, 10)
    : null;
}

function normalizeLegacyReport(report: LegacyFeedbackReport): NormalizedLegacyReport | null {
  const id = textValue(report.id);
  const score = scoreValue(report.score);
  const completed = timestampValue(report.completedAt) ?? timestampValue(report.createdAt);
  const explicitDate = textValue(report.entryDate);
  const date = explicitDate && isIsoDateString(explicitDate)
    ? explicitDate
    : toSeoulCalendarDate(report.completedAt) ?? toSeoulCalendarDate(report.createdAt);

  if (!id || score === null || !completed || !date || !isIsoDateString(date)) {
    return null;
  }

  const payload = objectValue(report.feedbackPayload);
  const request = objectValue(payload.request);
  const result = objectValue(payload.result);
  const feedbackContext = objectValue(request.feedbackContext ?? request.feedback_context);

  return {
    completedAt: completed.iso,
    date,
    feedbackKind: report.feedbackKind === 'correction' ? 'correction' : 'initial',
    goalContext: feedbackContext,
    id,
    imageUrl: textValue(request.cdnUrl ?? request.cdn_url)
      ?? textValue(request.sourceUrl ?? request.source_url),
    parentFeedbackReportId: textValue(report.parentFeedbackReportId),
    result,
    score,
    sortTime: completed.time,
  };
}

function normalizedReports(reports: LegacyFeedbackReport[]): NormalizedLegacyReport[] {
  return reports
    .map(normalizeLegacyReport)
    .filter((report): report is NormalizedLegacyReport => Boolean(report))
    .sort((left, right) => left.sortTime - right.sortTime || left.id.localeCompare(right.id));
}

function groupedByDate(
  reports: NormalizedLegacyReport[],
): Map<string, NormalizedLegacyReport[]> {
  const groups = new Map<string, NormalizedLegacyReport[]>();
  reports.forEach(report => {
    const existing = groups.get(report.date) ?? [];
    existing.push(report);
    groups.set(report.date, existing);
  });
  return groups;
}

function getCurrentStreak(dates: string[], today = getTodayDateString()): number {
  const recorded = new Set(dates);
  let cursor = recorded.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (recorded.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function roundedAverage(scores: number[]): number | null {
  return scores.length > 0
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null;
}

function calendarDay(date: string, reports: NormalizedLegacyReport[]): MakeupJourneyCalendarDay {
  const firstScore = reports[0]?.score ?? null;
  const latestScore = reports.at(-1)?.score ?? null;
  return {
    date,
    firstScore,
    hasNote: false,
    latestScore,
    missionSummary: {completed: 0, total: 0},
    reportCount: reports.length,
    scoreDelta: firstScore === null || latestScore === null ? null : latestScore - firstScore,
    status: latestScore === null
      ? 'empty'
      : latestScore >= LEGACY_GOAL_SCORE ? 'success' : 'failure',
  };
}

export function buildLegacyMakeupJourneyCalendar(
  month: string,
  rawReports: LegacyFeedbackReport[],
): MakeupJourneyCalendarResponse {
  const allReports = normalizedReports(rawReports);
  const allGroups = groupedByDate(allReports);
  const monthGroups = [...allGroups.entries()]
    .filter(([date]) => date.startsWith(`${month}-`))
    .sort(([left], [right]) => left.localeCompare(right));
  const days = monthGroups.map(([date, reports]) => calendarDay(date, reports));
  const latestScores = days.flatMap(day => day.latestScore === null ? [] : [day.latestScore]);

  return {
    days,
    goalScore: LEGACY_GOAL_SCORE,
    month,
    summary: {
      averageScore: roundedAverage(latestScores),
      currentStreak: getCurrentStreak([...allGroups.keys()]),
      recordedDays: latestScores.length,
    },
  };
}

function listTitles(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap(item => {
        const title = textValue(objectValue(item).title);
        return title ? [title] : [];
      })
    : [];
}

function buildDigest(report: NormalizedLegacyReport | undefined): MakeupJourneyFeedbackDigest | null {
  if (!report) {
    return null;
  }
  const summary = objectValue(report.result.summary);
  const strengths = listTitles(report.result.strengths);
  const improvements = listTitles(report.result.points);
  const firstPoint = Array.isArray(report.result.points)
    ? objectValue(report.result.points[0])
    : {};
  const actionSteps = Array.isArray(firstPoint.actionSteps)
    ? firstPoint.actionSteps
    : Array.isArray(firstPoint.action_steps) ? firstPoint.action_steps : [];

  return {
    headline: textValue(summary.strengthSummary ?? summary.strength_summary)
      ?? textValue(report.result.scoreReason ?? report.result.score_reason),
    improvementCount: improvements.length,
    improvements: improvements.slice(0, 2),
    nextAction: textValue(actionSteps[0]) ?? textValue(firstPoint.description),
    reportId: report.id,
    strengthCount: strengths.length,
    strengths: strengths.slice(0, 2),
  };
}

function journeyReport(report: NormalizedLegacyReport): MakeupJourneyReport {
  return {
    completedAt: report.completedAt,
    feedbackKind: report.feedbackKind,
    goalContext: report.goalContext,
    imageUrl: report.imageUrl,
    parentFeedbackReportId: report.parentFeedbackReportId,
    reportId: report.id,
    score: report.score,
  };
}

export function buildLegacyMakeupJourneyDay(
  entryDate: string,
  rawReports: LegacyFeedbackReport[],
): MakeupJourneyDayResponse {
  const reports = normalizedReports(rawReports).filter(report => report.date === entryDate);
  const day = calendarDay(entryDate, reports);
  const latest = reports.at(-1);

  return {
    date: entryDate,
    feedbackDigest: buildDigest(latest),
    firstScore: day.firstScore,
    goalScore: LEGACY_GOAL_SCORE,
    latestScore: day.latestScore,
    missions: [],
    note: null,
    reportCount: day.reportCount,
    reports: reports.map(journeyReport),
    scoreDelta: day.scoreDelta,
    status: day.status,
  };
}

export function buildLegacyMakeupJourneyTrend(
  range: MakeupJourneyTrendRange,
  endDate: string,
  rawReports: LegacyFeedbackReport[],
): MakeupJourneyTrendResponse {
  const startDate = getJourneyTrendStartDate(range, endDate);
  const groups = groupedByDate(normalizedReports(rawReports));
  const points = [...groups.entries()]
    .filter(([date]) => date >= startDate && date <= endDate)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([date, reports]) => {
      const score = reports.at(-1)?.score;
      return score === undefined ? [] : [{
        date,
        score,
        status: score >= LEGACY_GOAL_SCORE ? 'success' as const : 'failure' as const,
      }];
    });
  const scores = points.map(point => point.score);

  return {
    goalScore: LEGACY_GOAL_SCORE,
    points,
    range,
    summary: {
      averageScore: roundedAverage(scores),
      firstScore: scores[0] ?? null,
      highestScore: scores.length > 0 ? Math.max(...scores) : null,
      latestScore: scores.at(-1) ?? null,
    },
  };
}

export const legacyMakeupJourneySettings: MakeupJourneySettingsResponse = {
  requiresOnboarding: false,
  settings: {
    goalScore: LEGACY_GOAL_SCORE,
    missionLevel: 'beginner',
    timezoneName: 'Asia/Seoul',
  },
};

export function isMissingMakeupJourneyRoute(error: unknown): boolean {
  return error instanceof BackendApiError
    && error.status === 404
    && (error.code === undefined || error.code === 'HTTP_ERROR');
}

export async function fetchLegacyFeedbackReports(
  signal?: AbortSignal,
): Promise<LegacyFeedbackReport[]> {
  const response = await requestBackendJson<{reports?: LegacyFeedbackReport[]}>(
    '/feedback/reports',
    {signal},
  );
  return Array.isArray(response.reports) ? response.reports : [];
}
