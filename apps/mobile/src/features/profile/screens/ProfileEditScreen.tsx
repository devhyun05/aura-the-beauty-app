import {useEffect, useMemo, useRef, useState} from 'react';
import * as ImagePicker from 'expo-image-picker';
import {CalendarDays} from 'lucide-react-native';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
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
  IconButton,
  ImagePlaceholder,
  PencilIcon,
  ProfileHeaderIcon,
} from '../../../shared/ui';
import {profileGenderOptions} from '../constants/profileEditOptions';
import {
  createBirthDateDayOptions,
  createBirthDateMonthOptions,
  createBirthDateYearOptions,
  formatDateValue,
  getProfileEditValidationMessage,
  getProfileFieldValue,
  isEditableProfileFieldId,
  parseDateValue,
  profileBirthDateMinimumYear,
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

const PROFILE_AVATAR_IMAGE_QUALITY = 0.78;
const BIRTH_DATE_WHEEL_ITEM_HEIGHT = 44;
const BIRTH_DATE_WHEEL_VISIBLE_ITEM_COUNT = 5;
const BIRTH_DATE_WHEEL_VERTICAL_PADDING =
  (BIRTH_DATE_WHEEL_ITEM_HEIGHT * (BIRTH_DATE_WHEEL_VISIBLE_ITEM_COUNT - 1)) /
  2;

export const PROFILE_BIRTH_DATE_PICKER_MODE = 'wheel';

type BirthDateWheelColumnProps = {
  accessibilityLabel: string;
  onChange: (value: number) => void;
  options: readonly number[];
  suffix: string;
  value: number;
};

function BirthDateWheelColumn({
  accessibilityLabel,
  onChange,
  options,
  suffix,
  value,
}: BirthDateWheelColumnProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  const scrollToValue = (nextValue: number, animated: boolean) => {
    const nextIndex = options.indexOf(nextValue);

    if (nextIndex >= 0) {
      scrollViewRef.current?.scrollTo({
        animated,
        y: nextIndex * BIRTH_DATE_WHEEL_ITEM_HEIGHT,
      });
    }
  };

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      scrollToValue(value, false);
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [options, value]);

  const selectNearestValue = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.max(
      0,
      Math.min(
        options.length - 1,
        Math.round(
          event.nativeEvent.contentOffset.y / BIRTH_DATE_WHEEL_ITEM_HEIGHT,
        ),
      ),
    );
    const nextValue = options[nextIndex];

    if (nextValue !== undefined) {
      if (nextValue !== value) {
        onChange(nextValue);
      }

      const nextOffset = nextIndex * BIRTH_DATE_WHEEL_ITEM_HEIGHT;

      if (Math.abs(event.nativeEvent.contentOffset.y - nextOffset) > 0.5) {
        scrollViewRef.current?.scrollTo({animated: true, y: nextOffset});
      }
    }
  };

  const selectAfterDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const verticalVelocity = Math.abs(event.nativeEvent.velocity?.y ?? 0);

    if (verticalVelocity < 0.05) {
      selectNearestValue(event);
    }
  };

  return (
    <ScrollView
      accessibilityLabel={accessibilityLabel}
      bounces={false}
      contentContainerStyle={styles.birthDateWheelColumnContent}
      decelerationRate="fast"
      disableIntervalMomentum
      nestedScrollEnabled
      onMomentumScrollEnd={selectNearestValue}
      onScrollEndDrag={selectAfterDrag}
      ref={scrollViewRef}
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={BIRTH_DATE_WHEEL_ITEM_HEIGHT}
      style={styles.birthDateWheelColumn}
    >
      {options.map((option) => {
        const selected = option === value;

        return (
          <Pressable
            accessibilityLabel={`${option}${suffix}`}
            accessibilityRole="button"
            accessibilityState={{selected}}
            key={option}
            onPress={() => {
              onChange(option);
              scrollToValue(option, true);
            }}
            style={styles.birthDateWheelItem}
          >
            <Text
              style={[
                styles.birthDateWheelItemText,
                selected ? styles.birthDateWheelItemTextSelected : null,
              ]}
            >
              {option}
              {suffix}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

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
  const safeAreaInsets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fields, setFields] = useState<ProfileEditField[]>([]);
  const [notice, setNotice] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draftProfile, setDraftProfile] = useState<UserProfile | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const today = useMemo(() => new Date(), []);
  const maximumBirthYear = today.getFullYear();
  const [isBirthDatePickerOpen, setIsBirthDatePickerOpen] = useState(false);
  const [birthDatePickerYear, setBirthDatePickerYear] =
    useState(maximumBirthYear);
  const [birthDatePickerMonth, setBirthDatePickerMonth] = useState(
    today.getMonth() + 1,
  );
  const [birthDatePickerDay, setBirthDatePickerDay] = useState(today.getDate());
  const birthDateYearOptions = useMemo(
    () => createBirthDateYearOptions(maximumBirthYear),
    [maximumBirthYear],
  );
  const birthDateMonthOptions = useMemo(
    () => createBirthDateMonthOptions(birthDatePickerYear, today),
    [birthDatePickerYear, today],
  );
  const birthDateDayOptions = useMemo(
    () =>
      createBirthDateDayOptions(
        birthDatePickerYear,
        birthDatePickerMonth,
        today,
      ),
    [birthDatePickerMonth, birthDatePickerYear, today],
  );

  useEffect(() => {
    if (!birthDateMonthOptions.includes(birthDatePickerMonth)) {
      setBirthDatePickerMonth(birthDateMonthOptions.at(-1) ?? 1);
    }
  }, [birthDateMonthOptions, birthDatePickerMonth]);

  useEffect(() => {
    if (!birthDateDayOptions.includes(birthDatePickerDay)) {
      setBirthDatePickerDay(birthDateDayOptions.at(-1) ?? 1);
    }
  }, [birthDateDayOptions, birthDatePickerDay]);

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
    setIsEditing(true);
    setNotice('');
  };

  const cancelEditing = () => {
    setDraftProfile(null);
    setIsEditing(false);
    setIsBirthDatePickerOpen(false);
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
    setIsBirthDatePickerOpen(false);

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
        quality: PROFILE_AVATAR_IMAGE_QUALITY,
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


  const openBirthDatePicker = () => {
    if (!draftProfile) {
      return;
    }

    const parsedBirthDate = parseDateValue(draftProfile.birthDate);
    const nextYear = Math.max(
      profileBirthDateMinimumYear,
      Math.min(maximumBirthYear, parsedBirthDate.getFullYear()),
    );
    const nextMonthOptions = createBirthDateMonthOptions(nextYear, today);
    const nextMonth = Math.min(
      parsedBirthDate.getMonth() + 1,
      nextMonthOptions.at(-1) ?? 1,
    );
    const nextDayOptions = createBirthDateDayOptions(
      nextYear,
      nextMonth,
      today,
    );
    const nextDay = Math.min(
      parsedBirthDate.getDate(),
      nextDayOptions.at(-1) ?? 1,
    );

    setBirthDatePickerYear(nextYear);
    setBirthDatePickerMonth(nextMonth);
    setBirthDatePickerDay(nextDay);
    setIsBirthDatePickerOpen(true);
  };

  const closeBirthDatePicker = () => {
    setIsBirthDatePickerOpen(false);
  };

  const confirmBirthDatePicker = () => {
    updateDraftField(
      'birthDate',
      formatDateValue(
        new Date(
          birthDatePickerYear,
          birthDatePickerMonth - 1,
          birthDatePickerDay,
        ),
      ),
    );
    closeBirthDatePicker();
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
          onPress={openBirthDatePicker}
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
          </View>
        </AppCard>
        <Modal
          animationType="slide"
          onRequestClose={closeBirthDatePicker}
          transparent
          visible={isBirthDatePickerOpen}
        >
          <View style={styles.birthDatePickerBackdrop}>
            <Pressable
              accessibilityLabel="생년월일 선택 취소"
              accessibilityRole="button"
              onPress={closeBirthDatePicker}
              style={styles.birthDatePickerBackdropDismiss}
            />
            <View
              style={[
                styles.birthDatePickerSheet,
                {
                  paddingBottom: Math.max(
                    spacing.xxl,
                    safeAreaInsets.bottom + spacing.sm,
                  ),
                },
              ]}
            >
              <View style={styles.birthDatePickerHeader}>
                <Pressable
                  accessibilityLabel="생년월일 선택 취소"
                  accessibilityRole="button"
                  onPress={closeBirthDatePicker}
                  style={styles.birthDatePickerHeaderAction}
                >
                  <Text style={styles.birthDatePickerCancelText}>취소</Text>
                </Pressable>
                <Text style={styles.birthDatePickerTitle}>생년월일 선택</Text>
                <Pressable
                  accessibilityLabel="생년월일 선택 완료"
                  accessibilityRole="button"
                  onPress={confirmBirthDatePicker}
                  style={styles.birthDatePickerHeaderAction}
                >
                  <Text style={styles.birthDatePickerConfirmText}>완료</Text>
                </Pressable>
              </View>

              <Text
                accessibilityLiveRegion="polite"
                style={styles.birthDatePickerSelectionText}
              >
                {birthDatePickerYear}년 {birthDatePickerMonth}월{' '}
                {birthDatePickerDay}일
              </Text>

              <View style={styles.birthDateWheel}>
                <View
                  pointerEvents="none"
                  style={styles.birthDateWheelSelectionIndicator}
                />
                <BirthDateWheelColumn
                  accessibilityLabel="태어난 연도 선택"
                  onChange={setBirthDatePickerYear}
                  options={birthDateYearOptions}
                  suffix="년"
                  value={birthDatePickerYear}
                />
                <BirthDateWheelColumn
                  accessibilityLabel="태어난 월 선택"
                  onChange={setBirthDatePickerMonth}
                  options={birthDateMonthOptions}
                  suffix="월"
                  value={birthDatePickerMonth}
                />
                <BirthDateWheelColumn
                  accessibilityLabel="태어난 일 선택"
                  onChange={setBirthDatePickerDay}
                  options={birthDateDayOptions}
                  suffix="일"
                  value={birthDatePickerDay}
                />
              </View>

              <Text style={styles.birthDatePickerGuide}>
                각 항목을 위아래로 스크롤해 선택해 주세요.
              </Text>
            </View>
          </View>
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
    justifyContent: 'flex-start',
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
  birthDatePickerBackdrop: {
    backgroundColor: 'rgba(17, 17, 17, 0.34)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  birthDatePickerBackdropDismiss: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  birthDatePickerCancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  birthDatePickerConfirmText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  birthDatePickerGuide: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  birthDatePickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  birthDatePickerHeaderAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 52,
  },
  birthDatePickerSelectionText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  birthDatePickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
    width: '100%',
  },
  birthDatePickerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  birthDateWheel: {
    height: BIRTH_DATE_WHEEL_ITEM_HEIGHT * BIRTH_DATE_WHEEL_VISIBLE_ITEM_COUNT,
    flexDirection: 'row',
    gap: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  birthDateWheelColumn: {
    flex: 1,
    zIndex: 1,
  },
  birthDateWheelColumnContent: {
    paddingVertical: BIRTH_DATE_WHEEL_VERTICAL_PADDING,
  },
  birthDateWheelItem: {
    alignItems: 'center',
    height: BIRTH_DATE_WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
  },
  birthDateWheelItemText: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.md,
  },
  birthDateWheelItemTextSelected: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  birthDateWheelSelectionIndicator: {
    backgroundColor: colors.surfaceMuted,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderRadius: radius.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: BIRTH_DATE_WHEEL_ITEM_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    top: BIRTH_DATE_WHEEL_VERTICAL_PADDING,
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
});
