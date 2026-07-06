import {StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, typography} from '../theme';
import {SectionMoreButton} from './SectionMoreButton';

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onPressAction?: () => void;
};

export function SectionHeader({
  title,
  actionLabel,
  onPressAction,
}: SectionHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>

      {actionLabel ? (
        <SectionMoreButton
          accessibilityLabel={`${title} ${actionLabel}`}
          label={actionLabel}
          onPress={onPressAction}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 30,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.lg,
  },
});
