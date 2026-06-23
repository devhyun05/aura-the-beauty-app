import {Pressable, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, spacing, typography} from '../../../shared/theme';
import type {ProfileEditField} from '../../../shared/types/userPage';
import {PencilIcon} from '../../../shared/ui';

type ProfileEditRowProps = {
  field: ProfileEditField;
  isEditing?: boolean;
  onPressEdit?: () => void;
};

export function ProfileEditRow({
  field,
  isEditing = false,
  onPressEdit,
}: ProfileEditRowProps) {
  return (
    <Pressable
      accessibilityLabel={`${field.label} 수정`}
      accessibilityRole="button"
      disabled={!field.editable || !onPressEdit}
      onPress={onPressEdit}
      style={[styles.row, isEditing ? styles.rowEditing : null]}
    >
      <Text numberOfLines={1} style={styles.label}>
        {field.label}
      </Text>
      <Text numberOfLines={1} style={styles.value}>
        {field.value}
      </Text>
      <View style={styles.iconSlot}>
        {field.editable ? <PencilIcon /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    width: 82,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 54,
  },
  rowEditing: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  value: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
});