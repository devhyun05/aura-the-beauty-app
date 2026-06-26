import type {UserProfile} from '../../../shared/types/profile';

export type EditableProfileFieldId =
  | 'name'
  | 'nickname'
  | 'phone'
  | 'email'
  | 'birthDate'
  | 'gender'
  | 'interest';

export type CalendarCell = {
  key: string;
  day: number | null;
  value: string;
};

export const editableProfileFieldIds: EditableProfileFieldId[] = [
  'name',
  'nickname',
  'phone',
  'email',
  'birthDate',
  'gender',
  'interest',
];

export const profileEditWeekLabels = ['일', '월', '화', '수', '목', '금', '토'];

export function isEditableProfileFieldId(id: string): id is EditableProfileFieldId {
  return editableProfileFieldIds.includes(id as EditableProfileFieldId);
}

export function getProfileFieldValue(
  profile: UserProfile,
  fieldId: EditableProfileFieldId,
) {
  return profile[fieldId];
}

export function splitInterests(value: string) {
  return value
    .split(',')
    .map((interest) => interest.trim())
    .filter(Boolean);
}

export function splitPhoneNumber(value: string): [string, string, string] {
  const [prefix = '', middle = '', suffix = ''] = value.split('-');

  return [
    prefix.replace(/\D/g, '').slice(0, 3),
    middle.replace(/\D/g, '').slice(0, 4),
    suffix.replace(/\D/g, '').slice(0, 4),
  ];
}

export function splitEmailValue(value: string): [string, string] {
  const atIndex = value.indexOf('@');

  if (atIndex < 0) {
    return [value, ''];
  }

  return [value.slice(0, atIndex), value.slice(atIndex + 1)];
}

export function getProfileEditValidationMessage(
  fieldId: EditableProfileFieldId,
  draftValue: string,
  selectedInterests: string[],
) {
  const trimmedValue = draftValue.trim();

  if ((fieldId === 'name' || fieldId === 'nickname') && !trimmedValue) {
    return '값을 입력해 주세요.';
  }

  if (fieldId === 'phone' && !/^010-\d{4}-\d{4}$/.test(trimmedValue)) {
    return '전화번호는 010-0000-0000 형식으로 입력해 주세요.';
  }

  if (fieldId === 'email') {
    const [localPart, domainPart] = trimmedValue.split('@');

    if (!trimmedValue.includes('@') || !localPart || !domainPart) {
      return '이메일에는 @가 포함되어야 해요.';
    }
  }

  if (fieldId === 'birthDate' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return '생년월일을 선택해 주세요.';
  }

  if (fieldId === 'gender' && !trimmedValue) {
    return '성별을 선택해 주세요.';
  }

  if (fieldId === 'interest' && selectedInterests.length === 0) {
    return '관심사를 하나 이상 선택해 주세요.';
  }

  return '';
}

export function parseDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function createCalendarCells(month: Date): CalendarCell[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push({key: `empty-${index}`, day: null, value: ''});
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    cells.push({
      key: formatDateValue(date),
      day,
      value: formatDateValue(date),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({key: `empty-end-${cells.length}`, day: null, value: ''});
  }

  return cells;
}
