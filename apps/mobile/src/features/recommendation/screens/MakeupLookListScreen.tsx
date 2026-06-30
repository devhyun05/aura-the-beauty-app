import {useEffect, useMemo, useState} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Text, View} from 'tamagui';

import {getMakeupLooks} from '../../../shared/services/makeupService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupLook} from '../../../shared/types/profile';
import {AppScreen, ImagePlaceholder} from '../../../shared/ui';

type MakeupLookListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
};

const MAKEUP_LOOKS_PAGE_SIZE = 4;

export function MakeupLookListScreen(_props: MakeupLookListScreenProps = {}) {
  const {width} = useWindowDimensions();
  const [makeupLooks, setMakeupLooks] = useState<MakeupLook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);
  const pages = useMemo(
    () => chunkItems(makeupLooks, MAKEUP_LOOKS_PAGE_SIZE),
    [makeupLooks],
  );
  const totalPages = Math.max(1, pages.length);
  const displayPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    let isMounted = true;

    getMakeupLooks()
      .then((nextMakeupLooks) => {
        if (isMounted) {
          setMakeupLooks(nextMakeupLooks);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMakeupLooks([]);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / contentWidth) + 1;

    setCurrentPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  if (isLoading) {
    return (
      <AppScreen contentGap={spacing.xl} topPadding="none">
        <EmptyState label="메이크업 룩을 불러오는 중이에요." />
      </AppScreen>
    );
  }

  if (makeupLooks.length === 0) {
    return (
      <AppScreen contentGap={spacing.xl} topPadding="none">
        <EmptyState label="저장된 메이크업 룩이 없어요." />
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
              {page.map((makeupLook) => (
                <View key={makeupLook.id} style={[styles.card, {width: cardWidth}]}>
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
                </View>
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

function chunkItems<T>(items: T[], size: number): T[][] {
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
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
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
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
});
