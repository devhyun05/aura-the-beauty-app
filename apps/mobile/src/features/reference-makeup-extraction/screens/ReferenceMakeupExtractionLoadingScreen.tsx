import {useEffect} from 'react';
import {Image, Pressable, StyleSheet} from 'react-native';
import {ArrowLeft, Check, Circle, LoaderCircle, Sparkles} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getReferenceMakeupExtractionDataSync} from '../services/makeupExtractionService';
import type {ReferenceMakeupPhoto, MakeupExtractionStepStatus} from '../types';

type ReferenceMakeupExtractionLoadingScreenProps = {
  photo: ReferenceMakeupPhoto;
  onBack: () => void;
  onComplete: () => void;
};

export function ReferenceMakeupExtractionLoadingScreen({
  photo,
  onBack,
  onComplete,
}: ReferenceMakeupExtractionLoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const data = getReferenceMakeupExtractionDataSync();

  useEffect(() => {
    const timer = setTimeout(onComplete, 1600);

    return () => {
      clearTimeout(timer);
    };
  }, [onComplete]);

  return (
    <View style={styles.screen}>
      <YStack style={[styles.content, {paddingTop: insets.top + spacing.xl}]}>
        <XStack style={styles.header}>
          <Pressable accessibilityLabel="사진 선택으로 돌아가기" accessibilityRole="button" onPress={onBack}>
            <ArrowLeft color={colors.textPrimary} size={iconSize.lg} strokeWidth={2} />
          </Pressable>
        </XStack>

        <YStack style={styles.hero}>
          <View style={styles.previewFrame}>
            <Image resizeMode="cover" source={photo.imageSource} style={styles.previewImage} />
            <View style={styles.previewDim} />
            <View style={styles.sparkleBadge}>
              <Sparkles color={colors.white} size={iconSize.sm} strokeWidth={2} />
            </View>
          </View>

          <Text style={styles.title}>메이크업 분석 중...</Text>
          <Text style={styles.description}>
            이미지의 색감, 위치, 질감을 분리해서 메이크업 스타일으로 정리하고 있어요.
          </Text>
        </YStack>

        <View style={styles.progressWrap}>
          <View style={styles.progressRing}>
            <Text style={styles.progressText}>78%</Text>
          </View>
        </View>

        <YStack style={styles.stepCard}>
          {data.loadingSteps.map((step) => (
            <XStack key={step.id} style={styles.stepRow}>
              <StepStatusIcon status={step.status} />
              <Text
                style={[
                  styles.stepText,
                  step.status === 'waiting' ? styles.stepTextMuted : undefined,
                ]}>
                {step.label}
              </Text>
            </XStack>
          ))}
        </YStack>

        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            분석 시간은 약 10-20초가 소요돼요. 화면을 유지하면 결과로 자동 이동해요.
          </Text>
        </View>
      </YStack>
    </View>
  );
}

function StepStatusIcon({status}: {status: MakeupExtractionStepStatus}) {
  if (status === 'done') {
    return (
      <View style={styles.stepIconDone}>
        <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
      </View>
    );
  }

  if (status === 'active') {
    return (
      <View style={styles.stepIconActive}>
        <LoaderCircle color={colors.textPrimary} size={iconSize.xs} strokeWidth={2.2} />
      </View>
    );
  }

  return (
    <View style={styles.stepIconWaiting}>
      <Circle color={colors.textTertiary} size={iconSize.xs} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    minHeight: 36,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
  },
  noticeBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  noticeText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  previewDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  previewFrame: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 146,
    overflow: 'hidden',
    position: 'relative',
    width: 146,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  progressRing: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.textPrimary,
    borderLeftColor: colors.border,
    borderRadius: 96,
    borderTopColor: colors.border,
    borderWidth: 12,
    height: 184,
    justifyContent: 'center',
    width: 184,
  },
  progressText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    lineHeight: typography.lineHeight.xxl,
  },
  progressWrap: {
    alignItems: 'center',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sparkleBadge: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    bottom: spacing.sm,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    width: 38,
  },
  stepCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: shadows.soft.shadowRadius,
  },
  stepIconActive: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  stepIconDone: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  stepIconWaiting: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  stepTextMuted: {
    color: colors.textTertiary,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
});
