import {
  formatReportCreatedAtLabel,
  formatReportCreatedDate,
} from './reportDate';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  formatReportCreatedDate('2026-07-22'),
  '2026. 07. 22.',
  'date-only API value stays timezone safe',
);
expectEqual(
  formatReportCreatedAtLabel('2026-07-22'),
  '생성일 2026. 07. 22.',
  'report creation label',
);
expectEqual(
  formatReportCreatedAtLabel(undefined),
  '생성일 확인 불가',
  'missing creation date is explicit instead of fabricated',
);
