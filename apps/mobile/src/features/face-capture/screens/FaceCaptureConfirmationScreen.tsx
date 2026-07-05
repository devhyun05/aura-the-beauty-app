import {Image, Pressable, StyleSheet} from 'react-native';
import {Check, RotateCcw} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

type FaceCaptureConfirmationScreenProps = {
  confirmLabel: string;
  description: string;
  onConfirm: () => void;
  onRetake: () => void;
  photoUri?: string | null;
  retakeLabel: string;
  title: string;
};

export function FaceCaptureConfirmationScreen({
  confirmLabel,
  description,
  onConfirm,
  onRetake,
  photoUri,
  retakeLabel,
  title,
}: FaceCaptureConfirmationScreenProps) {
  const hasPhoto = Boolean(photoUri);

  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <YStack style={styles.screen}>
        <YStack style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </YStack>

        <View style={styles.previewFrame}>
          {photoUri ? (
            <Image resizeMode="cover" source={{uri: photoUri}} style={styles.previewImage} />
          ) : (
            <YStack style={styles.emptyPreview}>
              <Text style={styles.emptyTitle}>사진을 불러오지 못했어요</Text>
              <Text style={styles.emptyDescription}>다시 촬영하거나 사진을 다시 선택해 주세요.</Text>
            </YStack>
          )}
        </View>

        <XStack style={styles.actions}>
          <Pressable
            accessibilityLabel={retakeLabel}
            accessibilityRole="button"
            onPress={onRetake}
            style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
            <RotateCcw color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.1} />
            <Text style={styles.secondaryButtonText}>{retakeLabel}</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={confirmLabel}
            accessibilityRole="button"
            accessibilityState={{disabled: !hasPhoto}}
            disabled={!hasPhoto}
            onPress={onConfirm}
            style={({pressed}) => [
              styles.primaryButton,
              !hasPhoto && styles.primaryButtonDisabled,
              pressed && hasPhoto && styles.pressed,
            ]}>
            <Check color={colors.white} size={iconSize.sm} strokeWidth={2.2} />
            <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
          </Pressable>
        </XStack>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyPreview: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  headerCopy: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  previewFrame: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    margin: spacing.lg,
    overflow: 'hidden',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {height: 8, width: 0},
    shadowOpacity: 0.1,
    shadowRadius: shadows.soft.shadowRadius,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  pressed: {
    opacity: 0.72,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonDisabled: {
    opacity: 0.42,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    paddingBottom: spacing.md,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
});
