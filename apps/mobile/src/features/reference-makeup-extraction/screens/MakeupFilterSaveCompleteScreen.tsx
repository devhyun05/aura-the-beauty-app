import {Pressable, StyleSheet} from 'react-native';
import {Check, Sparkles} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {getReferenceMakeupExtractionDataSync} from '../services/makeupExtractionService';

type MakeupFilterSaveCompleteScreenProps = {
  onApplyNow: () => void;
  onGoToProfile: () => void;
};

export function MakeupFilterSaveCompleteScreen({onApplyNow, onGoToProfile}: MakeupFilterSaveCompleteScreenProps) {
  const insets = useSafeAreaInsets();
  const {extractedMakeupLook} = getReferenceMakeupExtractionDataSync();

  return (
    <View style={styles.screen}>
      <YStack style={[styles.content, {paddingTop: insets.top + 112}]}>
        <View style={styles.checkCircle}>
          <Check color={colors.white} size={44} strokeWidth={2.4} />
        </View>

        <YStack style={styles.copy}>
          <Text style={styles.title}>메이크업 룩이 저장되었어요!</Text>
          <Text style={styles.description}>
            `{extractedMakeupLook.title}`이 내 메이크업 룩에 저장되었습니다.
          </Text>
        </YStack>

        <YStack style={styles.sparkleRow}>
          <Sparkles color={colors.textTertiary} size={iconSize.sm} strokeWidth={1.8} />
          <Text style={styles.helperText}>
            마이페이지의 메이크업 룩에서 다시 확인할 수 있어요.
          </Text>
        </YStack>
      </YStack>

      <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.lg}]}>
        <Pressable
          accessibilityLabel="저장된 메이크업 룩 지금 적용하기"
          accessibilityRole="button"
          onPress={onApplyNow}
          style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>지금 적용해보기</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="마이페이지로 이동"
          accessibilityRole="button"
          onPress={onGoToProfile}
          style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>마이페이지로 이동</Text>
        </Pressable>
      </YStack>
    </View>
  );
}

const styles = StyleSheet.create({
  checkCircle: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 118,
    justifyContent: 'center',
    width: 118,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.md,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  footer: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  helperText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  sparkleRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    width: '100%',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
});
