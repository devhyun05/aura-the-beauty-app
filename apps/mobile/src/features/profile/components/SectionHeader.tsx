import { Button, Text, XStack } from 'tamagui';

import { userPageColors, userPageTypography } from '../../../shared/theme/tokens';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onPressAction?: () => void;
}

export const SectionHeader = ({
  title,
  actionLabel,
  onPressAction,
}: SectionHeaderProps) => {
  return (
    <XStack alignItems="center" justifyContent="space-between">
      <Text
        color={userPageColors.text}
        fontSize={userPageTypography.sectionTitle}
        fontWeight="700"
      >
        {title}
      </Text>

      {actionLabel ? (
        <Button
          alignItems="center"
          backgroundColor="transparent"
          borderWidth={0}
          flexDirection="row"
          gap={8}
          height={32}
          onPress={onPressAction}
          paddingHorizontal={0}
          pressStyle={{ opacity: 0.65 }}
        >
          <Text color={userPageColors.textSoft} fontSize={12}>
            {actionLabel}
          </Text>
          <Text color={userPageColors.accentMuted} fontSize={28} lineHeight={28}>
            &gt;
          </Text>
        </Button>
      ) : null}
    </XStack>
  );
};
