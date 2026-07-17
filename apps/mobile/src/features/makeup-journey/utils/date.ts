const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

const KOREAN_MONTHS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
] as const;

export const JOURNEY_WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

export type JourneyCalendarCell = DateParts & {
  date: string;
  dayOfWeek: number;
  inCurrentMonth: boolean;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function isIsoDateString(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isYearMonthString(value: string): boolean {
  const match = YEAR_MONTH_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1 && month >= 1 && month <= 12;
}

export function getDateParts(value: string): DateParts {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match || !isIsoDateString(value)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function getYearMonthParts(value: string): Omit<DateParts, 'day'> {
  const match = YEAR_MONTH_PATTERN.exec(value);
  if (!match || !isYearMonthString(value)) {
    throw new Error(`Invalid calendar month: ${value}`);
  }

  return {year: Number(match[1]), month: Number(match[2])};
}

export function toIsoDate(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function getTodayDateString(now = new Date()): string {
  return toIsoDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}

export function getMonthFromDate(date: string): string {
  if (!isIsoDateString(date)) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  return date.slice(0, 7);
}

export function getCurrentMonthString(now = new Date()): string {
  return getTodayDateString(now).slice(0, 7);
}

export function getJourneyTrendEndDateForMonth(
  month: string,
  today = getTodayDateString(),
): string {
  if (!isYearMonthString(month) || !isIsoDateString(today)) {
    throw new Error('Invalid journey trend date boundary.');
  }

  const todayMonth = getMonthFromDate(today);
  if (month >= todayMonth) {
    return today;
  }

  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}

export function getJourneyTrendStartDate(
  range: '7d' | '30d' | '90d',
  endDate: string,
): string {
  if (!isIsoDateString(endDate)) {
    throw new Error('Invalid journey trend end date.');
  }
  const rangeDays = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return addDays(endDate, -(rangeDays - 1));
}

export function shiftMonth(month: string, offset: number): string {
  const parts = getYearMonthParts(month);
  const absoluteMonth = parts.year * 12 + (parts.month - 1) + offset;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
  return `${String(nextYear).padStart(4, '0')}-${pad2(nextMonth)}`;
}

export function addDays(date: string, offset: number): string {
  const parts = getDateParts(date);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  return toIsoDate({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}

export function createJourneyCalendarGrid(month: string): JourneyCalendarCell[] {
  const parts = getYearMonthParts(month);
  const firstDate = `${String(parts.year).padStart(4, '0')}-${pad2(parts.month)}-01`;
  const firstDayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, 1)).getUTCDay();
  const gridStart = addDays(firstDate, -firstDayOfWeek);

  return Array.from({length: 42}, (_, index) => {
    const date = addDays(gridStart, index);
    const dateParts = getDateParts(date);
    return {
      ...dateParts,
      date,
      dayOfWeek: index % 7,
      inCurrentMonth: date.startsWith(`${month}-`),
    };
  });
}

export function formatJourneyMonth(month: string): string {
  const parts = getYearMonthParts(month);
  return `${parts.year}년 ${KOREAN_MONTHS[parts.month - 1]}`;
}

export function formatJourneyDate(date: string, includeYear = true): string {
  const parts = getDateParts(date);
  return includeYear
    ? `${parts.year}년 ${parts.month}월 ${parts.day}일`
    : `${parts.month}월 ${parts.day}일`;
}

export function isFutureJourneyDate(date: string, today = getTodayDateString()): boolean {
  if (!isIsoDateString(date) || !isIsoDateString(today)) {
    return false;
  }
  return date > today;
}

export function getJourneyDateAccessibilityLabel(date: string): string {
  const parts = getDateParts(date);
  return `${parts.month}월 ${parts.day}일`;
}
