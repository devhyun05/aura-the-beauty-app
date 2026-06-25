import {Pressable, StyleSheet} from 'react-native';
import {BookOpenCheck, Check} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {getFilterExtractionDataSync} from '../services/filterExtractionService';

type FilterRecipeSaveCompleteScreenProps = {
  onBackToDetail: () => void;
  onGoToProfile: () => void;
};

export function FilterRecipeSaveCompleteScreen({onBackToDetail, onGoToProfile}: FilterRecipeSaveCompleteScreenProps) {
  const insets = useSafeAreaInsets();
  const {result} = getFilterExtractionDataSync();

  return (
    <View style={styles.screen}>
      <YStack style={[styles.content, {paddingTop: insets.top + 112}]}>
        <View style={styles.iconCircle}>
          <BookOpenCheck color={colors.white} size={44} strokeWidth={2.1} />
        </View>

        <YStack style={styles.copy}>
          <Text style={styles.title}>메이크업 레시피가 저장되었어요!</Text>
          <Text style={styles.description}>
            `{result.title}`의 컬러, 위치, 질감 분석을 레시피로 저장했습니다.
          </Text>
        </YStack>

        <YStack style={styles.summaryBox}>
          <View style={styles.checkBadge}>
            <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
          </View>
          <Text style={styles.summaryText}>
            눈, 립, 치크, 베이스 단계별 적용 순서를 다시 볼 수 있어요.
          </Text>
        </YStack>
      </YStack>

      <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.lg}]}>
        <Pressable
          accessibilityLabel="마이페이지로 이동"
          accessibilityRole="button"
          onPress={onGoToProfile}
          style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>마이페이지로 이동</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="상세 분석 다시 보기"
          accessibilityRole="button"
          onPress={onBackToDetail}
          style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>상세 분석 다시 보기</Text>
        </Pressable>
      </YStack>
    </View>
  );
}

const styles = StyleSheet.create({
  checkBadge: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
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
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 118,
    justifyContent: 'center',
    width: 118,
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
  summaryBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    width: '100%',
  },
  summaryText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
});
