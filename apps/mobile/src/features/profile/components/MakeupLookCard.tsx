import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text, View } from 'tamagui';

import { colors, radius, spacing, typography } from '../../../shared/theme';
import { AppCard, ImagePlaceholder } from '../../../shared/ui';
import type { MakeupLook } from '../../../shared/types/profile';

type MakeupLookCardProps = {
  look: MakeupLook;
  style?: StyleProp<ViewStyle>;
};

export function MakeupLookCard({ look, style }: MakeupLookCardProps) {
  return (
    <AppCard padded={false} style={[styles.card, style]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder borderRadius={radius.md} source={look.imageSource} />
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
  card: {
    backgroundColor: colors.background,
    borderWidth: 0,
    elevation: 0,
    minWidth: 0,
    shadowOpacity: 0,
  },
  imageArea: {
    aspectRatio: 0.9,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  titleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
});
