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

        <Pressable onPress={onPressSettings} style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 46,
    height: 92,
    width: 92,
  },
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.card,
    borderWidth: 1,
    elevation: 3,
    padding: 22,
    shadowColor: userPageColors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
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
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  settingsIcon: {
    color: userPageColors.accentMuted,
    fontSize: 26,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
});
