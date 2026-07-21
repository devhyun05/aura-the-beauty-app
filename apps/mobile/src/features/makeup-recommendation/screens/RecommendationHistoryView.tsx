import {ActivityIndicator, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {ImageOff} from 'lucide-react-native';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppCard, AppScreen, ReportOverflowMenuButton} from '../../../shared/ui';
import {formatReportCreatedAtLabel} from '../../../shared/utils/reportDate';
import type {MakeupRecommendationReportHistoryItem} from '../types';
import {getMakeupRecommendationPreviewPresentation} from '../services/makeupRecommendationPreview';
import {makeupRecommendationHistoryCopy} from './makeupRecommendationViewContracts';

type RecommendationHistoryViewProps = {
  canLoadMore: boolean;
  error?: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  items: readonly MakeupRecommendationReportHistoryItem[];
  onBack: () => void;
  onDelete: (item: MakeupRecommendationReportHistoryItem) => Promise<void> | void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onSelect: (item: MakeupRecommendationReportHistoryItem) => void;
};

export function RecommendationHistoryView({
  canLoadMore,
  error,
  isLoading,
  isLoadingMore,
  items,
  onBack,
  onDelete,
  onLoadMore,
  onRefresh,
  onSelect,
}: RecommendationHistoryViewProps) {
  return (
    <AppScreen contentGap={spacing.xl} topPadding="belowShellHeader">
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backLabel}>추천 찾기</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{disabled: isLoading}}
          disabled={isLoading}
          onPress={onRefresh}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshLabel}>{isLoading ? '불러오는 중…' : '새로고침'}</Text>
        </Pressable>
      </View>

      <View style={styles.heading}>
        <Text style={styles.title}>{makeupRecommendationHistoryCopy.title}</Text>
        <Text style={styles.description}>{makeupRecommendationHistoryCopy.description}</Text>
      </View>

      {isLoading && items.length === 0 ? (
        <View accessibilityLabel="지난 추천 불러오는 중" style={styles.centerState}>
          <ActivityIndicator color={colors.textPrimary} size="small" />
        </View>
      ) : error && items.length === 0 ? (
        <View accessibilityRole="alert" style={styles.stateCard}>
          <Text style={styles.stateTitle}>{makeupRecommendationHistoryCopy.error}</Text>
          <Text style={styles.stateDescription}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.retryButton}>
            <Text style={styles.retryLabel}>다시 불러오기</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{makeupRecommendationHistoryCopy.empty}</Text>
          <Text style={styles.stateDescription}>새 추천을 받으면 이곳에서 언제든 다시 볼 수 있어요.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
          {items.map(item => {
            const preview = getMakeupRecommendationPreviewPresentation(item);
            const createdAtLabel = formatReportCreatedAtLabel(item.createdAt);
            return (
              <AppCard
                accessibilityLabel={`${item.scenarioText} 저장된 추천, ${createdAtLabel}, 열기`}
                key={item.reportId}
                onPress={() => onSelect(item)}
                padded={false}
                style={styles.reportCard}
              >
                {preview.imageUrl ? (
                  <Image
                    accessibilityLabel={`${item.scenarioText} 적용 메이크업 미리보기`}
                    resizeMode="cover"
                    source={{uri: preview.imageUrl}}
                    style={styles.previewImage}
                  />
                ) : (
                  <View
                    accessibilityLabel={preview.statusLabel}
                    accessibilityRole="image"
                    style={styles.previewPlaceholder}>
                    <ImageOff
                      color={colors.textTertiary}
                      size={iconSize.lg}
                      strokeWidth={1.5}
                    />
                    <Text style={styles.previewStatus}>{preview.statusLabel}</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardMeta}>{createdAtLabel}</Text>
                    <View style={styles.cardMetaActions}>
                      <Text style={styles.cardMeta}>{item.results.length}가지 메이크업</Text>
                      <ReportOverflowMenuButton onDelete={() => onDelete(item)} />
                    </View>
                  </View>
                  <Text style={styles.scenario}>{item.scenarioText}</Text>
                  <Text style={styles.lookNames} numberOfLines={2}>
                    {item.results.map(look => look.title).join(' · ')}
                  </Text>
                </View>
              </AppCard>
            );
          })}
          {canLoadMore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{disabled: isLoadingMore}}
              disabled={isLoadingMore}
              onPress={onLoadMore}
              style={styles.loadMoreButton}
            >
              {isLoadingMore ? <ActivityIndicator color={colors.textPrimary} size="small" /> : null}
              <Text style={styles.loadMoreLabel}>{isLoadingMore ? '더 불러오는 중…' : '지난 추천 더보기'}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  backButton: {justifyContent: 'center', minHeight: 44, paddingRight: spacing.lg},
  backLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  refreshButton: {justifyContent: 'center', minHeight: 44, paddingLeft: spacing.lg},
  refreshLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  heading: {gap: spacing.sm},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xxl, lineHeight: typography.lineHeight.xxl},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  centerState: {alignItems: 'center', justifyContent: 'center', minHeight: 180},
  stateCard: {backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, gap: spacing.sm, padding: spacing.xl},
  stateTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg},
  stateDescription: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  retryButton: {alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44},
  retryLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  list: {gap: spacing.lg},
  inlineError: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs},
  reportCard: {overflow: 'hidden'},
  previewImage: {backgroundColor: colors.surfaceMuted, height: 160, width: '100%'},
  previewPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    gap: spacing.sm,
    height: 160,
    justifyContent: 'center',
    padding: spacing.lg,
    width: '100%',
  },
  previewStatus: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
  cardBody: {gap: spacing.sm, padding: spacing.lg},
  cardMetaRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  cardMetaActions: {alignItems: 'center', flexDirection: 'row', gap: spacing.xs},
  cardMeta: {color: colors.textTertiary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs},
  scenario: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, lineHeight: typography.lineHeight.lg},
  lookNames: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  loadMoreButton: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48},
  loadMoreLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
});
