import type {StyleProp, ViewStyle} from 'react-native';
import {Pressable, StyleSheet} from 'react-native';
import {UserRound} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {ImagePlaceholder} from '../../../shared/ui';
import type {ProfileReportPreview} from '../services/profileReportHub';

type ProfileReportPreviewCardProps = {
  description: string;
  label: string;
  onPressLatest?: () => void;
  preview: ProfileReportPreview | null;
  style?: StyleProp<ViewStyle>;
};

export function ProfileReportPreviewCard({
  description,
  label,
  onPressLatest,
  preview,
  style,
}: ProfileReportPreviewCardProps) {
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
        accessibilityLabel={
          preview ? `${label} 최신 보고서 ${preview.title} 열기` : `${label} 보고서 없음`
        }
        accessibilityRole={preview ? 'button' : undefined}
        disabled={!preview}
        onPress={onPressLatest}
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
            {!preview ? (
              <View style={styles.emptyIcon}>
                <UserRound
                  color={colors.textSecondary}
                  size={iconSize.lg}
                  strokeWidth={1.5}
                />
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
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
