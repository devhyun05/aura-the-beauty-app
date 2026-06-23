import { StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, radius, spacing, typography } from '../../../shared/theme';
import {
  AppCard,
  GearIcon,
  IconButton,
  ImagePlaceholder,
} from '../../../shared/ui';
import type { UserProfile } from '../../../shared/types/userPage';

type ProfileSummaryCardProps = {
  profile: UserProfile;
  onPressSettings?: () => void;
};

export function ProfileSummaryCard({
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
            {profile.tags.slice(0, 2).map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>

          <Text numberOfLines={1} style={styles.email}>
            {profile.email}
          </Text>
        </View>

        <IconButton
          accessibilityLabel="프로필 수정으로 이동"
          onPress={onPressSettings}
          size={42}
        >
          <GearIcon />
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
  email: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.md,
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
