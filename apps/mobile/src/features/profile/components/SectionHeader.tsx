import { Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

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
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>

      {actionLabel ? (
        <Pressable onPress={onPressAction} style={styles.action}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
          <Text style={styles.chevron}>&gt;</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 32,
  },
  actionLabel: {
    color: userPageColors.textSoft,
    fontSize: 12,
  },
  chevron: {
    color: userPageColors.accentMuted,
    fontSize: 28,
    lineHeight: 28,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
  },
});
