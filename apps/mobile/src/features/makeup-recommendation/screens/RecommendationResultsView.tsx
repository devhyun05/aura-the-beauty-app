import {useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppCard, AppScreen} from '../../../shared/ui';
import type {
  MakeupArea,
  MakeupLookRecommendation,
  MakeupRecommendationRefinement,
} from '../types';
import {makeupRecommendationFallbackCopy, makeupRecommendationImageStatusCopy, makeupRecommendationResultRoleLabels, toggleExpandedLookId} from './makeupRecommendationViewContracts';
export {makeupRecommendationResultRoleLabels, toggleExpandedLookId} from './makeupRecommendationViewContracts';

const difficultyLabels: Record<MakeupLookRecommendation['difficulty'], string> = {
  easy: '쉬움',
  medium: '보통',
  advanced: '정교함',
};

const areaLabels: Record<MakeupArea, string> = {
  base: '베이스',
  brow: '브로우',
  eye: '아이',
  cheek: '치크',
  lip: '립',
};

const refinementActions: readonly {label: string; value: MakeupRecommendationRefinement}[] = [
  {label: '더 자연스럽게', value: 'natural'},
  {label: '더 힙하게', value: 'hip'},
  {label: '다른 색으로', value: 'differentColor'},
  {label: '제품만 바꾸기', value: 'replaceProducts'},
];
type RecommendationResultsViewProps = {
  onApplyAR: (look: MakeupLookRecommendation) => void;
  onRefine: (refinement: MakeupRecommendationRefinement) => void;
  onReset: () => void;
  onRetry: () => void;
  onRetryRefinement: () => void;
  refinementError?: string;
  results: readonly MakeupLookRecommendation[];
  imageStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  imageRetryError?: string;
  generationMode?: 'backend' | 'localFallback';
  isRefining: boolean;
  onRetryImages: () => void;
};

function ResultCard({
  look,
  onApplyAR,
  expanded,
  onToggleExpanded,
  onToggleSave,
  saved,
}: {
  look: MakeupLookRecommendation;
  onApplyAR: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleSave: () => void;
  saved: boolean;
}) {
  return (
    <AppCard padded={false} style={styles.resultCard}>
      <Image resizeMode="cover" source={look.imageSource} style={styles.lookImage} />
      <View style={styles.cardBody}>
        <View style={styles.roleRow}>
          <Text style={styles.roleLabel}>{makeupRecommendationResultRoleLabels[look.role]}</Text>
          <Pressable
            accessibilityLabel={`${look.title} ${saved ? '저장 해제' : '저장'}`}
            accessibilityRole="button"
            accessibilityState={{selected: saved}}
            onPress={onToggleSave}
            style={styles.saveButton}
          >
            <Text style={styles.saveLabel}>{saved ? '저장됨' : '저장'}</Text>
          </Pressable>
        </View>
        <View style={styles.lookHeading}>
          <Text style={styles.lookTitle}>{look.title}</Text>
          <Text style={styles.lookSummary}>{look.summary}</Text>
          <Text style={styles.meta}>{look.durationMinutes}분 · {difficultyLabels[look.difficulty]}</Text>
        </View>

        {look.appliedConditions.length > 0 ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailTitle}>반영된 조건</Text>
            <View style={styles.conditionList}>
              {look.appliedConditions.slice(0, 3).map(condition => (
                <View key={condition} style={styles.conditionChip}>
                  <Text style={styles.conditionLabel}>{condition}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {expanded ? (
          <>
            <View style={styles.reasonList}>
              {look.reasons.map(reason => <Text key={reason} style={styles.reason}>• {reason}</Text>)}
            </View>
            <View style={styles.detailSection}>
              <Text style={styles.detailTitle}>이렇게 완성해요</Text>
              {[...look.steps].sort((a, b) => a.order - b.order).map(step => (
                <View key={`${step.order}-${step.area}`} style={styles.detailRow}>
                  <Text style={styles.areaLabel}>{step.order}. {areaLabels[step.area]}</Text>
                  <Text style={styles.detailCopy}>{step.instruction}</Text>
                </View>
              ))}
            </View>
            <View style={styles.detailSection}>
              <Text style={styles.detailTitle}>함께 쓰면 좋은 제품</Text>
              {look.products.map(product => (
                <View key={product.id} style={styles.productRow}>
                  <Text style={styles.areaLabel}>{areaLabels[product.area]}</Text>
                  <View style={styles.productCopy}>
                    <Text style={styles.productName}>{product.brandName} {product.productName}</Text>
                    <Text style={styles.detailCopy}>{[product.shadeName, product.reason].filter(Boolean).join(' · ')}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.cardActions}>
          <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={onToggleExpanded} style={styles.detailButton}>
            <Text style={styles.detailButtonLabel}>{expanded ? '접기' : '자세히 보기'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onApplyAR} style={styles.arButton}>
            <Text style={styles.arButtonLabel}>AR로 적용하기</Text>
          </Pressable>
        </View>
      </View>
    </AppCard>
  );
}

export function RecommendationResultsView({
  onApplyAR,
  onRefine,
  onReset,
  onRetry,
  onRetryRefinement,
  refinementError,
  results,
  imageStatus,
  imageRetryError,
  generationMode,
  isRefining,
  onRetryImages,
}: RecommendationResultsViewProps) {
  const [savedLookIds, setSavedLookIds] = useState<Set<string>>(() => new Set());
  const [expandedLookIds, setExpandedLookIds] = useState<Set<string>>(() => new Set());

  if (results.length === 0) {
    return (
      <AppScreen contentGap={spacing.lg} topPadding="belowShellHeader">
        <Text style={styles.emptyTitle}>추천 결과를 준비하지 못했어요</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.arButton}>
          <Text style={styles.arButtonLabel}>다시 시도하기</Text>
        </Pressable>
      </AppScreen>
    );
  }

  const toggleSaved = (lookId: string) => {
    setSavedLookIds(previous => {
      const next = new Set(previous);
      if (next.has(lookId)) next.delete(lookId);
      else next.add(lookId);
      return next;
    });
  };

  return (
    <AppScreen contentGap={spacing.xxl} topPadding="belowShellHeader">
      <View style={styles.resultsHeading}>
        <Text style={styles.eyebrow}>세 가지 방향으로 풀어봤어요</Text>
        <Text style={styles.resultsTitle}>오늘의 얼굴에 어울릴 메이크업</Text>
        <Text style={styles.resultsDescription}>안정적인 선택부터 예상 밖의 발견까지 비교해보세요.</Text>
        {generationMode === 'localFallback' ? (
          <View accessibilityRole="alert" style={styles.fallbackNotice}>
            <Text style={styles.imageStatus}>{makeupRecommendationFallbackCopy.description}</Text>
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.imageRetryButton}>
              <Text style={styles.imageRetryLabel}>{makeupRecommendationFallbackCopy.retryAction}</Text>
            </Pressable>
          </View>
        ) : null}
        {imageStatus === 'pending' || imageStatus === 'processing' ? (
          <Text style={styles.imageStatus}>세 가지 추천 이미지를 만들고 있어요. 완성되면 자동으로 바뀌어요.</Text>
        ) : imageStatus === 'failed' ? (
          <View style={styles.imageFailureRow}>
            <Text style={styles.imageStatus}>이미지는 준비하지 못했지만 추천 내용은 그대로 볼 수 있어요.</Text>
            <Pressable accessibilityRole="button" onPress={onRetryImages} style={styles.imageRetryButton}>
              <Text style={styles.imageRetryLabel}>{makeupRecommendationImageStatusCopy.failedAction}</Text>
            </Pressable>
            {imageRetryError ? <Text accessibilityRole="alert" style={styles.imageStatus}>{imageRetryError}</Text> : null}
          </View>
        ) : null}
      </View>

      {results.map(look => (
        <ResultCard
          key={look.id}
          expanded={expandedLookIds.has(look.id)}
          look={look}
          onApplyAR={() => onApplyAR(look)}
          onToggleSave={() => toggleSaved(look.id)}
          onToggleExpanded={() => setExpandedLookIds(previous => toggleExpandedLookId(previous, look.id))}
          saved={savedLookIds.has(look.id)}
        />
      ))}

      <View style={styles.refinementSection}>
        <Text style={styles.detailTitle}>조금 다르게 보고 싶다면</Text>
        <View style={styles.refinementActions}>
          {refinementActions.map(action => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{disabled: isRefining}}
              disabled={isRefining}
              key={action.value}
              onPress={() => onRefine(action.value)}
              style={styles.refinementButton}
            >
              <Text style={styles.refinementLabel}>{isRefining ? '조정 중…' : action.label}</Text>
            </Pressable>
          ))}
        </View>
        {refinementError ? (
          <View accessibilityRole="alert" style={styles.refinementError}>
            <Text style={styles.refinementErrorCopy}>{refinementError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onRetryRefinement}
              style={styles.refinementRetryButton}
            >
              <Text style={styles.refinementRetryLabel}>다시 조정하기</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetButton}>
        <Text style={styles.resetLabel}>다른 이야기로 다시 찾기</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  resultsHeading: {gap: spacing.sm},
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 1,
  },
  resultsTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  resultsDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  imageStatus: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  imageFailureRow: {alignItems: 'flex-start', gap: spacing.xs},
  fallbackNotice: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  imageRetryButton: {justifyContent: 'center', minHeight: 44},
  imageRetryLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
  },
  resultCard: {overflow: 'hidden'},
  lookImage: {backgroundColor: colors.surfaceMuted, height: 230, width: '100%'},
  cardBody: {gap: spacing.lg, padding: spacing.lg},
  roleRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  roleLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0.4,
  },
  saveButton: {justifyContent: 'center', minHeight: 48, paddingLeft: spacing.lg},
  saveLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  lookHeading: {gap: spacing.xs},
  lookTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  lookSummary: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  meta: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  reasonList: {gap: spacing.xs},
  reason: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  conditionList: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  conditionChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  conditionLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
  },
  detailSection: {gap: spacing.md},
  detailTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
  },
  detailRow: {gap: spacing.xs},
  areaLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    minWidth: 58,
  },
  detailCopy: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productRow: {flexDirection: 'row', gap: spacing.sm},
  productCopy: {flex: 1, gap: spacing.xs},
  productName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },
  arButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  arButtonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  cardActions: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm},
  detailButton: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md},
  detailButtonLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  refinementSection: {gap: spacing.md},
  refinementActions: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  refinementError: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  refinementErrorCopy: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  refinementRetryButton: {alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48},
  refinementRetryLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  refinementButton: {
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  refinementLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  resetButton: {alignItems: 'center', justifyContent: 'center', minHeight: 48},
  resetLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
  },
});
