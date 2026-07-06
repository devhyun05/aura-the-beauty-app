import {StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  AppCard,
  IconButton,
  ImagePlaceholder,
  PencilIcon,
  ProfileHeaderIcon,
} from '../../../shared/ui';
import type {BeautyProfile, UserProfile} from '../../../shared/types/profile';

type ProfileSummaryCardProps = {
  beautyProfile: BeautyProfile;
  profile: UserProfile;
  onPressSettings?: () => void;
};

export function ProfileSummaryCard({
  beautyProfile,
  profile,
  onPressSettings,
}: ProfileSummaryCardProps) {
  const visibleTags = (beautyProfile.tags ?? []).slice(0, 3);

  return (
    <AppCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.profileIdentity}>
          <View style={styles.avatar}>
            {profile.avatarSource ? (
              <ImagePlaceholder
                borderRadius={radius.pill}
                source={profile.avatarSource}
              />
            ) : (
              <View style={styles.defaultAvatar}>
                <ProfileHeaderIcon
                  color={colors.textSecondary}
                  size={38}
                  strokeWidth={1.7}
                />
              </View>
            )}
          </View>

          <View style={styles.info}>
            <Text numberOfLines={1} style={styles.realName}>
              {profile.name}
            </Text>
            <Text numberOfLines={1} style={styles.name}>
              {profile.nickname} 님
            </Text>
            {visibleTags.length > 0 ? (
              <View style={styles.tags}>
                {visibleTags.map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    {tag}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <IconButton
          accessibilityLabel="프로필 수정으로 이동"
          onPress={onPressSettings}
          size={38}
        >
          <PencilIcon />
        </IconButton>
      </View>

      <View style={styles.traitPanel}>
        <ProfileTrait label="퍼스널 컬러" value={beautyProfile.personalColor} />
        <View style={styles.traitDivider} />
        <ProfileTrait label="피부 타입" value={beautyProfile.skinType} />
        <View style={styles.traitDivider} />
        <ProfileTrait label="피부 톤" value={beautyProfile.skinTone} />
      </View>
    </AppCard>
  );
}

function ProfileTrait({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.trait}>
      <Text numberOfLines={1} style={styles.traitLabel}>
        {label}
      </Text>
      <Text numberOfLines={1} style={styles.traitValue}>
        {value}
      </Text>
    </View>
  );
}

const AVATAR_SIZE = 82;

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: AVATAR_SIZE,
    overflow: 'hidden',
    width: AVATAR_SIZE,
  },
  card: {
    borderRadius: radius.lg,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  defaultAvatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
  profileIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  realName: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  tag: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  trait: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  traitDivider: {
    backgroundColor: colors.divider,
    height: 30,
    width: 1,
  },
  traitLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  traitPanel: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  traitValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
});