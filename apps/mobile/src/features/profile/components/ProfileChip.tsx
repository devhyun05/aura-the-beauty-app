import { StyleSheet } from 'react-native';
import { Text } from 'tamagui';

import {
  myPageColors,
  myPageRadius,
  myPageTypography,
} from '../../../shared/theme/tokens';

interface ProfileChipProps {
  label: string;
}

export const ProfileChip = ({ label }: ProfileChipProps) => {
  return <Text style={styles.chip}>{label}</Text>;
};

const styles = StyleSheet.create({
  chip: {
    backgroundColor: myPageColors.surfaceMuted,
    borderColor: myPageColors.borderSubtle,
    borderWidth: 1,
    borderRadius: myPageRadius.chip,
    color: myPageColors.textMuted,
    fontSize: myPageTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
