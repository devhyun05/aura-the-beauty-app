// Previous makeup result layout, preserved behind MAKEUP_RESULT_REDESIGN_ENABLED.
// Static hero image + context chips + area-guide carousel + AR button.
import {useMemo, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {RecommendationContextSummary} from '../components/RecommendationContextSummary';
import {RecommendedAreaGuideSection} from '../components/RecommendedAreaGuideSection';
import {adaptLegacyLookToV2} from '../services/makeupRecommendationMappers';
import type {RecommendedMakeupAreaGuide} from '../types';
import {makeupRecommendationImageStatusCopy} from './makeupRecommendationViewContracts';
import type {RecommendationResultsViewProps} from './RecommendationResultsView';

export function RecommendationResultsViewLegacy({
  context,
  onApplyAR,
  onAreaOpened,
  onRetry,
  results,
  imageStatus,
  imageRetryError,
  onRetryImages,
}: RecommendationResultsViewProps) {
  const normalizedResults = useMemo(() => results.map(adaptLegacyLookToV2), [results]);
  const [selectedArea, setSelectedArea] = useState<RecommendedMakeupAreaGuide['area']>('base');
  const selectedLook = normalizedResults.find(look => look.role === 'anchor') ?? normalizedResults[0];
  const guides = selectedLook?.areaGuides ?? [];
  const selectedGuide = guides.find(guide => guide.area === selectedArea) ?? guides[0];

  if (!selectedLook) {
    return (
      <AppScreen contentGap={spacing.lg} topPadding="belowShellHeader">
        <Text style={styles.emptyTitle}>추천 결과를 준비하지 못했어요</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>다시 시도하기</Text>
        </Pressable>
      </AppScreen>
    );
  }

  const selectedImageStatus = selectedLook.imageStatus ?? imageStatus;
  return (
    <AppScreen contentGap={spacing.xl} topPadding="belowShellHeader">
      <View style={styles.heroCard}>
        <Image
          accessibilityLabel={`${selectedLook.title} AI 생성 메이크업 이미지`}
          resizeMode="cover"
          source={selectedLook.imageSource}
          style={styles.heroImage}
        />
        {selectedImageStatus === 'pending' || selectedImageStatus === 'processing' ? (
          <Text accessibilityRole="alert" style={styles.imageStatus}>추천 메이크업 이미지를 만들고 있어요.</Text>
        ) : selectedImageStatus === 'failed' || selectedImageStatus === 'partial' ? (
          <View style={styles.imageFailure}>
            <Text accessibilityRole="alert" style={styles.imageStatus}>
              {selectedImageStatus === 'partial'
                ? makeupRecommendationImageStatusCopy.partial
                : '추천 메이크업 이미지를 준비하지 못했어요.'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => onRetryImages(selectedLook.id)} style={styles.inlineButton}>
              <Text style={styles.inlineButtonLabel}>{makeupRecommendationImageStatusCopy.failedAction}</Text>
            </Pressable>
            {imageRetryError ? <Text accessibilityRole="alert" style={styles.imageStatus}>{imageRetryError}</Text> : null}
          </View>
        ) : null}
      </View>

      <RecommendationContextSummary
        keywordLabel={context?.keywordLabel}
        profileGender={context?.profileGender}
        reportLabel={context?.reportLabel}
        situationLabel={context?.situationLabel}
      />

      {selectedGuide ? (
        <View style={styles.areaSection}>
          <Text style={styles.sectionTitle}>부위별 메이크업</Text>
          <RecommendedAreaGuideSection
            guide={selectedGuide}
            guides={guides}
            onSelectArea={area => {
              setSelectedArea(area);
              onAreaOpened(area, selectedLook);
            }}
          />
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => onApplyAR(selectedLook)} style={styles.primaryButton}>
        <Text style={styles.primaryLabel}>AR 적용하기</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  heroImage: {backgroundColor: colors.surfaceMuted, height: 420, width: '100%'},
  imageStatus: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  imageFailure: {alignItems: 'flex-start', gap: spacing.xs, padding: spacing.md},
  inlineButton: {alignSelf: 'flex-start', justifyContent: 'center', minHeight: 40},
  inlineButtonLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  areaSection: {gap: spacing.md},
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  emptyTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl},
});
