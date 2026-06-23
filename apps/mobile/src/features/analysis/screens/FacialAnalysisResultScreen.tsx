import React from 'react';
import {Image, ScrollView, StyleSheet} from 'react-native';
import {Bookmark, ChevronLeft, Play, Share2} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {getMockFacialAnalysisResult} from '../../../shared/services/facialAnalysisResultService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {
  AnalysisAttribute,
  FacialAnalysisAvoidExample,
  FacialAnalysisResult,
  MakeupDirection,
} from '../../../shared/types/facialAnalysisResult';

type FacialAnalysisResultScreenProps = {
  result?: FacialAnalysisResult;
  onBack?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onStartARGuide?: () => void;
};

export function FacialAnalysisResultScreen({
  result = getMockFacialAnalysisResult(),
  onBack,
  onSave,
  onShare,
  onStartARGuide,
}: FacialAnalysisResultScreenProps) {
  const insets = useSafeAreaInsets();
  const primaryDirection = result.makeupDirections[0];
  const analysisHeadline = `${result.analysis.skinTone.label} · ${result.analysis.mood.label}`;
  const analysisTags = [
    result.analysis.skinTone.label,
    result.analysis.mood.label,
    result.analysis.faceBalance.label,
  ] as const;

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

        <Text numberOfLines={1} style={styles.headerTitle}>
          얼굴 분석 결과
        </Text>

        <XStack style={styles.headerActions}>
          <Button
            accessibilityLabel="얼굴 분석 결과 저장"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onSave}
            pressStyle={{scale: 0.97}}
            style={styles.iconButton}
            unstyled>
            <Bookmark color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </Button>
          <Button
            accessibilityLabel="얼굴 분석 결과 공유"
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
        <View style={styles.previewFrame}>
          <Image
            resizeMode="cover"
            source={result.previewImageSource}
            style={styles.previewImage}
          />
          <YStack style={styles.matchBadge}>
            <Text style={styles.matchValue}>{primaryDirection.matchScore}%</Text>
            <Text style={styles.matchLabel}>분석</Text>
          </YStack>
        </View>

        <YStack style={styles.resultCard}>
          <Text style={styles.cardKicker}>AI 얼굴 분석</Text>
          <Text style={styles.resultTitle}>{analysisHeadline}</Text>
          <Text style={styles.resultBody}>{result.summary}</Text>

          <XStack style={styles.tagList}>
            {analysisTags.map(tag => (
              <Text key={tag} style={styles.tagText}>
                {tag}
              </Text>
            ))}
          </XStack>

          <YStack style={styles.paletteBlock}>
            <Text style={styles.smallLabel}>어울리는 컬러 팔레트</Text>
            <XStack style={styles.swatchList}>
              {primaryDirection.keyColors.map(color => (
                <View
                  key={color}
                  accessibilityLabel={`${primaryDirection.title} 컬러`}
                  style={[styles.colorSwatch, {backgroundColor: color}]}
                />
              ))}
            </XStack>
          </YStack>

          <Button
            accessibilityLabel="맞춤 AR 필터 만들기"
            accessibilityRole="button"
            onPress={onStartARGuide}
            pressStyle={{scale: 0.98}}
            style={styles.primaryButton}
            unstyled>
            <Play color={colors.white} fill={colors.white} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.primaryButtonText}>맞춤 AR 필터 만들기</Text>
          </Button>
        </YStack>

        <YStack style={styles.section}>
          <Text style={styles.sectionTitle}>세부 분석 결과</Text>
          <YStack style={styles.summaryList}>
            <AnalysisRow title="피부 톤" attribute={result.analysis.skinTone} />
            <AnalysisRow title="분위기" attribute={result.analysis.mood} />
            <AnalysisRow title="얼굴 균형" attribute={result.analysis.faceBalance} />
          </YStack>
        </YStack>

        <YStack style={styles.section}>
          <Text style={styles.sectionTitle}>얼굴 특징 기반 포인트</Text>
          <YStack style={styles.pointCard}>
            {result.analysisPoints.map(point => (
              <PointText key={point} text={point} />
            ))}
          </YStack>
        </YStack>

        <YStack style={styles.section}>
          <XStack style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>어울리는 메이크업 방향</Text>
            <Text style={styles.sectionMeta}>{result.makeupDirections.length}개</Text>
          </XStack>
          <ScrollView
            contentContainerStyle={styles.lookList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {result.makeupDirections.map(direction => (
              <DirectionCard direction={direction} key={direction.id} />
            ))}
          </ScrollView>
        </YStack>

        <YStack style={styles.section}>
          <Text style={styles.sectionTitle}>주의할 포인트</Text>
          <YStack style={styles.pointCard}>
            {result.cautionPoints.map(point => (
              <PointText key={point} text={point} />
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

type AnalysisRowProps = {
  title: string;
  attribute: AnalysisAttribute;
};

function AnalysisRow({title, attribute}: AnalysisRowProps) {
  return (
    <XStack style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{title}</Text>
      <YStack style={styles.summaryCopy}>
        <Text style={styles.summaryTitle}>{attribute.label}</Text>
        <Text style={styles.summaryDescription}>{attribute.description}</Text>
      </YStack>
    </XStack>
  );
}

type PointTextProps = {
  text: string;
};

function PointText({text}: PointTextProps) {
  return (
    <XStack style={styles.pointRow}>
      <View style={styles.pointDot} />
      <Text style={styles.pointText}>{text}</Text>
    </XStack>
  );
}

type DirectionCardProps = {
  direction: MakeupDirection;
};

function DirectionCard({direction}: DirectionCardProps) {
  return (
    <YStack style={styles.lookCard}>
      <Image resizeMode="cover" source={direction.imageSource} style={styles.lookImage} />
      <YStack style={styles.lookCopy}>
        <Text numberOfLines={2} style={styles.lookTitle}>
          {direction.title}
        </Text>
        <Text numberOfLines={1} style={styles.lookSubtitle}>
          {direction.subtitle}
        </Text>
      </YStack>
      <XStack style={styles.lookPalette}>
        {direction.keyColors.map(color => (
          <View
            key={`${direction.id}-${color}`}
            accessibilityLabel={`${direction.title} 컬러 스와치`}
            style={[styles.lookSwatch, {backgroundColor: color}]}
          />
        ))}
      </XStack>
    </YStack>
  );
}

type AvoidCardProps = {
  example: FacialAnalysisAvoidExample;
};

function AvoidCard({example}: AvoidCardProps) {
  return (
    <YStack style={styles.avoidCard}>
      <Text style={styles.avoidTitle}>{example.title}</Text>
      <Text style={styles.avoidBody}>{example.reason}</Text>
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
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  headerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
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
    width: iconSize.xl + spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  previewFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    height: 280,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  matchBadge: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    bottom: spacing.md,
    minWidth: 74,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.md,
  },
  matchValue: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  matchLabel: {
    color: colors.borderStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: -spacing.xxl,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  cardKicker: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  resultTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
  },
  resultBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
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
  paletteBlock: {
    gap: spacing.sm,
  },
  smallLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  swatchList: {
    gap: spacing.sm,
  },
  colorSwatch: {
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    height: iconSize.xl,
    width: iconSize.xl,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 52,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  primaryButtonText: {
    color: colors.white,
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
  summaryList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    width: 58,
  },
  summaryCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  summaryTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  summaryDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  pointCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  pointRow: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pointDot: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: spacing.xs,
    marginTop: spacing.sm,
    width: spacing.xs,
  },
  pointText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  lookList: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
  lookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    paddingBottom: spacing.md,
    width: 150,
  },
  lookImage: {
    backgroundColor: colors.surfaceMuted,
    height: 162,
    width: '100%',
  },
  lookCopy: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  lookTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  lookSubtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  lookPalette: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  lookSwatch: {
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: spacing.md,
    width: spacing.md,
  },
  avoidList: {
    gap: spacing.md,
  },
  avoidCard: {
    backgroundColor: colors.surface,
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
  avoidBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
