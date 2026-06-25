import { StyleSheet } from 'react-native';
import { Text } from 'tamagui';

import {
  profileColors,
  profileRadius,
  profileTypography,
} from '../../../shared/theme';

interface ProfileChipProps {
  label: string;
}

export const ProfileChip = ({ label }: ProfileChipProps) => {
  return <Text style={styles.chip}>{label}</Text>;
};

const styles = StyleSheet.create({
  chip: {
    backgroundColor: profileColors.surfaceMuted,
    borderColor: profileColors.borderSubtle,
    borderWidth: 1,
    borderRadius: profileRadius.chip,
    color: profileColors.textMuted,
    fontSize: profileTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
