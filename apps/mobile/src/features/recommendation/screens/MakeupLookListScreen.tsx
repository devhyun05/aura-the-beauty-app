import {useEffect, useMemo, useState} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import {AppScreen, ImagePlaceholder} from '../../../shared/ui';

type MakeupLookListScreenProps = {
  likedMakeupLooks?: readonly MakeupLookPreview[];
  onPressMakeupLook?: (makeupLook: MakeupLookPreview) => void;
};

const MAKEUP_LOOKS_PAGE_SIZE = 4;

export function MakeupLookListScreen({
  likedMakeupLooks = [],
  onPressMakeupLook,
}: MakeupLookListScreenProps = {}) {
  const {width} = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(1);
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);
  const visibleMakeupLooks = useMemo(
    () => [...likedMakeupLooks],
    [likedMakeupLooks],
  );
  const pages = useMemo(
    () => chunkItems(visibleMakeupLooks, MAKEUP_LOOKS_PAGE_SIZE),
    [visibleMakeupLooks],
  );
  const totalPages = Math.max(1, pages.length);
  const displayPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages));
  }, [totalPages]);

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / contentWidth) + 1;

    setCurrentPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  if (visibleMakeupLooks.length === 0) {
    return (
      <AppScreen contentGap={spacing.xl} topPadding="none">
        <EmptyState label="저장한 메이크업 룩이 없어요." />
      </AppScreen>
    );
  }

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <View style={styles.pager}>
        <ScrollView
          bounces={false}
          horizontal
          onMomentumScrollEnd={handleMomentumScrollEnd}
          pagingEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={{width: contentWidth}}>
          {pages.map((page, pageIndex) => (
            <View
              key={`makeup-look-page-${pageIndex}`}
              style={[styles.grid, {gap, width: contentWidth}]}>
              {page.map(makeupLook => (
                <Pressable
                  accessibilityLabel={`${makeupLook.title} 필터 열기`}
                  accessibilityRole="button"
                  disabled={!makeupLook.makeupPresetValues.sourceFilterId}
                  key={makeupLook.id}
                  onPress={() => onPressMakeupLook?.(makeupLook)}
                  style={({pressed}) => [
                    styles.card,
                    {width: cardWidth},
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.imageArea}>
                    <ImagePlaceholder
                      borderRadius={radius.md}
                      resizeMode="cover"
                      source={makeupLook.imageSource}
                    />
                  </View>
                  <Text numberOfLines={1} style={styles.title}>
                    {makeupLook.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>

        <Text style={styles.paginationText}>
          {displayPage} / {totalPages}
        </Text>
      </View>
    </AppScreen>
  );
}

function EmptyState({label}: {label: string}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  empty: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 140,
    padding: spacing.lg,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageArea: {
    aspectRatio: 0.82,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  pager: {
    gap: spacing.md,
  },
  paginationText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
});
