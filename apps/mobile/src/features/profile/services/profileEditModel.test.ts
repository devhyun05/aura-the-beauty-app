import {
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
