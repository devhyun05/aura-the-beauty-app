import {Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import {ChevronRight, Sparkles} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getFilterExtractionDataSync} from '../services/filterExtractionService';
import type {FilterExtractionPhoto} from '../types';

type FilterExtractionResultScreenProps = {
  headerTitle?: string;
  photo: FilterExtractionPhoto;
  onApplyFilter: () => void;
  onBack?: () => void;
  onRetake: () => void;
};

export function FilterExtractionResultScreen({
  photo,
  onApplyFilter,
  onRetake,
}: FilterExtractionResultScreenProps) {
  const {result} = getFilterExtractionDataSync();

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={styles.heroFrame}>
          <Image resizeMode="cover" source={photo.imageSource} style={styles.heroImage} />
          <View style={styles.heroGradient} />
          <YStack style={styles.heroBadge}>
            <Text style={styles.heroBadgeLabel}>SOURCE IMAGE</Text>
            <Text numberOfLines={1} style={styles.heroBadgeText}>
              {photo.title}
            </Text>
          </YStack>
        </View>

        <YStack style={styles.resultCard}>
          <XStack style={styles.eyebrowRow}>
            <Sparkles color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.eyebrowText}>EXTRACTED MAKEUP LOOK</Text>
          </XStack>

          <Text style={styles.resultTitle}>{result.title}</Text>
          <Text style={styles.resultDescription}>{result.subtitle}</Text>

          <XStack style={styles.tagList}>
            {result.tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </XStack>

          <View style={styles.divider} />

          <YStack style={styles.paletteSection}>
            <Text style={styles.sectionTitle}>추출된 컬러 밸런스</Text>
            {result.palette.map((palette) => (
              <XStack key={palette.id} style={styles.paletteRow}>
                <View style={[styles.paletteDot, {backgroundColor: palette.hex}]} />
                <YStack style={styles.paletteCopy}>
                  <Text style={styles.paletteLabel}>{palette.label}</Text>
                  <Text style={styles.paletteDescription}>{palette.description}</Text>
                </YStack>
              </XStack>
            ))}
          </YStack>

          <View style={styles.divider} />

          <YStack style={styles.accuracySection}>
            <XStack style={styles.accuracyHeader}>
              <Text style={styles.sectionTitle}>분석 정확도</Text>
              <Text style={styles.accuracyValue}>{result.accuracy}%</Text>
            </XStack>
            <View style={styles.accuracyTrack}>
              <View style={[styles.accuracyFill, {width: `${result.accuracy}%`}]} />
            </View>
          </YStack>
        </YStack>

        <YStack style={styles.pointSection}>
          <Text style={styles.sectionTitle}>필터에 반영될 포인트</Text>
          {result.points.map((point) => (
            <XStack key={point.id} style={styles.pointCard}>
              <View style={styles.pointIndex}>
                <Text style={styles.pointIndexText}>{result.points.indexOf(point) + 1}</Text>
              </View>
              <YStack style={styles.pointCopy}>
                <Text style={styles.pointTitle}>{point.title}</Text>
                <Text style={styles.pointDescription}>{point.description}</Text>
              </YStack>
            </XStack>
          ))}
        </YStack>

        <XStack style={styles.actionRow}>
          <Pressable
            accessibilityLabel="다른 사진 선택하기"
            accessibilityRole="button"
            onPress={onRetake}
            style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>다시 선택</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="AR 화면에서 필터 적용하기"
            accessibilityRole="button"
            onPress={onApplyFilter}
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>AR로 적용해보기</Text>
            <ChevronRight color={colors.white} size={iconSize.xs} strokeWidth={2.2} />
          </Pressable>
        </XStack>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  accuracyFill: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: '100%',
  },
  accuracyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  accuracySection: {
    gap: spacing.md,
  },
  accuracyTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 10,
    overflow: 'hidden',
  },
  accuracyValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  eyebrowText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0.8,
    lineHeight: typography.lineHeight.xs,
  },
  heroBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: radius.md,
    bottom: spacing.md,
    gap: 2,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.md,
  },
  heroBadgeLabel: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0.8,
    lineHeight: typography.lineHeight.xs,
  },
  heroBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  heroFrame: {
    aspectRatio: 0.94,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  paletteCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  paletteDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  paletteDot: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 24,
    width: 24,
  },
  paletteLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  paletteRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  paletteSection: {
    gap: spacing.md,
  },
  pointCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  pointCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  pointDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pointIndex: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  pointIndexText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pointSection: {
    gap: spacing.md,
  },
  pointTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    flex: 1.3,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: shadows.soft.shadowRadius,
  },
  resultDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  resultTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagPill: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tagText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
