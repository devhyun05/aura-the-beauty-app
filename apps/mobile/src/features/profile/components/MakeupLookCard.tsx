import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, radius, spacing, typography } from '../../../shared/theme';
import { AppCard, BookmarkIcon, ImagePlaceholder } from '../../../shared/ui';
import type { MakeupLook } from '../../../shared/types/userPage';

type MakeupLookCardProps = {
  look: MakeupLook;
  style?: StyleProp<ViewStyle>;
};

export function MakeupLookCard({ look, style }: MakeupLookCardProps) {
  return (
    <AppCard padded={false} style={[styles.card, style]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder borderRadius={radius.md} source={look.imageSource} />

        <View style={styles.bookmark}>
          <BookmarkIcon filled={look.isSaved} />
        </View>
      </View>

      <View style={styles.titleArea}>
        <Text numberOfLines={1} style={styles.title}>
          {look.title}
        </Text>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  bookmark: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
  card: {
    minWidth: 0,
    overflow: 'hidden',
  },
  imageArea: {
    aspectRatio: 0.98,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    position: 'relative',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  titleArea: {
    alignItems: 'center',
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.xs,
  },
});
