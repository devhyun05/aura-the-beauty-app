import type {
  MakeupJourneyCacheTarget,
  MakeupJourneyCalendarResponse,
  MakeupJourneyDayResponse,
  MakeupJourneyTrendRange,
  MakeupJourneyTrendResponse,
} from '../types';
import {getMonthFromDate} from '../utils/date';

type CacheInvalidationListener = (target: MakeupJourneyCacheTarget | null) => void;

const monthCache = new Map<string, MakeupJourneyCalendarResponse>();
const dayCache = new Map<string, MakeupJourneyDayResponse>();
const trendCache = new Map<string, MakeupJourneyTrendResponse>();
const listeners = new Set<CacheInvalidationListener>();
export const MAX_CACHED_MAKEUP_JOURNEY_MONTHS = 8;
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

export function getCachedMakeupJourneyDay(entryDate: string): MakeupJourneyDayResponse | null {
  return dayCache.get(entryDate) ?? null;
}

export function setCachedMakeupJourneyDay(
  entryDate: string,
  data: MakeupJourneyDayResponse,
): void {
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
  } else {
    const month = normalizedTarget.month ?? (
      normalizedTarget.entryDate ? getMonthFromDate(normalizedTarget.entryDate) : null
    );
    if (month) {
      monthCache.delete(month);
    }
    if (normalizedTarget.entryDate) {
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
