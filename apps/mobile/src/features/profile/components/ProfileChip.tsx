import { StyleSheet } from 'react-native';
import { Text } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageTypography,
} from '../../../shared/theme/tokens';

interface ProfileChipProps {
  label: string;
}

export const ProfileChip = ({ label }: ProfileChipProps) => {
  return <Text style={styles.chip}>{label}</Text>;
};

const styles = StyleSheet.create({
  chip: {
    backgroundColor: userPageColors.surfaceMuted,
    borderColor: userPageColors.borderSubtle,
    borderWidth: 1,
    borderRadius: userPageRadius.chip,
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
