import {
  addDays,
  createJourneyCalendarGrid,
  getJourneyTrendEndDateForMonth,
  getJourneyTrendStartDate,
  getMonthFromDate,
  isFutureJourneyDate,
  isIsoDateString,
  isYearMonthString,
  shiftMonth,
} from './date';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const july = createJourneyCalendarGrid('2026-07');
expect(july.length === 42, 'calendar always renders a fixed six-week grid');
expect(july[0]?.date === '2026-06-28', 'grid begins on the previous Sunday');
expect(july[41]?.date === '2026-08-08', 'grid ends after exactly 42 dates');
expect(july.filter(cell => cell.inCurrentMonth).length === 31, 'current month cells are mapped');

const leapFebruary = createJourneyCalendarGrid('2028-02');
expect(
  leapFebruary.filter(cell => cell.inCurrentMonth).length === 29,
  'leap-year February keeps all dates',
);
expect(addDays('2028-02-28', 1) === '2028-02-29', 'date addition is UTC-safe');
expect(addDays('2028-02-29', 1) === '2028-03-01', 'leap day crosses the month safely');
expect(shiftMonth('2026-01', -1) === '2025-12', 'month shifting crosses years');
expect(!isYearMonthString('0000-01'), 'calendar month rejects the unsupported year zero');
expect(getMonthFromDate('2026-07-17') === '2026-07', 'month is read from the string key');
expect(isIsoDateString('2026-07-17'), 'canonical API date is accepted');
expect(!isIsoDateString('2026-02-30'), 'impossible date is rejected');
expect(isFutureJourneyDate('2026-07-18', '2026-07-17'), 'future comparison uses date strings');
expect(
  getJourneyTrendEndDateForMonth('2026-06', '2026-07-17') === '2026-06-30',
  'past-month graph ends on the last day of the visible month',
);
expect(
  getJourneyTrendEndDateForMonth('2026-07', '2026-07-17') === '2026-07-17',
  'current-month graph ends today',
);
expect(
  getJourneyTrendEndDateForMonth('2026-08', '2026-07-17') === '2026-07-17',
  'future-month graph remains clamped to today',
);
expect(
  getJourneyTrendStartDate('7d', '2026-07-17') === '2026-07-11',
  'seven-day graph includes exactly seven calendar dates',
);
expect(
  getJourneyTrendStartDate('30d', '2026-07-17') === '2026-06-18',
  'thirty-day graph crosses month boundaries',
);
expect(
  getJourneyTrendStartDate('90d', '2026-07-17') === '2026-04-19',
  'three-month graph uses a ninety-day window',
);

console.log('makeup journey date contract passed');
