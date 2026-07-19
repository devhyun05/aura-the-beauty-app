import type {
  MakeupJourneyCacheTarget,
  MakeupJourneyCalendarResponse,
  MakeupJourneyDayResponse,
  MakeupJourneyScoreSelection,
  MakeupJourneyStatus,
  MakeupJourneyTrendRange,
  MakeupJourneyTrendResponse,
} from '../types';
import {getMonthFromDate} from '../utils/date';

type CacheInvalidationListener = (target: MakeupJourneyCacheTarget | null) => void;

const monthCache = new Map<string, MakeupJourneyCalendarResponse>();
const dayCache = new Map<string, MakeupJourneyDayResponse>();
const trendCache = new Map<string, MakeupJourneyTrendResponse>();
const invalidatedMonthSnapshots = new Map<string, MakeupJourneyCalendarResponse>();
const invalidatedDaySnapshots = new Map<string, MakeupJourneyDayResponse>();
const listeners = new Set<CacheInvalidationListener>();
export const MAX_CACHED_MAKEUP_JOURNEY_MONTHS = 8;
const MAX_INVALIDATED_MAKEUP_JOURNEY_DAYS = 32;
let cacheRevision = 0;

function getTrendKey(range: MakeupJourneyTrendRange, endDate: string): string {
  return `${range}:${endDate}`;
}
export function getCachedMakeupJourneyMonth(
  month: string,
): MakeupJourneyCalendarResponse | null {
  return monthCache.get(month) ?? null;
}

export function setCachedMakeupJourneyMonth(
  month: string,
  data: MakeupJourneyCalendarResponse,
): void {
  invalidatedMonthSnapshots.delete(month);
  monthCache.delete(month);
  monthCache.set(month, data);
  while (monthCache.size > MAX_CACHED_MAKEUP_JOURNEY_MONTHS) {
    const oldestMonth = monthCache.keys().next().value;
    if (typeof oldestMonth !== 'string') {
      break;
    }
    monthCache.delete(oldestMonth);
  }
}

export function getMakeupJourneyCacheRevision(): number {
  return cacheRevision;
}

function getRepresentativeStatus(
  score: number | null,
  goalScore: number | null,
): MakeupJourneyStatus {
  if (score === null || goalScore === null) {
    return 'empty';
  }
  return score >= goalScore ? 'success' : 'failure';
}

function getRepresentativeScoreAverage(
  days: MakeupJourneyCalendarResponse['days'],
): number | null {
  const scores = days.flatMap(day => {
    const score = day.representativeScore ?? day.latestScore;
    return score === null ? [] : [score];
  });
  if (scores.length === 0) {
    return null;
  }
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function getCachedMakeupJourneyDay(entryDate: string): MakeupJourneyDayResponse | null {
  return dayCache.get(entryDate) ?? null;
}

export function setCachedMakeupJourneyDay(
  entryDate: string,
  data: MakeupJourneyDayResponse,
): void {
  invalidatedDaySnapshots.delete(entryDate);
  dayCache.set(entryDate, data);
}

export function getCachedMakeupJourneyTrend(
  range: MakeupJourneyTrendRange,
  endDate: string,
): MakeupJourneyTrendResponse | null {
  return trendCache.get(getTrendKey(range, endDate)) ?? null;
}

export function setCachedMakeupJourneyTrend(
  range: MakeupJourneyTrendRange,
  endDate: string,
  data: MakeupJourneyTrendResponse,
): void {
  trendCache.set(getTrendKey(range, endDate), data);
}

/**
 * Commits the server-accepted representative report into every warm cache before
 * revalidation. The month screen can remain mounted behind the detail route, so
 * deleting its cache and waiting for another GET would briefly show the prior
 * face and score when the user navigates back.
 */
export function commitMakeupJourneyScoreSelection(
  selection: MakeupJourneyScoreSelection,
): void {
  const entryDate = selection.date;
  const month = getMonthFromDate(entryDate);
  const cachedDay = dayCache.get(entryDate) ?? invalidatedDaySnapshots.get(entryDate);
  if (cachedDay) {
    const selectedReport = cachedDay.reports.find(
      report => report.reportId === selection.reportId,
    );
    dayCache.set(entryDate, {
      ...cachedDay,
      feedbackDigest: selectedReport
        ? selectedReport.feedbackDigest
        : cachedDay.feedbackDigest,
      note: selectedReport ? selectedReport.note : cachedDay.note,
      representativeReportId: selection.reportId,
      representativeScore: selection.score,
      scoreDelta: cachedDay.firstScore === null
        ? null
        : selection.score - cachedDay.firstScore,
      status: getRepresentativeStatus(selection.score, cachedDay.goalScore),
    });
    invalidatedDaySnapshots.delete(entryDate);
  }

  const cachedMonth = monthCache.get(month) ?? invalidatedMonthSnapshots.get(month);
  if (cachedMonth) {
    const days = cachedMonth.days.map(day => day.date === entryDate
      ? {
          ...day,
          representativeReportId: selection.reportId,
          representativeScore: selection.score,
          representativeThumbnailUrl: selection.representativeThumbnailUrl,
          scoreDelta: day.firstScore === null ? null : selection.score - day.firstScore,
          status: getRepresentativeStatus(selection.score, cachedMonth.goalScore),
        }
      : day);
    setCachedMakeupJourneyMonth(month, {
      ...cachedMonth,
      days,
      summary: {
        ...cachedMonth.summary,
        averageScore: getRepresentativeScoreAverage(days),
        recordedDays: days.filter(
          day => (day.representativeScore ?? day.latestScore) !== null,
        ).length,
      },
    });
  }

  // A selection changes every trend range, and advancing the data revision keeps
  // an older adjacent-month prefetch from restoring the previous representative.
  trendCache.clear();
  cacheRevision += 1;
  listeners.forEach(listener => listener({entryDate}));
}

export function subscribeMakeupJourneyCacheInvalidation(
  listener: CacheInvalidationListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function matchesMakeupJourneyCacheTarget(
  target: MakeupJourneyCacheTarget | null,
  input: {entryDate?: string; month?: string},
): boolean {
  if (!target) {
    return true;
  }
  if (input.entryDate && target.entryDate === input.entryDate) {
    return true;
  }
  const inputMonth = input.month ?? (input.entryDate ? getMonthFromDate(input.entryDate) : null);
  const targetMonth = target.month ?? (target.entryDate ? getMonthFromDate(target.entryDate) : null);
  return Boolean(inputMonth && targetMonth && inputMonth === targetMonth);
}

export function invalidateMakeupJourneyCache(target?: MakeupJourneyCacheTarget): void {
  const normalizedTarget = target && (target.entryDate || target.month) ? target : null;
  cacheRevision += 1;

  if (!normalizedTarget) {
    monthCache.clear();
    dayCache.clear();
    trendCache.clear();
    invalidatedMonthSnapshots.clear();
    invalidatedDaySnapshots.clear();
  } else {
    const month = normalizedTarget.month ?? (
      normalizedTarget.entryDate ? getMonthFromDate(normalizedTarget.entryDate) : null
    );
    if (month) {
      const cachedMonth = monthCache.get(month);
      if (cachedMonth) {
        invalidatedMonthSnapshots.delete(month);
        invalidatedMonthSnapshots.set(month, cachedMonth);
        while (invalidatedMonthSnapshots.size > MAX_CACHED_MAKEUP_JOURNEY_MONTHS) {
          const oldestMonth = invalidatedMonthSnapshots.keys().next().value;
          if (typeof oldestMonth !== 'string') {
            break;
          }
          invalidatedMonthSnapshots.delete(oldestMonth);
        }
      }
      monthCache.delete(month);
    }
    if (normalizedTarget.entryDate) {
      const cachedDay = dayCache.get(normalizedTarget.entryDate);
      if (cachedDay) {
        invalidatedDaySnapshots.delete(normalizedTarget.entryDate);
        invalidatedDaySnapshots.set(normalizedTarget.entryDate, cachedDay);
        while (invalidatedDaySnapshots.size > MAX_INVALIDATED_MAKEUP_JOURNEY_DAYS) {
          const oldestDate = invalidatedDaySnapshots.keys().next().value;
          if (typeof oldestDate !== 'string') {
            break;
          }
          invalidatedDaySnapshots.delete(oldestDate);
        }
      }
      dayCache.delete(normalizedTarget.entryDate);
    }
    trendCache.clear();
  }

  listeners.forEach(listener => listener(normalizedTarget));
}

export function notifyMakeupJourneyFeedbackCompleted(entryDate?: string): void {
  invalidateMakeupJourneyCache(entryDate ? {entryDate} : undefined);
}

export type JourneyRequestToken = {
  key: string;
  sequence: number;
};

export type JourneyRequestGate = {
  begin: (key: string) => JourneyRequestToken;
  isCurrent: (token: JourneyRequestToken, key: string) => boolean;
};

export function createJourneyRequestGate(): JourneyRequestGate {
  let sequence = 0;
  let currentKey = '';
  return {
    begin: key => {
      currentKey = key;
      sequence += 1;
      return {key, sequence};
    },
    isCurrent: (token, key) => token.sequence === sequence && token.key === key && currentKey === key,
  };
}
