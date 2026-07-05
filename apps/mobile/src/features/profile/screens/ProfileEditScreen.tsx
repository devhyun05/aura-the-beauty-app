import {useEffect, useMemo, useState} from 'react';
import * as ImagePicker from 'expo-image-picker';
import {CalendarDays} from 'lucide-react-native';
import {Modal, Pressable, StyleSheet, TextInput} from 'react-native';
import {Text, View} from 'tamagui';

import {
  getProfileEditFields,
  getUserProfile,
  updateUserProfile,
} from '../../../shared/services/userService';
import {uploadMediaAsset} from '../../../shared/services/mediaUploadService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {ProfileEditField, UserProfile} from '../../../shared/types/profile';
import {
  AppCard,
  AppHeader,
  AppScreen,
  ChevronLeftIcon,
  ChevronRightIcon,
  IconButton,
  ImagePlaceholder,
  PencilIcon,
  ProfileHeaderIcon,
} from '../../../shared/ui';
import {profileGenderOptions} from '../constants/profileEditOptions';
import {
  createCalendarCells,
  getProfileEditValidationMessage,
  getProfileFieldValue,
  isEditableProfileFieldId,
  parseDateValue,
  profileEditWeekLabels,
  startOfMonth,
  type EditableProfileFieldId,
} from '../services/profileEditModel';

type ProfileEditScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onLogout?: () => void;
};

type VisibleEditableProfileFieldId = Exclude<
  EditableProfileFieldId,
  'phone' | 'interest'
>;

type VisibleProfileEditField = ProfileEditField & {
  id: VisibleEditableProfileFieldId;
};

const profileEditHeaderPresentation = {
  contextLabel: 'PROFILE',
  headerComponent: 'AppHeader',
  title: '프로필 수정',
} as const;

export function getProfileEditHeaderPresentation() {
  return profileEditHeaderPresentation;
}

function isVisibleProfileEditField(
  field: ProfileEditField,
): field is VisibleProfileEditField {
  return (
    isEditableProfileFieldId(field.id) &&
    field.id !== 'phone' &&
    field.id !== 'interest'
  );
}

function getFieldsForProfile(
  fields: ProfileEditField[],
  profile: UserProfile,
): ProfileEditField[] {
  return fields.map((field) =>
    isEditableProfileFieldId(field.id)
      ? {...field, value: getProfileFieldValue(profile, field.id)}
      : field,
  );
}

export function ProfileEditScreen({
  headerTitle = profileEditHeaderPresentation.title,
  onBack,
  onLogout,
}: ProfileEditScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fields, setFields] = useState<ProfileEditField[]>([]);
  const [notice, setNotice] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draftProfile, setDraftProfile] = useState<UserProfile | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getUserProfile(), getProfileEditFields()]).then(
      ([nextProfile, nextFields]) => {
        if (isMounted) {
          setProfile(nextProfile);
          setFields(getFieldsForProfile(nextFields, nextProfile));
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, []);

  const editableFields = useMemo(
    () => fields.filter(isVisibleProfileEditField),
    [fields],
  );
  const calendarCells = useMemo(
    () => createCalendarCells(calendarMonth),
    [calendarMonth],
  );
  const validationMessages = useMemo(() => {
    if (!draftProfile) {
      return [];
    }

    return editableFields
      .filter((field) => field.id !== 'email')
      .map((field) =>
        getProfileEditValidationMessage(
          field.id,
          getProfileFieldValue(draftProfile, field.id),
          [],
        ),
      )
      .filter(Boolean);
  }, [draftProfile, editableFields]);
  const activeProfile = isEditing ? draftProfile : profile;
  const canSave =
    isEditing && Boolean(draftProfile) && validationMessages.length === 0 && !isSaving;

  const startEditing = () => {
    if (!profile) {
      return;
    }

    setDraftProfile(profile);
    setCalendarMonth(startOfMonth(parseDateValue(profile.birthDate)));
    setIsEditing(true);
    setNotice('');
  };

  const cancelEditing = () => {
    setDraftProfile(null);
    setIsEditing(false);
    setIsCalendarOpen(false);
    setNotice('');
  };

  const updateDraftProfile = (
    updater: (currentProfile: UserProfile) => UserProfile,
  ) => {
    setDraftProfile((currentProfile) =>
      currentProfile ? updater(currentProfile) : currentProfile,
    );
  };

  const updateDraftField = (
    fieldId: VisibleEditableProfileFieldId,
    nextValue: string,
  ) => {
    updateDraftProfile((currentProfile) => ({
      ...currentProfile,
      [fieldId]: nextValue,
    }));
  };

  const saveEditing = async () => {
    if (!profile || !draftProfile || !canSave) {
      return;
    }

    const previousProfile = profile;
    const previousFields = fields;
    const nextProfile = draftProfile;
    const nextFields = getFieldsForProfile(fields, nextProfile);

    setIsSaving(true);
    setProfile(nextProfile);
    setFields(nextFields);
    setDraftProfile(null);
    setIsEditing(false);
    setIsCalendarOpen(false);

    try {
      const savedProfile = await updateUserProfile(nextProfile);
      setProfile(savedProfile);
      setFields(getFieldsForProfile(nextFields, savedProfile));
      setNotice('프로필 정보가 저장되었어요.');
    } catch {
      setProfile(previousProfile);
      setFields(previousFields);
      setNotice('프로필 정보를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    if (!draftProfile || isPickingImage) {
      return;
    }

    setIsPickingImage(true);

    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        setNotice('사진 접근 권한이 필요해요.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ['images'],
        quality: 0.9,
      });

      const selectedAsset = pickerResult.canceled
        ? undefined
        : pickerResult.assets[0];
      const selectedUri = selectedAsset?.uri;

      if (selectedUri) {
        try {
          const uploadedAvatar = await uploadMediaAsset({
            contentType: selectedAsset.mimeType,
            fileName: selectedAsset.fileName,
            height: selectedAsset.height,
            mediaKind: 'profile-avatar',
            source: 'gallery',
            uri: selectedUri,
            width: selectedAsset.width,
          });

          updateDraftProfile((currentProfile) => ({
            ...currentProfile,
            avatarMediaId: uploadedAvatar.id,
            avatarSource: {uri: uploadedAvatar.cdnUrl ?? selectedUri},
          }));
          setNotice('');
        } catch {
          setNotice('프로필 사진 업로드에 실패했어요. 네트워크를 확인해 주세요.');
        }
      }
    } catch {
      setNotice('사진을 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      setIsPickingImage(false);
    }
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
  const getDisplayedFieldValue = (fieldId: VisibleEditableProfileFieldId) =>
    activeProfile ? getProfileFieldValue(activeProfile, fieldId) : '';

  const getValidationMessageForField = (
    fieldId: VisibleEditableProfileFieldId,
  ) => {
    if (fieldId === 'email') {
      return '';
    }

    if (!isEditing || !draftProfile) {
      return '';
    }

    return getProfileEditValidationMessage(
      fieldId,
      getProfileFieldValue(draftProfile, fieldId),
      [],
    );
  };


  const openBirthDateCalendar = () => {
    if (!draftProfile) {
      return;
    }

    setCalendarMonth(startOfMonth(parseDateValue(draftProfile.birthDate)));
    setIsCalendarOpen(true);
  };

  const closeBirthDateCalendar = () => {
    setIsCalendarOpen(false);
  };

  const selectBirthDate = (nextValue: string) => {
    updateDraftField('birthDate', nextValue);
    setIsCalendarOpen(false);
  };
  const renderEditor = (fieldId: VisibleEditableProfileFieldId) => {
    const value = draftProfile ? getProfileFieldValue(draftProfile, fieldId) : '';

    if (fieldId === 'email') {
      return (
        <View style={styles.fixedValueBox}>
          <Text numberOfLines={1} style={styles.fixedValueText}>
            {value || 'OAuth 이메일'}
          </Text>
        </View>
      );
    }
    if (fieldId === 'birthDate') {
      return (
        <Pressable
          accessibilityLabel="생년월일 선택"
          accessibilityRole="button"
          onPress={openBirthDateCalendar}
          style={styles.dateButton}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.dateButtonText,
              !value ? styles.dateButtonPlaceholder : null,
            ]}
          >
            {value || '생년월일 선택'}
          </Text>
          <CalendarDays color={colors.textSecondary} size={20} strokeWidth={1.8} />
        </Pressable>
      );
    }

    if (fieldId === 'gender') {
      return (
        <View style={styles.optionRow}>
          {profileGenderOptions.map((option) => {
            const selected = value === option;

            return (
              <Pressable
                accessibilityLabel={`${option} 선택`}
                accessibilityRole="button"
                key={option}
                onPress={() => updateDraftField(fieldId, option)}
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

    return (
      <TextInput
        autoCapitalize="sentences"
        onChangeText={(nextText) => updateDraftField(fieldId, nextText)}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, styles.inlineInput]}
        value={value}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        containerProps={{style: styles.overlayHeader}}
        contextLabel={profileEditHeaderPresentation.contextLabel}
        leftSlot={onBack ? undefined : <View />}
        onBack={onBack}
        title={headerTitle}
      />
      <AppScreen contentGap={spacing.xl} topPadding="belowOverlayHeader">
        <View style={styles.profileArea}>
          <View style={styles.avatarFrame}>
            {activeProfile?.avatarSource ? (
              <ImagePlaceholder
                borderRadius={radius.pill}
                resizeMode="cover"
                source={activeProfile.avatarSource}
              />
            ) : (
              <View style={styles.defaultAvatar}>
                <ProfileHeaderIcon
                  color={colors.textSecondary}
                  size={56}
                  strokeWidth={1.8}
                />
              </View>
            )}
          </View>
          {isEditing ? (
            <Pressable
              accessibilityLabel="사진 업로드"
              accessibilityRole="button"
              disabled={isPickingImage}
              onPress={handlePickAvatar}
              style={[
                styles.uploadButton,
                isPickingImage ? styles.uploadButtonDisabled : null,
              ]}
            >
              <Text style={styles.uploadText}>
                {isPickingImage ? '불러오는 중' : '사진 업로드'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <AppCard style={styles.infoCard}>
          <View style={styles.editHeaderRow}>
            <Text style={styles.editHeaderTitle}>기본 정보</Text>
            {!isEditing ? (
              <IconButton
                accessibilityLabel="프로필 수정"
                onPress={startEditing}
                size={38}
                variant="outlined"
              >
                <PencilIcon />
              </IconButton>
            ) : null}
          </View>

          {editableFields.map((field) => {
            const validationMessage = getValidationMessageForField(field.id);

            return (
              <View key={field.id} style={styles.fieldBlock}>
                <View style={styles.fieldReadRow}>
                  <Text numberOfLines={1} style={styles.label}>
                    {field.label}
                  </Text>
                  {isEditing ? (
                    <View style={styles.inlineEditor}>{renderEditor(field.id)}</View>
                  ) : (
                    <Text numberOfLines={1} style={styles.value}>
                      {getDisplayedFieldValue(field.id)}
                    </Text>
                  )}
                </View>

                {isEditing && validationMessage ? (
                  <Text style={styles.errorText}>{validationMessage}</Text>
                ) : null}
              </View>
            );
          })}

          {isEditing ? (
            <View style={styles.editorActionRow}>
              <Pressable
                accessibilityLabel="수정 취소"
                accessibilityRole="button"
                disabled={isSaving}
                onPress={cancelEditing}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="프로필 저장"
                accessibilityRole="button"
                disabled={!canSave}
                onPress={saveEditing}
                style={[
                  styles.saveButton,
                  !canSave ? styles.saveButtonDisabled : null,
                ]}
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? '저장 중' : '저장'}
                </Text>
              </Pressable>
            </View>
          ) : null}

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
        <Modal
          animationType="fade"
          onRequestClose={closeBirthDateCalendar}
          transparent
          visible={isCalendarOpen}
        >
          <Pressable style={styles.calendarBackdrop} onPress={closeBirthDateCalendar}>
            <View
              onStartShouldSetResponder={() => true}
              style={styles.calendarModal}
            >
              <View style={styles.calendarModalHeader}>
                <Text style={styles.calendarModalTitle}>생년월일 선택</Text>
                <Pressable
                  accessibilityLabel="생년월일 선택 닫기"
                  accessibilityRole="button"
                  onPress={closeBirthDateCalendar}
                  style={styles.closeCalendarButton}
                >
                  <Text style={styles.closeCalendarText}>닫기</Text>
                </Pressable>
              </View>

              <View style={styles.calendarYearRow}>
                <Pressable
                  accessibilityLabel="이전 연도로 이동"
                  accessibilityRole="button"
                  onPress={() => moveCalendarYear(-1)}
                  style={styles.yearButton}
                >
                  <Text style={styles.yearButtonText}>이전 해</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="다음 연도로 이동"
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
                {profileEditWeekLabels.map((label) => (
                  <Text key={label} style={styles.weekLabel}>
                    {label}
                  </Text>
                ))}
              </View>

              <View style={styles.dayGrid}>
                {calendarCells.map((cell) => {
                  const selected = cell.value === (draftProfile?.birthDate ?? '');

                  return (
                    <Pressable
                      accessibilityLabel={cell.day ? `${cell.value} 선택` : '빈 날짜'}
                      accessibilityRole="button"
                      disabled={!cell.day}
                      key={cell.key}
                      onPress={() => selectBirthDate(cell.value)}
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
          </Pressable>
        </Modal>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </AppScreen>
    </View>
  );
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
    backgroundColor: colors.surfaceMuted,
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
  calendarBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.34)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  calendarModal: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 360,
    padding: spacing.lg,
    width: '100%',
  },
  calendarModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarModalTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  calendarTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  calendarYearRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
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
  dayCell: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: '14.285%',
  },
  dayCellSelected: {
    backgroundColor: colors.blackSurface,
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
  dateButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  dateButtonPlaceholder: {
    color: colors.textTertiary,
  },
  dateButtonText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.md,
  },
  editHeaderRow: {
    alignItems: 'center',
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingBottom: spacing.sm,
  },
  editHeaderTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  closeCalendarButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  closeCalendarText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  editorActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    marginLeft: 82 + spacing.md,
  },
  fieldBlock: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  fieldReadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 42,
  },
  fixedValueBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  fixedValueText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.md,
  },
  infoCard: {
    borderColor: colors.border,
    gap: spacing.xs,
    padding: spacing.xl,
  },
  inlineEditor: {
    flex: 1,
    minWidth: 0,
  },
  inlineInput: {
    flex: 1,
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
  label: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    width: 82,
  },
  notice: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  optionRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  defaultAvatar: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  profileArea: {
    alignItems: 'center',
    gap: spacing.md,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
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
  overlayHeader: {
    elevation: 30,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 30,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    position: 'relative',
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
    backgroundColor: colors.blackSurface,
    borderColor: colors.transparent,
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
  uploadButtonDisabled: {
    opacity: 0.55,
  },
  uploadText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.md,
  },
  value: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
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
});
