import { Text } from 'tamagui';

import { userPageColors, userPageRadius } from '../../../shared/theme/tokens';

interface ProfileChipProps {
  label: string;
}

export const ProfileChip = ({ label }: ProfileChipProps) => {
  return (
    <Text
      backgroundColor={userPageColors.accentSoft}
      borderRadius={userPageRadius.chip}
      color={userPageColors.accent}
      fontSize={12}
      fontWeight="600"
      paddingHorizontal={12}
      paddingVertical={6}
    >
      {label}
    </Text>
  );
};
