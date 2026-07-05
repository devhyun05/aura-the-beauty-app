import {useEffect, useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  type GestureResponderEvent,
  useWindowDimensions,
} from 'react-native';
import {Heart} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {
  getRecommendedMakeupFilters,
  getRecommendedMakeupFiltersFromApi,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {RecommendedMakeupFilter} from '../../../shared/types/makeupGuide';
import {AppScreen} from '../../../shared/ui';

type FilterStoreScreenProps = {
  initialFilterId?: string;
  isFilterLiked?: (filterId: string) => boolean;
  onApplyFilter?: (filterId: string) => void;
  onToggleFilterLike?: (filterId: string) => void;
};

const filterStoreCategories = [
  {id: 'all', label: '전체'},
  {id: 'glow', label: '글로우'},
  {id: 'smoky', label: '스모키'},
  {id: 'red', label: '레드'},
  {id: 'pink', label: '핑크'},
  {id: 'brown', label: '브라운'},
  {id: 'trend', label: '트렌드'},
  {id: 'unique', label: '유니크'},
] as const;

type FilterStoreCategoryId = (typeof filterStoreCategories)[number]['id'];

const filterStoreCategoryIds = filterStoreCategories.map(category => category.id);

export const FILTER_STORE_SHOW_SUMMARY_CARD = false;
export const FILTER_STORE_CATEGORY_LIST_SCROLL_AXIS = 'horizontal';
export const FILTER_STORE_CATEGORY_LIST_ALLOWS_WRAP = false;
export const FILTER_STORE_CATEGORY_CHIP_HEIGHT = 34;
export const FILTER_STORE_CATEGORY_TEXT_NUMBER_OF_LINES = 1;
export const FILTER_STORE_CARD_IMAGE_OVERLAY_HEIGHT = 76;

function isFilterStoreCategoryId(categoryId: string): categoryId is FilterStoreCategoryId {
  return filterStoreCategoryIds.includes(categoryId as FilterStoreCategoryId);
}

export function filterRecommendedMakeupFiltersByCategory(
  filters: readonly RecommendedMakeupFilter[],
  categoryId: FilterStoreCategoryId,
): readonly RecommendedMakeupFilter[] {
  if (categoryId === 'all') {
    return filters;
  }

  return filters.filter(filter => filter.categoryTags.includes(categoryId));
}

export function getFilterStoreCategoryForFilter(
  filters: readonly RecommendedMakeupFilter[],
  filterId?: string,
): FilterStoreCategoryId {
  const filter = filters.find(candidateFilter => candidateFilter.id === filterId);

  return (
    filter?.categoryTags.find(
      (categoryTag): categoryTag is FilterStoreCategoryId =>
        categoryTag !== 'all' && isFilterStoreCategoryId(categoryTag),
    ) ?? 'all'
  );
}

export function pinFilterStoreFilterToFront(
  filters: readonly RecommendedMakeupFilter[],
  filterId?: string,
): readonly RecommendedMakeupFilter[] {
  if (!filterId) {
    return filters;
  }

  const filterIndex = filters.findIndex(filter => filter.id === filterId);

  if (filterIndex <= 0) {
    return filters;
  }

  const pinnedFilter = filters[filterIndex];

  if (!pinnedFilter) {
    return filters;
  }

  return [
    pinnedFilter,
    ...filters.slice(0, filterIndex),
    ...filters.slice(filterIndex + 1),
  ];
}

export function getFilterStoreCategoryLabels(): readonly string[] {
  return filterStoreCategories.map(category => category.label);
}

export function FilterStoreScreen({
  initialFilterId,
  isFilterLiked,
  onApplyFilter,
  onToggleFilterLike,
}: FilterStoreScreenProps) {
  const {width} = useWindowDimensions();
  const [filters, setFilters] = useState<readonly RecommendedMakeupFilter[]>(() =>
    getRecommendedMakeupFilters(),
  );
  const initialCategory = useMemo(
    () => getFilterStoreCategoryForFilter(filters, initialFilterId),
    [filters, initialFilterId],
  );
  const [selectedCategory, setSelectedCategory] =
    useState<FilterStoreCategoryId>(initialCategory);

  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    let isMounted = true;

    getRecommendedMakeupFiltersFromApi().then((nextFilters) => {
      if (isMounted) {
        setFilters(nextFilters);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleFilters = useMemo(
    () => pinFilterStoreFilterToFront(
      filterRecommendedMakeupFiltersByCategory(filters, selectedCategory),
      initialFilterId,
    ),
    [filters, initialFilterId, selectedCategory],
  );
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <ScrollView
        horizontal={FILTER_STORE_CATEGORY_LIST_SCROLL_AXIS === 'horizontal'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryList}>
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
                numberOfLines={FILTER_STORE_CATEGORY_TEXT_NUMBER_OF_LINES}
                style={[
                  styles.categoryText,
                  selected && styles.categoryTextSelected,
                ]}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.grid, {columnGap: gap, rowGap: spacing.xl}]}>
        {visibleFilters.map(filter => (
          <FilterStoreGridCard
            filter={filter}
            isLiked={Boolean(isFilterLiked?.(filter.id))}
            key={filter.id}
            onApplyFilter={onApplyFilter}
            onToggleLike={onToggleFilterLike}
            width={cardWidth}
          />
        ))}
      </View>
    </AppScreen>
  );
}

function FilterStoreGridCard({
  filter,
  isLiked,
  onApplyFilter,
  onToggleLike,
  width,
}: {
  filter: RecommendedMakeupFilter;
  isLiked: boolean;
  onApplyFilter?: (filterId: string) => void;
  onToggleLike?: (filterId: string) => void;
  width: number;
}) {
  const keywordChips = filter.keywords.slice(0, 2);
  const handleToggleLike = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onToggleLike?.(filter.id);
  };

  return (
    <Pressable
      accessibilityLabel={`${filter.headline} ${filter.displayTitle}, ${filter.matchScore}퍼센트 추천`}
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
        <Pressable
          accessibilityLabel={`${filter.displayTitle} 좋아요 ${isLiked ? '해제' : '추가'}`}
          accessibilityRole="button"
          onPress={handleToggleLike}
          style={({pressed}) => [
            styles.favoriteButton,
            isLiked && styles.favoriteButtonActive,
            pressed && styles.pressed,
          ]}>
          <Heart
            color={colors.white}
            fill={isLiked ? colors.white : 'transparent'}
            size={iconSize.sm}
            strokeWidth={2}
          />
        </Pressable>
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
    flexShrink: 0,
    height: FILTER_STORE_CATEGORY_CHIP_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryChipSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: FILTER_STORE_CATEGORY_LIST_ALLOWS_WRAP ? 'wrap' : 'nowrap',
    gap: spacing.sm,
  },
  categoryText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    flexShrink: 0,
    lineHeight: typography.lineHeight.xs,
  },
  categoryTextSelected: {
    color: colors.white,
  },
  favoriteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.72)',
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 32,
    zIndex: 2,
  },
  favoriteButtonActive: {
    backgroundColor: colors.textPrimary,
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
    height: FILTER_STORE_CARD_IMAGE_OVERLAY_HEIGHT,
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
  textArea: {
    gap: spacing.sm,
    minHeight: 78,
  },
});
