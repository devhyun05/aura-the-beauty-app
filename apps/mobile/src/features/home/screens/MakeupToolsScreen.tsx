import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {Camera, ChevronRight, ImagePlus, Sparkles} from 'lucide-react-native';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

type MakeupToolsScreenProps = {
  onPressAlbumPick?: () => void;
  onPressCameraCapture?: () => void;
};

const makeupToolActions = [
  {
    id: 'camera',
    title: '카메라로 촬영',
    description: '지금 얼굴 또는 메이크업 상태를 촬영해서 바로 분석해요.',
    accessibilityLabel: '카메라로 촬영 시작',
    icon: (color: string) => <Camera color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
  {
    id: 'album',
    title: '앨범에서 선택',
    description: '저장된 사진을 골라 메이크업 컬러와 포인트를 가져와요.',
    accessibilityLabel: '앨범에서 사진 선택',
    icon: (color: string) => <ImagePlus color={color} size={iconSize.lg} strokeWidth={1.9} />,
  },
] as const;

export function MakeupToolsScreen({
  onPressAlbumPick,
  onPressCameraCapture,
}: MakeupToolsScreenProps) {
  return (
    <AppScreen bottomPadding={128} contentGap={spacing.xxl} topPadding="belowShellHeader">
      <YStack style={styles.hero}>
        <View style={styles.heroIcon}>
          <Sparkles color={colors.white} size={iconSize.lg} strokeWidth={2} />
        </View>
        <YStack style={styles.heroCopy}>
          <Text style={styles.eyebrow}>MAKEUP TOOLS</Text>
          <Text style={styles.title}>메이크업 분석</Text>
          <Text style={styles.description}>
            사진 한 장으로 메이크업 추출과 피드백을 이어서 확인해요.
          </Text>
        </YStack>
      </YStack>

      <YStack style={styles.actionList}>
        {makeupToolActions.map(action => {
          const onPress =
            action.id === 'camera'
              ? onPressCameraCapture
              : onPressAlbumPick;

          return (
            <Pressable
              accessibilityLabel={action.accessibilityLabel}
              accessibilityRole="button"
              key={action.id}
              onPress={onPress}
              style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}>
              <View style={styles.actionIcon}>
                {action.icon(colors.textPrimary)}
              </View>
              <YStack style={styles.actionCopy}>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
              </YStack>
              <ChevronRight color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.2} />
            </Pressable>
          );
        })}
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  actionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  actionList: {
    gap: spacing.md,
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  eyebrow: {
    color: colors.successMuted,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  hero: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  pressed: {
    opacity: 0.76,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xxl,
  },
});
