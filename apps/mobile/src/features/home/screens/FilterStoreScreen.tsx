import {useMemo, useState} from 'react';
import {Image, Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Sparkles} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {getRecommendedMakeupFilters} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {RecommendedMakeupFilter} from '../../../shared/types/makeupGuide';
import {AppScreen} from '../../../shared/ui';

type FilterStoreScreenProps = {
  onApplyFilter?: (filterId: string) => void;
};

const filterStoreCategories = [
  {id: 'all', label: '전체'},
  {id: 'glow', label: '글로우'},
  {id: 'smoky', label: '스모키'},
  {id: 'pink', label: '핑크'},
  {id: 'brown', label: '브라운'},
  {id: 'trend', label: '트렌드'},
  {id: 'unique', label: '유니크'},
] as const;

type FilterStoreCategoryId = (typeof filterStoreCategories)[number]['id'];

export function filterRecommendedMakeupFiltersByCategory(
  filters: readonly RecommendedMakeupFilter[],
  categoryId: FilterStoreCategoryId,
): readonly RecommendedMakeupFilter[] {
  if (categoryId === 'all') {
    return filters;
  }

  return filters.filter(filter => filter.categoryTags.includes(categoryId));
}

export function getFilterStoreCategoryLabels(): readonly string[] {
  return filterStoreCategories.map(category => category.label);
}

export function FilterStoreScreen({onApplyFilter}: FilterStoreScreenProps) {
  const {width} = useWindowDimensions();
  const [selectedCategory, setSelectedCategory] =
    useState<FilterStoreCategoryId>('all');
  const filters = getRecommendedMakeupFilters();
  const visibleFilters = useMemo(
    () => filterRecommendedMakeupFiltersByCategory(filters, selectedCategory),
    [filters, selectedCategory],
  );
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <YStack style={styles.summary}>
        <XStack style={styles.summaryHeader}>
          <View style={styles.summaryIcon}>
            <Sparkles color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </View>
          <Text style={styles.summaryTitle}>추천 필터</Text>
        </XStack>
        <Text style={styles.summaryDescription}>
          썸네일의 메이크업을 AR 필터로 바로 적용해요.
        </Text>
      </YStack>

      <XStack style={styles.categoryList}>
        {filterStoreCategories.map(category => {
          const selected = category.id === selectedCategory;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${category.label} 필터 보기`}
              key={category.id}
              onPress={() => setSelectedCategory(category.id)}
              style={({pressed}) => [
                styles.categoryChip,
                selected && styles.categoryChipSelected,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.categoryText,
                  selected && styles.categoryTextSelected,
                ]}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </XStack>

      <View style={[styles.grid, {columnGap: gap, rowGap: spacing.xl}]}>
        {visibleFilters.map(filter => (
          <FilterStoreGridCard
            filter={filter}
            key={filter.id}
            onApplyFilter={onApplyFilter}
            width={cardWidth}
          />
        ))}
      </View>
    </AppScreen>
  );
}

function FilterStoreGridCard({
  filter,
  onApplyFilter,
  width,
}: {
  filter: RecommendedMakeupFilter;
  onApplyFilter?: (filterId: string) => void;
  width: number;
}) {
  const keywordChips = filter.keywords.slice(0, 2);

  return (
    <Pressable
      accessibilityLabel={`${filter.headline} ${filter.displayTitle}, ${filter.matchScore}퍼센트 추천, AR 적용`}
      accessibilityRole="button"
      onPress={() => onApplyFilter?.(filter.id)}
      style={({pressed}) => [styles.card, {width}, pressed && styles.pressed]}>
      <View style={styles.imageArea}>
        <Image resizeMode="cover" source={filter.imageSource} style={styles.image} />
        <View style={styles.imageScrim} />
        <YStack style={styles.imageCopy}>
          <Text numberOfLines={1} style={styles.imageHeadline}>
            {filter.headline}
          </Text>
          <Text numberOfLines={1} style={styles.imageTitle}>
            {filter.displayTitle}
          </Text>
        </YStack>
        <XStack style={styles.matchBadge}>
          <Text style={styles.matchBadgeText}>{filter.matchScore}% match</Text>
        </XStack>
      </View>

      <YStack style={styles.textArea}>
        <Text numberOfLines={2} style={styles.cardDescription}>
          {filter.description}
        </Text>
        <XStack style={styles.keywordList}>
          {keywordChips.map(keyword => (
            <Text key={keyword} numberOfLines={1} style={styles.keywordChip}>
              {keyword}
            </Text>
          ))}
        </XStack>
      </YStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  cardDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    minHeight: typography.lineHeight.xs * 2,
  },
  categoryChip: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryChipSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  categoryTextSelected: {
    color: colors.white,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageArea: {
    aspectRatio: 0.82,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  imageCopy: {
    bottom: spacing.md,
    gap: 2,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    zIndex: 1,
  },
  imageHeadline: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  imageScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    bottom: 0,
    height: 86,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  imageTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  keywordChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  keywordList: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  matchBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.72)',
    borderRadius: radius.pill,
    left: spacing.sm,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    position: 'absolute',
    top: spacing.sm,
    zIndex: 1,
  },
  matchBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.78,
  },
  summary: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  summaryDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  summaryTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  textArea: {
    gap: spacing.sm,
    minHeight: 78,
  },
});
