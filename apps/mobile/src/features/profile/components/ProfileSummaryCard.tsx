import { StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, radius, spacing, typography } from '../../../shared/theme';
import {
  AppCard,
  PencilIcon,
  IconButton,
  ImagePlaceholder,
} from '../../../shared/ui';
import type { BeautyProfile, UserProfile } from '../../../shared/types/profile';

type ProfileSummaryCardProps = {
  profile: UserProfile;
  beautyProfile: BeautyProfile;
  onPressSettings?: () => void;
};

export function ProfileSummaryCard({
  beautyProfile,
  profile,
  onPressSettings,
}: ProfileSummaryCardProps) {
  return (
    <AppCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <ImagePlaceholder
            borderRadius={radius.pill}
            source={profile.avatarSource}
          />
        </View>

        <View style={styles.info}>
          <Text numberOfLines={1} style={styles.name}>
            {profile.name} 님
          </Text>

          <View style={styles.tags}>
            {beautyProfile.tags.slice(0, 2).map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
        </View>

        <IconButton
          accessibilityLabel="프로필 수정으로 이동"
          onPress={onPressSettings}
          size={42}
        >
          <PencilIcon />
        </IconButton>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 52,
    height: 96,
    overflow: 'hidden',
    width: 96,
  },
  card: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  info: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  tag: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
