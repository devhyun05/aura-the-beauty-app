import {StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, typography} from '../theme';
import {IconButton} from './IconButton';
import {MenuStackIcon} from './LineIcons';

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
        <IconButton
          accessibilityLabel={`${title} ${actionLabel}`}
          onPress={onPressAction}
          size={34}
        >
          <MenuStackIcon color={colors.textPrimary} size={21} />
        </IconButton>
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
