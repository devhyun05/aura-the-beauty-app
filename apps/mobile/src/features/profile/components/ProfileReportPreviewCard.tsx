import type {StyleProp, ViewStyle} from 'react-native';
import {Pressable, StyleSheet} from 'react-native';
import {ImageOff, UserRound} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {ImagePlaceholder} from '../../../shared/ui';
import type {ProfileReportPreview} from '../services/profileReportHub';

type ProfileReportPreviewCardProps = {
  description: string;
  label: string;
  onPress?: () => void;
  preview: ProfileReportPreview | null;
  style?: StyleProp<ViewStyle>;
};

export function ProfileReportPreviewCard({
  description,
  label,
  onPress,
  preview,
  style,
}: ProfileReportPreviewCardProps) {
  const hasPreviewImage = Boolean(preview?.imageSource);
  const previewAccessibilityHint = '해당 종류의 보고서 목록으로 이동해요.';
  const previewAccessibilityLabel = `${label} 전체 목록 열기`;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        <Text numberOfLines={1} style={styles.description}>
          {description}
        </Text>
      </View>

      <Pressable
        accessibilityHint={previewAccessibilityHint}
        accessibilityLabel={previewAccessibilityLabel}
        accessibilityRole="button"
        disabled={!onPress}
        onPress={onPress}
        style={({pressed}) => [styles.preview, pressed && styles.pressed]}>
        <View style={styles.imageStack}>
          {preview?.hasMore ? (
            <>
              <View style={[styles.backImageFrame, styles.backImageFrameSecond]} />
              <View style={[styles.backImageFrame, styles.backImageFrameFirst]} />
            </>
          ) : null}
          <View
            style={[
              styles.imageFrame,
              preview?.hasMore ? styles.imageFrameStacked : null,
            ]}>
            <ImagePlaceholder borderRadius={radius.md} source={preview?.imageSource} />
            {!hasPreviewImage ? (
              <View style={styles.emptyIcon}>
                {preview ? (
                  <ImageOff
                    color={colors.textSecondary}
                    size={iconSize.lg}
                    strokeWidth={1.5}
                  />
                ) : (
                  <UserRound
                    color={colors.textSecondary}
                    size={iconSize.lg}
                    strokeWidth={1.5}
                  />
                )}
                <Text numberOfLines={2} style={styles.emptyLabel}>
                  {preview?.statusLabel ?? '저장된 보고서 없음'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  backImageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  backImageFrameFirst: {
    left: 6,
    right: 6,
  },
  backImageFrameSecond: {
    left: 12,
    right: 0,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 14,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    bottom: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    left: 0,
    padding: spacing.sm,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  emptyLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 14,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
    minHeight: 36,
  },
  imageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  imageFrameStacked: {
    marginRight: 12,
    width: 'auto',
  },
  imageStack: {
    alignSelf: 'center',
    aspectRatio: 0.82,
    position: 'relative',
    width: '100%',
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  preview: {
    gap: spacing.sm,
  },
});
