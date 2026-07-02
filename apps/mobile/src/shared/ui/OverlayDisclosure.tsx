import {useState, type ReactNode} from 'react';
import {StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {Button, Text, YStack} from 'tamagui';

import {colors, spacing, typography} from '../theme';

type OverlayDisclosureSectionProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function OverlayDisclosureSection({
  accessibilityLabel,
  children,
  defaultExpanded = false,
  label,
  style,
}: OverlayDisclosureSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <YStack style={[styles.container, style]}>
      <Button
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        accessibilityState={{expanded: isExpanded}}
        onPress={() => setIsExpanded(previous => !previous)}
        pressStyle={{opacity: 0.7}}
        style={styles.header}
        unstyled>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.chevron}>{isExpanded ? '▴' : '▾'}</Text>
      </Button>

      {isExpanded ? <YStack style={styles.body}>{children}</YStack> : null}
    </YStack>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  label: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  body: {
    gap: spacing.lg,
  },
});
