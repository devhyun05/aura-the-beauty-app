import type {ReactNode} from 'react';
import {useMemo, useState} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {PaginationDots} from './PaginationDots';

type PagedGridProps<T> = {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  pageSize?: number;
  pageStyle?: StyleProp<ViewStyle>;
  pageWidth: number;
  renderItem: (item: T, index: number) => ReactNode;
};

const DEFAULT_PAGE_SIZE = 10;

const createPages = <T,>(items: T[], pageSize: number) => {
  const pages: T[][] = [];

  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }

  return pages;
};

export function PagedGrid<T>({
  data,
  keyExtractor,
  pageSize = DEFAULT_PAGE_SIZE,
  pageStyle,
  pageWidth,
  renderItem,
}: PagedGridProps<T>) {
  const [activePage, setActivePage] = useState(0);
  const pages = useMemo(() => createPages(data, pageSize), [data, pageSize]);
  const pageCount = Math.max(pages.length, 1);

  const handleMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    const clampedPage = Math.max(0, Math.min(nextPage, pageCount - 1));

    setActivePage(clampedPage);
  };

  return (
    <View>
      <ScrollView
        decelerationRate="fast"
        horizontal
        onMomentumScrollEnd={handleMomentumEnd}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageWidth}
        style={{width: pageWidth}}
      >
        {pages.map((page, pageIndex) => (
          <View
            key={`paged-grid-page-${pageIndex}`}
            style={[styles.page, {width: pageWidth}, pageStyle]}
          >
            {page.map((item, itemIndex) => {
              const itemPageIndex = pageIndex * pageSize + itemIndex;

              return (
                <View key={keyExtractor(item, itemPageIndex)}>
                  {renderItem(item, itemPageIndex)}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <PaginationDots activeIndex={activePage} count={pageCount} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
