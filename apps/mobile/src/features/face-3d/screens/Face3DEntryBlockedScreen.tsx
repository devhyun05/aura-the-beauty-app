import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, radius, spacing, typography} from '../../../shared/theme';

type Face3DEntryBlockedScreenProps = {
  message: string;
  onOpenVerticalThirds: () => void;
  onRetake: () => void;
};

export function Face3DEntryBlockedScreen({
  message,
  onOpenVerticalThirds,
  onRetake,
}: Face3DEntryBlockedScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        {
          paddingBottom: insets.bottom + spacing.xl,
          paddingTop: insets.top + spacing.xl,
        },
      ]}>
      <StatusBar style="dark" />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>AURA FACIAL LAB</Text>
        <Text style={styles.title}>3D 측정을 시작할 수 없습니다</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.detail}>
          갤러리나 Expo 카메라 사진은 기존 2D 세로비율 분석에는 사용할 수 있지만, ARKit 얼굴 메시 측정의 카메라 인계 근거로 사용하지 않습니다.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onRetake} style={styles.primaryButton}>
          <Text style={styles.primaryButtonLabel}>네이티브 카메라로 다시 촬영</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenVerticalThirds}
          style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>이 사진으로 2D 결과 보기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  detail: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  message: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    padding: spacing.lg,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.xl,
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    lineHeight: typography.lineHeight.xxl,
  },
});
