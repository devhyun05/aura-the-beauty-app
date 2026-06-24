import { Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { iconSize } from '../../../shared/theme';
import { myPageColors, myPageTypography } from '../../../shared/theme/tokens';
import { ChevronRightIcon } from '../../../shared/ui/LineIcons';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onPressAction?: () => void;
}

export const PROFILE_SECTION_HEADER_ACTION_ICON_NAME = 'ChevronRight';

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
          <ChevronRightIcon color={myPageColors.accentMuted} size={iconSize.xs} />
        </Pressable>
      ) : null}
    </View>
  );
};

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
