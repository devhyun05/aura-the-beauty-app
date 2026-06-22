import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { UserProfile } from '../../../shared/types/userPage';
import { ProfileChip } from './ProfileChip';

interface ProfileSummaryCardProps {
  profile: UserProfile;
  onPressSettings?: () => void;
}

export const ProfileSummaryCard = ({
  profile,
  onPressSettings,
}: ProfileSummaryCardProps) => {
  const profileTags = [profile.personalColor, profile.skinType, profile.skinTone];

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <Image
          resizeMode="cover"
          source={profile.avatarSource}
          style={styles.avatar}
        />

        <View style={styles.profileInfo}>
          <Text style={styles.name}>{profile.name} 님</Text>

          <View style={styles.tags}>
            {profileTags.map((tag) => (
              <ProfileChip key={tag} label={tag} />
            ))}
          </View>

          <Text numberOfLines={1} style={styles.email}>
            {profile.email}
          </Text>
        </View>

        <Pressable
          accessibilityLabel="프로필 설정"
          accessibilityRole="button"
          onPress={onPressSettings}
          style={styles.settingsButton}
        >
          <SettingsIcon />
        </Pressable>
      </View>
    </View>
  );
};

function SettingsIcon() {
  return (
    <View pointerEvents="none" style={styles.settingsIcon}>
      <View style={styles.settingsDot} />
      <View style={styles.settingsDot} />
      <View style={styles.settingsDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderColor: userPageColors.borderSubtle,
    borderRadius: 38,
    borderWidth: 1,
    height: 76,
    width: 76,
  },
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.card,
    borderWidth: 1,
    elevation: 1,
    padding: 18,
    shadowColor: userPageColors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  email: {
    alignSelf: 'stretch',
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 19,
  },
  name: {
    color: userPageColors.text,
    fontSize: userPageTypography.title,
    fontWeight: '700',
  },
  profileInfo: {
    alignItems: 'flex-start',
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  settingsButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: userPageColors.borderSubtle,
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  settingsDot: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  settingsIcon: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
  },
});
