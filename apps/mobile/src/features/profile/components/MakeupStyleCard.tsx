import { Image, Stack, Text, YStack } from 'tamagui';

import { userPageColors, userPageRadius } from '../../../shared/theme/tokens';
import type { MakeupStylePreview } from '../../../shared/types/userPage';

interface MakeupStyleCardProps {
  style: MakeupStylePreview;
}

export const MakeupStyleCard = ({ style }: MakeupStyleCardProps) => {
  return (
    <YStack alignItems="center" gap={10} width={104}>
      <Stack borderRadius={userPageRadius.image} height={150} overflow="hidden" width={104}>
        <Image height="100%" source={{ uri: style.imageUrl }} width="100%" />

        {style.isSaved ? (
          <Stack
            alignItems="center"
            backgroundColor={userPageColors.surface}
            borderRadius={10}
            height={20}
            justifyContent="center"
            position="absolute"
            right={8}
            top={8}
            width={20}
          >
            <Text color={userPageColors.accent} fontSize={13} fontWeight="700">
              ⌑
            </Text>
          </Stack>
        ) : null}
      </Stack>

      <Text color={userPageColors.textMuted} fontSize={12} textAlign="center">
        {style.title}
      </Text>
    </YStack>
  );
};
