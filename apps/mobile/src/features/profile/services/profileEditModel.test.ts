import {
  createBirthDateDayOptions,
  createBirthDateMonthOptions,
  createBirthDateYearOptions,
  createCalendarCells,
  getProfileEditValidationMessage,
  splitEmailValue,
  splitInterests,
  splitPhoneNumber,
} from './profileEditModel';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  splitInterests(' 립, 베이스 ,, 아이 ').join('|'),
  '립|베이스|아이',
  'profile edit interest split trims empty values',
);
expectEqual(
  splitPhoneNumber('010-12345-abcd')[1],
  '1234',
  'profile edit phone middle clips numeric value',
);
expectEqual(
  splitEmailValue('aura@example.com')[1],
  'example.com',
  'profile edit email split preserves domain',
);
expectEqual(
  getProfileEditValidationMessage('email', 'aura.example.com', []),
  '이메일에는 @가 포함되어야 해요.',
  'profile edit email validation message',
);
expectEqual(
  createCalendarCells(new Date(2026, 5, 1)).length,
  35,
  'profile edit calendar cells fill full weeks',
);
expectEqual(
  createBirthDateYearOptions(2026).slice(0, 4).join('|'),
  '2026|2025|2024|2023',
  'profile edit birth date wheel starts with the latest year',
);
expectEqual(
  createBirthDateYearOptions(2026).at(-1),
  1900,
  'profile edit birth date wheel reaches the minimum year',
);
expectEqual(
  createBirthDateMonthOptions(2026, new Date(2026, 6, 18)).length,
  7,
  'profile edit birth date wheel excludes future months',
);
expectEqual(
  createBirthDateMonthOptions(1995, new Date(2026, 6, 18)).length,
  12,
  'profile edit birth date wheel includes every month for a past year',
);
expectEqual(
  createBirthDateDayOptions(2024, 2, new Date(2026, 6, 18)).length,
  29,
  'profile edit birth date wheel supports leap years',
);
expectEqual(
  createBirthDateDayOptions(2026, 7, new Date(2026, 6, 18)).length,
  18,
  'profile edit birth date wheel excludes future days',
);
