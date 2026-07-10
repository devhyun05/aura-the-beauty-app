import {Pressable, StyleSheet} from 'react-native';
import {Camera, Images, ScanFace, Scissors} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

type HairAnalysisIntroScreenProps = {
  onOpenSaved: () => void;
  onStart: () => void;
};

const steps = [
  {icon: Camera, title: '정면 사진 촬영', description: '얼굴 전체와 어깨가 보이도록 밝은 곳에서 촬영해요.'},
  {icon: ScanFace, title: '헤어 상태 분석', description: '얼굴형과 길이, 앞머리, 질감, 볼륨을 함께 확인해요.'},
  {icon: Scissors, title: '추천 스타일 합성', description: '추천 3개 중 선택한 스타일만 자연스럽게 합성해요.'},
] as const;

export function HairAnalysisIntroScreen({onOpenSaved, onStart}: HairAnalysisIntroScreenProps) {
  return (
    <AppScreen bottomPadding="safeArea" contentGap={spacing.xxl} topPadding="belowShellHeader">
      <YStack style={styles.hero}>
        <View style={styles.heroIcon}>
          <Scissors color={colors.white} size={iconSize.xl} strokeWidth={1.9} />
        </View>
        <YStack style={styles.heroCopy}>
          <Text style={styles.eyebrow}>HAIR ANALYSIS</Text>
          <Text style={styles.title}>나에게 어울리는 헤어를{`\n`}사진으로 먼저 만나보세요</Text>
          <Text style={styles.description}>
            현재 머리색은 유지하고, 숏컷부터 롱 레이어까지 얼굴 비율에 맞춰 추천해요.
          </Text>
        </YStack>
      </YStack>

      <YStack style={styles.steps}>
        {steps.map(step => {
          const Icon = step.icon;
          return (
            <XStack key={step.title} style={styles.stepRow}>
              <View style={styles.stepIcon}>
                <Icon color={colors.textPrimary} size={iconSize.md} strokeWidth={1.9} />
              </View>
              <YStack style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </YStack>
            </XStack>
          );
        })}
      </YStack>

      <YStack style={styles.notice}>
        <Text style={styles.noticeTitle}>사진 처리 안내</Text>
        <Text style={styles.noticeText}>
          선택한 사진은 AI 분석과 합성을 위해 외부 AI 처리 서비스로 전송돼요. AURA가
          보관하는 원본과 임시 결과는 24시간 후 삭제되며, 계정 저장을 선택한 결과만 보관돼요.
        </Text>
      </YStack>

      <View style={styles.spacer} />
      <XStack style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onOpenSaved} style={styles.savedButton}>
          <Images color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          <Text style={styles.savedButtonText}>저장한 헤어</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onStart} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>헤어 분석 시작</Text>
        </Pressable>
      </XStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: {gap: spacing.sm},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  eyebrow: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  hero: {backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, gap: spacing.xl, padding: spacing.xl},
  heroCopy: {gap: spacing.sm},
  heroIcon: {alignItems: 'center', backgroundColor: colors.blackSurface, borderRadius: radius.pill, height: 64, justifyContent: 'center', width: 64},
  notice: {borderLeftColor: colors.textPrimary, borderLeftWidth: 2, gap: spacing.xs, paddingLeft: spacing.md},
  noticeText: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  noticeTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  primaryButton: {alignItems: 'center', backgroundColor: colors.blackSurface, borderRadius: radius.pill, flex: 1, justifyContent: 'center', minHeight: 56, paddingHorizontal: spacing.lg},
  primaryButtonText: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  savedButton: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 56, paddingHorizontal: spacing.lg},
  savedButtonText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  spacer: {flex: 1},
  stepCopy: {flex: 1, gap: spacing.xs, minWidth: 0},
  stepDescription: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  stepIcon: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 46, justifyContent: 'center', width: 46},
  stepRow: {alignItems: 'center', gap: spacing.md},
  stepTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  steps: {gap: spacing.lg},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
});
