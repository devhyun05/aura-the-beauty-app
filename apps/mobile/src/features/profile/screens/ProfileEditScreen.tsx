import {useEffect, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {
  getProfileEditFields,
  getUserProfile,
} from '../../../shared/services/userService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {ProfileEditField, UserProfile} from '../../../shared/types/userPage';
import {AppCard, AppHeader, AppScreen, ImagePlaceholder} from '../../../shared/ui';
import {ProfileEditRow} from '../components/ProfileEditRow';

type ProfileEditScreenProps = {
  onBack?: () => void;
};

export function ProfileEditScreen({onBack}: ProfileEditScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fields, setFields] = useState<ProfileEditField[]>([]);
  const [notice, setNotice] = useState('');

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

  return (
    <AppScreen contentGap={spacing.xl}>
      <AppHeader onBack={onBack} title="프로필 수정" />

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
          onPress={() => setNotice('사진 업로드는 프론트 UI만 준비되어 있어요.')}
          style={styles.uploadButton}
        >
          <Text style={styles.uploadText}>사진 업로드</Text>
        </Pressable>
      </View>

      <AppCard style={styles.infoCard}>
        {fields.map((field) => (
          <ProfileEditRow field={field} key={field.id} />
        ))}

        <View style={styles.actionRow}>
          <Pressable
            accessibilityLabel="로그아웃"
            accessibilityRole="button"
            onPress={() => setNotice('로그아웃 요청이 준비됐어요.')}
            style={styles.textButton}
          >
            <Text style={styles.actionText}>로그아웃</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="회원 탈퇴"
            accessibilityRole="button"
            style={styles.textButton}
          >
            <Text style={styles.actionText}>회원 탈퇴</Text>
          </Pressable>
        </View>
      </AppCard>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </AppScreen>
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
    borderRadius: 62,
    height: 124,
    overflow: 'hidden',
    width: 124,
  },
  infoCard: {
    borderColor: colors.border,
    gap: spacing.xs,
    padding: spacing.xl,
  },
  notice: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  profileArea: {
    alignItems: 'center',
    gap: spacing.md,
  },
  textButton: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
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
});
