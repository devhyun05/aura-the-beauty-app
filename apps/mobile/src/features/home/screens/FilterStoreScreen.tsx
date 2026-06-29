import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {SlidersHorizontal, Sparkles} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, ImagePlaceholder} from '../../../shared/ui';
import {getHomeData} from '../services/homeService';
import type {HomeFilterStoreItem} from '../types';

type FilterStoreScreenProps = {
  onApplyFilter?: (filter: HomeFilterStoreItem) => void;
};

const ALL_CATEGORY_ID = '전체';

export function FilterStoreScreen({onApplyFilter}: FilterStoreScreenProps) {
  const {width} = useWindowDimensions();
  const [filters, setFilters] = useState<HomeFilterStoreItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY_ID);
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

  useEffect(() => {
    let isMounted = true;

    getHomeData().then(data => {
      if (isMounted) {
        setFilters(data.filterStore);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const categories = useMemo(
    () => [
      ALL_CATEGORY_ID,
      ...Array.from(new Set(filters.map(filter => filter.category))),
    ],
    [filters],
  );
  const visibleFilters = useMemo(
    () =>
      selectedCategory === ALL_CATEGORY_ID
        ? filters
        : filters.filter(filter => filter.category === selectedCategory),
    [filters, selectedCategory],
  );

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <YStack style={styles.summary}>
        <XStack style={styles.summaryHeader}>
          <View style={styles.summaryIcon}>
            <Sparkles color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </View>
          <Text style={styles.summaryTitle}>내 얼굴에 바로 적용할 필터</Text>
        </XStack>
        <Text style={styles.summaryDescription}>
          립, 치크, 베이스 필터를 골라 AR 화면에서 바로 확인해요.
        </Text>
      </YStack>

      <XStack style={styles.categoryList}>
        {categories.map(category => {
          const selected = category === selectedCategory;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${category} 필터 보기`}
              key={category}
              onPress={() => setSelectedCategory(category)}
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
                {category}
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
  filter: HomeFilterStoreItem;
  onApplyFilter?: (filter: HomeFilterStoreItem) => void;
  width: number;
}) {
  return (
    <View style={[styles.card, {width}]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder
          borderRadius={radius.md}
          resizeMode="contain"
          source={filter.imageSource}
        />
        <XStack style={styles.badge}>
          <Text style={styles.badgeText}>{filter.category}</Text>
        </XStack>
      </View>

      <YStack style={styles.textArea}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {filter.title}
        </Text>
        <Text numberOfLines={2} style={styles.cardDescription}>
          {filter.description}
        </Text>
      </YStack>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${filter.title} AR로 적용`}
        onPress={() => onApplyFilter?.(filter)}
        style={({pressed}) => [styles.applyButton, pressed && styles.pressed]}>
        <SlidersHorizontal color={colors.white} size={iconSize.xs} strokeWidth={2} />
        <Text style={styles.applyButtonText}>AR 적용</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  applyButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    left: spacing.sm,
    minHeight: 26,
    paddingHorizontal: spacing.sm,
    position: 'absolute',
    top: spacing.sm,
  },
  badgeText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
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
  cardTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
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
  imageArea: {
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.lg,
    position: 'relative',
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
    gap: spacing.xs,
    minHeight: 62,
  },
});
