import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {Bookmark, ChevronLeft, Play, Share2} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {getMockRecommendationResult} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {
  AnalysisAttribute,
  AvoidMakeupExample,
  MakeupLook,
  RecommendationResult,
} from '../../../shared/types/makeupGuide';

type MakeupRecommendationResultScreenProps = {
  result?: RecommendationResult;
  onBack?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onStartARGuide?: () => void;
};

export function MakeupRecommendationResultScreen({
  result = getMockRecommendationResult(),
  onBack,
  onSave,
  onShare,
  onStartARGuide,
}: MakeupRecommendationResultScreenProps) {
  const insets = useSafeAreaInsets();
  const primaryLook = result.recommendedLooks[0];

  return (
    <View style={styles.screen}>
      <XStack style={[styles.header, {paddingTop: insets.top + spacing.md}]}>
        <Button
          accessibilityLabel="분석 로딩 화면으로 돌아가기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          pressStyle={{scale: 0.97}}
          style={styles.iconButton}
          unstyled>
          <ChevronLeft color={colors.textPrimary} size={iconSize.md} strokeWidth={2} />
        </Button>

        <YStack style={styles.headerCopy}>
          <Text style={styles.eyebrow}>RECOMMENDATION</Text>
          <Text numberOfLines={1} style={styles.headerTitle}>
            추천 결과
          </Text>
        </YStack>

        <XStack style={styles.headerActions}>
          <Button
            accessibilityLabel="추천 결과 저장"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onSave}
            pressStyle={{scale: 0.97}}
            style={styles.iconButton}
            unstyled>
            <Bookmark color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </Button>
          <Button
            accessibilityLabel="추천 결과 공유"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onShare}
            pressStyle={{scale: 0.97}}
            style={styles.iconButton}
            unstyled>
            <Share2 color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </Button>
        </XStack>
      </XStack>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: insets.bottom + spacing.xxl},
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <YStack style={styles.heroCard}>
          <XStack style={styles.heroTop}>
            <View style={styles.previewFrame}>
              <View style={styles.previewFace} />
              <View style={styles.previewCheekLeft} />
              <View style={styles.previewCheekRight} />
              <View style={styles.previewLip} />
            </View>

            <YStack style={styles.heroSummary}>
              <Text style={styles.resultMeta}>{result.analyzedAtLabel}</Text>
              <Text style={styles.resultTitle}>{primaryLook.title}</Text>
              <Text style={styles.resultBody}>{result.summary}</Text>
            </YStack>
          </XStack>

          <Button
            accessibilityLabel="AR 가이드 시작하기"
            accessibilityRole="button"
            onPress={onStartARGuide}
            pressStyle={{scale: 0.98}}
            style={styles.primaryButton}
            unstyled>
            <Play color={colors.white} fill={colors.white} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.primaryButtonText}>AR 가이드 시작하기</Text>
          </Button>
        </YStack>

        <YStack style={styles.section}>
          <Text style={styles.sectionTitle}>AI 분석 요약</Text>
          <YStack style={styles.attributeList}>
            <AnalysisCard title="피부 톤" attribute={result.analysis.skinTone} />
            <AnalysisCard title="분위기" attribute={result.analysis.mood} />
            <AnalysisCard title="얼굴 균형" attribute={result.analysis.faceBalance} />
          </YStack>
        </YStack>

        <YStack style={styles.section}>
          <Text style={styles.sectionTitle}>추천 포인트</Text>
          <YStack style={styles.infoCard}>
            {result.recommendationPoints.map(point => (
              <Text key={point} style={styles.infoText}>
                {point}
              </Text>
            ))}
          </YStack>
        </YStack>

        <YStack style={styles.section}>
          <XStack style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>추천 메이크업 룩</Text>
            <Text style={styles.sectionMeta}>{result.recommendedLooks.length}개</Text>
          </XStack>

          <YStack style={styles.lookList}>
            {result.recommendedLooks.map(look => (
              <LookCard key={look.id} look={look} />
            ))}
          </YStack>
        </YStack>

        <YStack style={styles.section}>
          <Text style={styles.sectionTitle}>주의할 포인트</Text>
          <YStack style={styles.infoCard}>
            {result.cautionPoints.map(point => (
              <Text key={point} style={styles.infoText}>
                {point}
              </Text>
            ))}
          </YStack>
        </YStack>

        <YStack style={styles.section}>
          <Text style={styles.sectionTitle}>피하면 좋은 예시</Text>
          <YStack style={styles.avoidList}>
            {result.avoidExamples.map(example => (
              <AvoidCard key={example.id} example={example} />
            ))}
          </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}

type AnalysisCardProps = {
  title: string;
  attribute: AnalysisAttribute;
};

function AnalysisCard({title, attribute}: AnalysisCardProps) {
  return (
    <YStack style={styles.attributeCard}>
      <Text style={styles.cardKicker}>{title}</Text>
      <Text style={styles.cardTitle}>{attribute.label}</Text>
      <Text style={styles.cardBody}>{attribute.description}</Text>
    </YStack>
  );
}

type LookCardProps = {
  look: MakeupLook;
};

function LookCard({look}: LookCardProps) {
  return (
    <YStack style={styles.lookCard}>
      <XStack style={styles.lookTop}>
        <YStack style={styles.lookCopy}>
          <Text style={styles.lookTitle}>{look.title}</Text>
          <Text style={styles.lookSubtitle}>{look.subtitle}</Text>
        </YStack>
        <YStack style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{look.matchScore}%</Text>
          <Text style={styles.scoreLabel}>MATCH</Text>
        </YStack>
      </XStack>

      <XStack style={styles.swatchList}>
        {look.keyColors.map(color => (
          <View
            key={`${look.id}-${color}`}
            accessibilityLabel={`${look.title} 컬러 스와치`}
            style={[styles.colorSwatch, {backgroundColor: color}]}
          />
        ))}
      </XStack>

      <XStack style={styles.tagList}>
        {look.tags.map(tag => (
          <Text key={`${look.id}-${tag}`} style={styles.tagText}>
            {tag}
          </Text>
        ))}
      </XStack>
    </YStack>
  );
}

type AvoidCardProps = {
  example: AvoidMakeupExample;
};

function AvoidCard({example}: AvoidCardProps) {
  return (
    <YStack style={styles.avoidCard}>
      <Text style={styles.avoidTitle}>{example.title}</Text>
      <Text style={styles.cardBody}>{example.reason}</Text>
    </YStack>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  headerActions: {
    gap: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.xl + spacing.md,
    justifyContent: 'center',
    padding: 0,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
    width: iconSize.xl + spacing.md,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  heroCard: {
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    gap: spacing.xl,
    overflow: 'hidden',
    padding: spacing.xl,
  },
  heroTop: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  previewFrame: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    height: 172,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 128,
  },
  previewFace: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 122,
    width: 88,
  },
  previewCheekLeft: {
    backgroundColor: '#D8A09A',
    borderRadius: radius.pill,
    height: spacing.md,
    left: 34,
    opacity: 0.5,
    position: 'absolute',
    top: 94,
    width: spacing.xxl,
  },
  previewCheekRight: {
    backgroundColor: '#D8A09A',
    borderRadius: radius.pill,
    height: spacing.md,
    opacity: 0.5,
    position: 'absolute',
    right: 34,
    top: 94,
    width: spacing.xxl,
  },
  previewLip: {
    backgroundColor: '#A0645F',
    borderRadius: radius.pill,
    bottom: 50,
    height: spacing.sm,
    position: 'absolute',
    width: spacing.xxl,
  },
  heroSummary: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  resultMeta: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  resultTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
  },
  resultBody: {
    color: colors.borderStrong,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.black,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  sectionMeta: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  attributeList: {
    gap: spacing.md,
  },
  attributeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardKicker: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.1,
    lineHeight: typography.lineHeight.xs,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  cardBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  infoCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  infoText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  lookList: {
    gap: spacing.md,
  },
  lookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  lookTop: {
    alignItems: 'flex-start',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  lookCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  lookTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  lookSubtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  scoreBadge: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.md,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  scoreValue: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  scoreLabel: {
    color: colors.borderStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  swatchList: {
    gap: spacing.sm,
  },
  colorSwatch: {
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.md,
    width: iconSize.md,
  },
  tagList: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagText: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  avoidList: {
    gap: spacing.md,
  },
  avoidCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  avoidTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
});
