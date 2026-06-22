import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'tamagui';

import { getUserProfile } from '../../../shared/services/userPageService';
import {
  userPageColors,
  userPageRadius,
  userPageSpacing,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { UserProfile } from '../../../shared/types/userPage';

interface ProfileEditScreenProps {
  onBack?: () => void;
}

type EditableProfile = Pick<
  UserProfile,
  'name' | 'nickname' | 'phone' | 'email' | 'birthDate' | 'gender' | 'interest'
>;

const fieldLabels: Record<keyof EditableProfile, string> = {
  name: '이름',
  nickname: '닉네임',
  phone: '전화번호',
  email: '이메일',
  birthDate: '생년월일',
  gender: '성별',
  interest: '관심사',
};

export const ProfileEditScreen = ({ onBack }: ProfileEditScreenProps) => {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<EditableProfile | null>(null);
  const [logoutMessage, setLogoutMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    getUserProfile().then((userProfile) => {
      if (isMounted) {
        setProfile(userProfile);
        setForm({
          name: userProfile.name,
          nickname: userProfile.nickname,
          phone: userProfile.phone,
          email: userProfile.email,
          birthDate: userProfile.birthDate,
          gender: userProfile.gender,
          interest: userProfile.interest,
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const fields = useMemo(() => {
    if (!form) {
      return [];
    }

    return (Object.keys(fieldLabels) as Array<keyof EditableProfile>).map(
      (key) => ({
        key,
        label: fieldLabels[key],
        value: form[key],
      }),
    );
  }, [form]);

  const handleChange = (key: keyof EditableProfile, value: string) => {
    setForm((currentForm) =>
      currentForm
        ? {
            ...currentForm,
            [key]: value,
          }
        : currentForm,
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable
          accessibilityLabel="프로필 수정에서 뒤로가기"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <BackIcon />
        </Pressable>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.eyebrow}>PROFILE</Text>
          <Text style={styles.title}>프로필 수정</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {profile && form ? (
          <>
            <View style={styles.photoSection}>
              <Image
                resizeMode="cover"
                source={profile.avatarSource}
                style={styles.avatar}
              />

              <Pressable
                accessibilityLabel="프로필 사진 업로드 mock"
                accessibilityRole="button"
                style={styles.uploadButton}
              >
                <Text style={styles.uploadText}>사진 업로드</Text>
              </Pressable>
            </View>

            <View style={styles.formPanel}>
              {fields.map((field) => (
                <View key={field.key} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    accessibilityLabel={`${field.label} 수정`}
                    onChangeText={(value) => handleChange(field.key, value)}
                    style={styles.input}
                    value={field.value}
                  />
                  <View pointerEvents="none" style={styles.pencilButton}>
                    <PencilIcon />
                  </View>
                </View>
              ))}
            </View>

            {logoutMessage ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{logoutMessage}</Text>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                accessibilityLabel="로그아웃 mock"
                accessibilityRole="button"
                onPress={() =>
                  setLogoutMessage('로그아웃 mock 동작이 실행됐어요.')
                }
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabel}>로그아웃</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="회원 탈퇴"
                accessibilityRole="button"
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabelMuted}>회원 탈퇴</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>프로필을 불러오는 중이에요</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

function BackIcon() {
  return (
    <View pointerEvents="none" style={styles.backIcon}>
      <View style={[styles.backLine, styles.backLineTop]} />
      <View style={[styles.backLine, styles.backLineBottom]} />
    </View>
  );
}

function PencilIcon() {
  return (
    <View pointerEvents="none" style={styles.pencilIcon}>
      <View style={styles.pencilBody} />
      <View style={styles.pencilTip} />
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  avatar: {
    backgroundColor: userPageColors.surfaceMuted,
    borderColor: userPageColors.borderSubtle,
    borderRadius: 58,
    borderWidth: 1,
    height: 116,
    width: 116,
  },
  backButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  backIcon: {
    height: 22,
    position: 'relative',
    width: 22,
  },
  backLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    left: 4,
    position: 'absolute',
    width: 14,
  },
  backLineBottom: {
    top: 13,
    transform: [{ rotate: '45deg' }],
  },
  backLineTop: {
    top: 5,
    transform: [{ rotate: '-45deg' }],
  },
  emptyState: {
    alignItems: 'center',
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.card,
    borderWidth: 1,
    padding: 28,
  },
  emptyTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  eyebrow: {
    color: userPageColors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  fieldLabel: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '600',
    lineHeight: 20,
    width: 74,
  },
  fieldRow: {
    alignItems: 'center',
    borderBottomColor: userPageColors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
  },
  formPanel: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.card,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  header: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    borderBottomColor: userPageColors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: userPageSpacing.screenX,
  },
  headerTitleGroup: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    marginRight: 38,
    minWidth: 0,
  },
  input: {
    color: userPageColors.text,
    flex: 1,
    fontSize: userPageTypography.body,
    lineHeight: 20,
    minWidth: 0,
    paddingVertical: 0,
  },
  notice: {
    backgroundColor: userPageColors.surfaceMuted,
    borderRadius: userPageRadius.image,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  noticeText: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },
  pencilBody: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 18,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: 4,
  },
  pencilButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  pencilIcon: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    position: 'relative',
    width: 24,
  },
  pencilTip: {
    backgroundColor: userPageColors.text,
    height: 6,
    position: 'absolute',
    right: 6,
    top: 5,
    transform: [{ rotate: '45deg' }],
    width: 6,
  },
  photoSection: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 10,
  },
  screen: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  scrollContent: {
    gap: 22,
    paddingBottom: 52,
    paddingHorizontal: userPageSpacing.screenX,
    paddingTop: 22,
  },
  scrollView: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  textButton: {
    minHeight: 40,
    justifyContent: 'center',
  },
  textButtonLabel: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  textButtonLabelMuted: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
  uploadButton: {
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.chip,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  uploadText: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
});
