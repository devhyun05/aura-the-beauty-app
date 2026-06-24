import { Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { myPageColors, myPageTypography } from '../../../shared/theme/tokens';

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
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>

      {actionLabel ? (
        <Pressable onPress={onPressAction} style={styles.action}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
          <ChevronRightIcon />
        </Pressable>
      ) : null}
    </View>
  );
};

function ChevronRightIcon() {
  return (
    <View pointerEvents="none" style={styles.chevronIcon}>
      <View style={[styles.chevronLine, styles.chevronLineTop]} />
      <View style={[styles.chevronLine, styles.chevronLineBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderColor: myPageColors.borderSubtle,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  actionLabel: {
    color: myPageColors.textMuted,
    fontSize: myPageTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  chevronIcon: {
    height: 18,
    position: 'relative',
    width: 14,
  },
  chevronLine: {
    backgroundColor: myPageColors.accentMuted,
    borderRadius: 2,
    height: 2,
    position: 'absolute',
    right: 1,
    width: 8,
  },
  chevronLineBottom: {
    top: 10,
    transform: [{ rotate: '-45deg' }],
  },
  chevronLineTop: {
    top: 5,
    transform: [{ rotate: '45deg' }],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  title: {
    color: myPageColors.text,
    fontSize: myPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
});
