import { Button, Image, Text, XStack, YStack } from 'tamagui';

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
    <YStack
      backgroundColor={userPageColors.surface}
      borderColor={userPageColors.border}
      borderRadius={userPageRadius.card}
      borderWidth={1}
      padding={22}
      shadowColor={userPageColors.shadow}
      shadowOffset={{ width: 0, height: 12 }}
      shadowOpacity={0.14}
      shadowRadius={28}
    >
      <XStack alignItems="center" gap={18}>
        <Image
          borderRadius={42}
          height={84}
          source={{ uri: profile.avatarUrl }}
          width={84}
        />

        <YStack flex={1} gap={8}>
          <Text color={userPageColors.text} fontSize={24} fontWeight="700">
            {profile.name} 님
          </Text>

          <XStack flexWrap="wrap" gap={8}>
            {profileTags.map((tag) => (
              <ProfileChip key={tag} label={tag} />
            ))}
          </XStack>

          <Text color={userPageColors.textMuted} fontSize={15}>
            {profile.email}
          </Text>
        </YStack>

        <Button
          alignSelf="flex-start"
          backgroundColor="transparent"
          borderColor="transparent"
          circular
          height={36}
          onPress={onPressSettings}
          padding={0}
          pressStyle={{ opacity: 0.65 }}
          width={36}
        >
          <Text color={userPageColors.accentMuted} fontSize={26}>
            ⚙
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
};
