import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { userPageColors, userPageRadius } from '../../../shared/theme/tokens';
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
    borderColor: userPageColors.border,
    borderRadius: 46,
    borderWidth: 1,
    height: 92,
    width: 92,
  },
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    elevation: 2,
    padding: 22,
    shadowColor: userPageColors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  email: {
    alignSelf: 'stretch',
    color: userPageColors.textMuted,
    fontSize: 15,
    lineHeight: 20,
  },
  name: {
    color: userPageColors.text,
    fontSize: 24,
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
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
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
    gap: 8,
    width: '100%',
  },
});
