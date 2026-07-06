import {ArrowRight} from 'lucide-react-native';
import {Pressable, StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {Text} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../theme';

export const SECTION_MORE_BUTTON_ICON_NAME = 'ArrowRight' as const;

type SectionMoreButtonProps = {
  accessibilityLabel?: string;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function SectionMoreButton({
  accessibilityLabel,
  label,
  onPress,
  style,
}: SectionMoreButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      hitSlop={spacing.xs}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        style,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <ArrowRight color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  label: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.78,
  },
});
