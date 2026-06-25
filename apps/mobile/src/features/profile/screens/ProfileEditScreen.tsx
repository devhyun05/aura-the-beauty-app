import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, TextInput} from 'react-native';
import {Text, View} from 'tamagui';

import {
  getProfileEditFields,
  getUserProfile,
} from '../../../shared/services/userService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {ProfileEditField, UserProfile} from '../../../shared/types/profile';
import {
  AppCard,
  AppScreen,
  ChevronLeftIcon,
  ChevronRightIcon,
  IconButton,
  ImagePlaceholder,
} from '../../../shared/ui';
import {
  profileGenderOptions,
  profileInterestOptions,
} from '../constants/profileEditOptions';
import {ProfileEditRow} from '../components/ProfileEditRow';

type ProfileEditScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onLogout?: () => void;
};

type EditableProfileFieldId =
  | 'name'
  | 'nickname'
  | 'phone'
  | 'email'
  | 'birthDate'
  | 'gender'
  | 'interest';

type CalendarCell = {
  key: string;
  day: number | null;
  value: string;
};

const editableFieldIds: EditableProfileFieldId[] = [
  'name',
  'nickname',
  'phone',
  'email',
  'birthDate',
  'gender',
  'interest',
];
const weekLabels = ['일', '월', '화', '수', '목', '금', '토'];

export function ProfileEditScreen({
  onLogout,
}: ProfileEditScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fields, setFields] = useState<ProfileEditField[]>([]);
  const [notice, setNotice] = useState('');
  const [editingFieldId, setEditingFieldId] =
    useState<EditableProfileFieldId | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(new Date()),
  );

  useEffect(() => {
    let isMounted = true;

    Promise.all([getUserProfile(), getProfileEditFields()]).then(
      ([nextProfile, nextFields]) => {
        if (isMounted) {
          setProfile(nextProfile);
          setFields(nextFields);
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, []);

  const calendarCells = useMemo(
    () => createCalendarCells(calendarMonth),
    [calendarMonth],
  );
  const validationMessage = editingFieldId
    ? getValidationMessage(editingFieldId, draftValue, selectedInterests)
    : '';
  const canSave = Boolean(editingFieldId) && !validationMessage;

  const startEditing = (field: ProfileEditField) => {
    if (!profile || !isEditableProfileFieldId(field.id)) {
      return;
    }

    const nextValue = getProfileFieldValue(profile, field.id);
    setEditingFieldId(field.id);
    setDraftValue(nextValue);
    setNotice('');

    if (field.id === 'interest') {
      setSelectedInterests(splitInterests(nextValue));
    }

    if (field.id === 'birthDate') {
      setCalendarMonth(startOfMonth(parseDateValue(nextValue)));
    }
  };

  const cancelEditing = () => {
    setEditingFieldId(null);
    setDraftValue('');
    setSelectedInterests([]);
  };

  const saveEditing = () => {
    if (!profile || !editingFieldId || validationMessage) {
      return;
    }

    const nextValue =
      editingFieldId === 'interest'
        ? selectedInterests.join(', ')
        : draftValue.trim();

    setProfile({...profile, [editingFieldId]: nextValue});
    setFields((currentFields) =>
      currentFields.map((field) =>
        field.id === editingFieldId ? {...field, value: nextValue} : field,
      ),
    );
    setNotice('프로필 정보가 화면에 반영됐어요.');
    cancelEditing();
  };

  const moveCalendarMonth = (offset: number) => {
    setCalendarMonth(
      (currentMonth) =>
        new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth() + offset,
          1,
        ),
    );
  };

  const moveCalendarYear = (offset: number) => {
    setCalendarMonth(
      (currentMonth) =>
        new Date(
          currentMonth.getFullYear() + offset,
          currentMonth.getMonth(),
          1,
        ),
    );
  };
  const toggleInterest = (interest: string) => {
    setSelectedInterests((currentInterests) =>
      currentInterests.includes(interest)
        ? currentInterests.filter((item) => item !== interest)
        : [...currentInterests, interest],
    );
  };

  const updatePhonePart = (partIndex: 0 | 1 | 2, nextText: string) => {
    const parts = splitPhoneNumber(draftValue);
    const maxLengths = [3, 4, 4] as const;
    parts[partIndex] = nextText
      .replace(/\D/g, '')
      .slice(0, maxLengths[partIndex]);
    setDraftValue(parts.join('-'));
  };

  const updateEmailPart = (partIndex: 0 | 1, nextText: string) => {
    const [localPart, domainPart] = splitEmailValue(draftValue);
    const normalizedText = nextText.replace(/@/g, '').trim();

    setDraftValue(
      partIndex === 0
        ? `${normalizedText}@${domainPart}`
        : `${localPart}@${normalizedText}`,
    );
  };
  const renderEditor = (fieldId: EditableProfileFieldId) => {
    if (fieldId === 'phone') {
      const [prefix, middle, suffix] = splitPhoneNumber(draftValue);

      return (
        <View style={styles.fixedInputRow}>
          <TextInput
            accessibilityLabel="전화번호 앞자리"
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(nextText) => updatePhonePart(0, nextText)}
            placeholder="010"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, styles.phonePrefixInput]}
            value={prefix}
          />
          <Text style={styles.fixedDivider}>-</Text>
          <TextInput
            accessibilityLabel="전화번호 가운데 자리"
            keyboardType="number-pad"
            maxLength={4}
            onChangeText={(nextText) => updatePhonePart(1, nextText)}
            placeholder="0000"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, styles.phoneInput]}
            value={middle}
          />
          <Text style={styles.fixedDivider}>-</Text>
          <TextInput
            accessibilityLabel="전화번호 마지막 자리"
            keyboardType="number-pad"
            maxLength={4}
            onChangeText={(nextText) => updatePhonePart(2, nextText)}
            placeholder="0000"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, styles.phoneInput]}
            value={suffix}
          />
        </View>
      );
    }

    if (fieldId === 'email') {
      const [localPart, domainPart] = splitEmailValue(draftValue);

      return (
        <View style={styles.fixedInputRow}>
          <TextInput
            accessibilityLabel="이메일 아이디"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={(nextText) => updateEmailPart(0, nextText)}
            placeholder="email"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, styles.emailLocalInput]}
            value={localPart}
          />
          <Text style={styles.fixedDivider}>@</Text>
          <TextInput
            accessibilityLabel="이메일 도메인"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={(nextText) => updateEmailPart(1, nextText)}
            placeholder="domain.com"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, styles.emailDomainInput]}
            value={domainPart}
          />
        </View>
      );
    }

    if (fieldId === 'birthDate') {
      return (
        <View style={styles.calendarPanel}>
          <View style={styles.calendarYearRow}>
            <Pressable
              accessibilityLabel="이전 해로 이동"
              accessibilityRole="button"
              onPress={() => moveCalendarYear(-1)}
              style={styles.yearButton}
            >
              <Text style={styles.yearButtonText}>이전 해</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="다음 해로 이동"
              accessibilityRole="button"
              onPress={() => moveCalendarYear(1)}
              style={styles.yearButton}
            >
              <Text style={styles.yearButtonText}>다음 해</Text>
            </Pressable>
          </View>

          <View style={styles.calendarHeader}>
            <IconButton
              accessibilityLabel="이전 달"
              onPress={() => moveCalendarMonth(-1)}
              size={34}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Text style={styles.calendarTitle}>
              {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
            </Text>
            <IconButton
              accessibilityLabel="다음 달"
              onPress={() => moveCalendarMonth(1)}
              size={34}
            >
              <ChevronRightIcon />
            </IconButton>
          </View>

          <View style={styles.weekRow}>
            {weekLabels.map((label) => (
              <Text key={label} style={styles.weekLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {calendarCells.map((cell) => {
              const selected = cell.value === draftValue;

              return (
                <Pressable
                  accessibilityLabel={cell.day ? `${cell.value} 선택` : '빈 날짜'}
                  accessibilityRole="button"
                  disabled={!cell.day}
                  key={cell.key}
                  onPress={() => setDraftValue(cell.value)}
                  style={[styles.dayCell, selected ? styles.dayCellSelected : null]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !cell.day ? styles.dayTextMuted : null,
                      selected ? styles.dayTextSelected : null,
                    ]}
                  >
                    {cell.day ?? ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }

    if (fieldId === 'gender') {
      return (
        <View style={styles.optionRow}>
          {profileGenderOptions.map((option) => {
            const selected = draftValue === option;

            return (
              <Pressable
                accessibilityLabel={`${option} 선택`}
                accessibilityRole="button"
                key={option}
                onPress={() => setDraftValue(option)}
                style={[styles.segment, selected ? styles.segmentSelected : null]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected ? styles.segmentTextSelected : null,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    if (fieldId === 'interest') {
      return (
        <View style={styles.chipGrid}>
          {profileInterestOptions.map((interest) => {
            const selected = selectedInterests.includes(interest);

            return (
              <Pressable
                accessibilityLabel={`${interest} ${selected ? '해제' : '선택'}`}
                accessibilityRole="button"
                key={interest}
                onPress={() => toggleInterest(interest)}
                style={[styles.chip, selected ? styles.chipSelected : null]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected ? styles.chipTextSelected : null,
                  ]}
                >
                  {interest}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    return (
      <TextInput
        autoCapitalize="sentences"
        onChangeText={setDraftValue}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        value={draftValue}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <AppScreen contentGap={spacing.xl} topPadding="none">
        <View style={styles.profileArea}>
          <View style={styles.avatarFrame}>
            <ImagePlaceholder
              borderRadius={radius.pill}
              resizeMode="cover"
              source={profile?.avatarSource}
            />
          </View>
          <Pressable
            accessibilityLabel="사진 업로드"
            accessibilityRole="button"
            onPress={() => setNotice('사진 업로드는 프론트엔드 UI만 준비되어 있어요.')}
            style={styles.uploadButton}
          >
            <Text style={styles.uploadText}>사진 업로드</Text>
          </Pressable>
        </View>

        <AppCard style={styles.infoCard}>
          {fields.map((field) => {
            const editableFieldId = isEditableProfileFieldId(field.id)
              ? field.id
              : null;
            const displayField =
              profile && editableFieldId
                ? {...field, value: getProfileFieldValue(profile, editableFieldId)}
                : field;
            const isEditing = editingFieldId === editableFieldId;

            return (
              <View key={field.id} style={styles.fieldBlock}>
                <ProfileEditRow
                  field={displayField}
                  isEditing={isEditing}
                  onPressEdit={
                    field.editable && editableFieldId
                      ? () => startEditing(displayField)
                      : undefined
                  }
                />

                {isEditing && editableFieldId ? (
                  <View style={styles.editorPanel}>
                    {renderEditor(editableFieldId)}
                    {validationMessage ? (
                      <Text style={styles.errorText}>{validationMessage}</Text>
                    ) : null}
                    <View style={styles.editorActionRow}>
                      <Pressable
                        accessibilityLabel="수정 취소"
                        accessibilityRole="button"
                        onPress={cancelEditing}
                        style={styles.cancelButton}
                      >
                        <Text style={styles.cancelButtonText}>취소</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="수정 완료"
                        accessibilityRole="button"
                        disabled={!canSave}
                        onPress={saveEditing}
                        style={[
                          styles.saveButton,
                          !canSave ? styles.saveButtonDisabled : null,
                        ]}
                      >
                        <Text style={styles.saveButtonText}>완료</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel="로그아웃"
              accessibilityRole="button"
              onPress={() => {
                setNotice('');
                onLogout?.();
              }}
              style={styles.textButton}
            >
              <Text style={styles.actionText}>로그아웃</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="회원 탈퇴"
              accessibilityRole="button"
              onPress={() => setNotice('회원 탈퇴는 아직 연결되지 않았어요.')}
              style={styles.textButton}
            >
              <Text style={styles.actionText}>회원 탈퇴</Text>
            </Pressable>
          </View>
        </AppCard>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </AppScreen>
    </View>
  );
}

function isEditableProfileFieldId(id: string): id is EditableProfileFieldId {
  return editableFieldIds.includes(id as EditableProfileFieldId);
}

function getProfileFieldValue(
  profile: UserProfile,
  fieldId: EditableProfileFieldId,
) {
  return profile[fieldId];
}

function splitInterests(value: string) {
  return value
    .split(',')
    .map((interest) => interest.trim())
    .filter(Boolean);
}

function splitPhoneNumber(value: string): [string, string, string] {
  const [prefix = '', middle = '', suffix = ''] = value.split('-');

  return [
    prefix.replace(/\D/g, '').slice(0, 3),
    middle.replace(/\D/g, '').slice(0, 4),
    suffix.replace(/\D/g, '').slice(0, 4),
  ];
}

function splitEmailValue(value: string): [string, string] {
  const atIndex = value.indexOf('@');

  if (atIndex < 0) {
    return [value, ''];
  }

  return [value.slice(0, atIndex), value.slice(atIndex + 1)];
}

function getValidationMessage(
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

function parseDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function createCalendarCells(month: Date): CalendarCell[] {
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

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.lg,
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.md,
  },
  avatarFrame: {
    borderRadius: 62,
    height: 124,
    overflow: 'hidden',
    width: 124,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarPanel: {
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  calendarTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  chip: {
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  chipTextSelected: {
    color: colors.white,
  },
  dayCell: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: '14.285%',
  },
  dayCellSelected: {
    backgroundColor: colors.black,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  dayTextMuted: {
    color: colors.textTertiary,
  },
  dayTextSelected: {
    color: colors.white,
  },
  editorActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  editorPanel: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  fieldBlock: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  fixedDivider: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  fixedInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emailDomainInput: {
    flex: 1.2,
  },
  emailLocalInput: {
    flex: 1,
  },
  infoCard: {
    borderColor: colors.border,
    gap: spacing.xs,
    padding: spacing.xl,
  },
  input: {
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.md,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  notice: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  phoneInput: {
    flex: 1,
    textAlign: 'center',
  },
  phonePrefixInput: {
    flex: 0.8,
    textAlign: 'center',
  },
  profileArea: {
    alignItems: 'center',
    gap: spacing.md,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.lg,
  },
  saveButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  segment: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  segmentSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  segmentText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  segmentTextSelected: {
    color: colors.white,
  },
  textButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  uploadButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  uploadText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.md,
  },
  weekLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
    width: '14.285%',
  },
  weekRow: {
    flexDirection: 'row',
  },
  yearButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  yearButtonText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  calendarYearRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
});
