import {useEffect, useRef} from 'react';
import {FlatList, StyleSheet, View, type ViewToken} from 'react-native';

import {spacing} from '../../../shared/theme';
import type {CatalogProduct} from '../types';
import {RecommendationProductCard, RECOMMENDATION_RAIL_CARD_WIDTH} from './RecommendationProductCard';

export function ProductRail({
  impressionScopeKey,
  items,
  onImpression,
  onOpen,
  onToggleLike,
}: {
  impressionScopeKey?: string | null;
  items: CatalogProduct[];
  onImpression?: (product: CatalogProduct, position: number) => void;
  onOpen: (product: CatalogProduct, position: number) => void;
  onToggleLike: (product: CatalogProduct) => void;
}) {
  const impressed = useRef(new Set<string>());
  const onImpressionRef = useRef(onImpression);
  onImpressionRef.current = onImpression;
  useEffect(() => {
    impressed.current.clear();
  }, [impressionScopeKey]);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 700,
  }).current;
  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: Array<ViewToken<CatalogProduct>>}) => {
      viewableItems.forEach(token => {
        if (!token.isViewable || !token.item || token.index === null) return;
        const key = `${token.item.productId}:${token.item.shadeId ?? 'family'}`;
        if (impressed.current.has(key)) return;
        impressed.current.add(key);
        onImpressionRef.current?.(token.item, token.index);
      });
    },
  ).current;

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={items}
      getItemLayout={(_, index) => ({index, length: RECOMMENDATION_RAIL_CARD_WIDTH + spacing.sm, offset: (RECOMMENDATION_RAIL_CARD_WIDTH + spacing.sm) * index})}
      horizontal
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      keyExtractor={item => `${item.productId}:${item.shadeId ?? 'family'}`}
      onViewableItemsChanged={onViewableItemsChanged}
      renderItem={({item, index}) => <RecommendationProductCard product={item} onOpen={() => onOpen(item, index)} onToggleLike={() => onToggleLike(item)} />}
      showsHorizontalScrollIndicator={false}
      viewabilityConfig={viewabilityConfig}
    />
  );
}

const styles = StyleSheet.create({content: {paddingRight: spacing.screenX}, separator: {width: spacing.sm}});
