import {useCallback, useEffect, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {FlatList, Pressable, StyleSheet, View, type ViewToken} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text} from 'tamagui';

import {getLikedProducts, likeProduct, unlikeProduct} from '../../../shared/services/productService';
import {colors, spacing, typography} from '../../../shared/theme';
import {useTransientToast} from '../../../shared/ui';
import {RecommendationProductCard} from '../components/RecommendationProductCard';
import {RecommendationSectionState} from '../components/RecommendationSectionState';
import {initializeProductEventCollection, queueProductEvent} from '../services/productEventService';
import {searchTrustedProducts} from '../services/productHubService';
import type {CatalogProduct, ProductSearchData} from '../types';

export function ProductSearchResultScreen({
  query,
  onOpenProduct,
  onOpenLikedProducts,
}: {
  query: string;
  onOpenProduct: (product: CatalogProduct) => void;
  onOpenLikedProducts?: () => void;
}) {
  const [state, setState] = useState<{status: 'loading' | 'ready' | 'error'; data?: ProductSearchData; message?: string}>({status: 'loading'});
  const {showToast, toast} = useTransientToast(2600);
  const insets = useSafeAreaInsets();
  const impressed = useRef(new Set<string>());
  const impressionRef = useRef<(product: CatalogProduct, position: number) => void>(() => undefined);
  const viewabilityConfig = useRef({itemVisiblePercentThreshold: 60, minimumViewTime: 700}).current;
  const load = () => {
    setState({status: 'loading'});
    searchTrustedProducts(query).then(data => setState({status: 'ready', data})).catch(error => setState({status: 'error', message: error instanceof Error ? error.message : '검색하지 못했어요.'}));
  };
  useEffect(() => {void initializeProductEventCollection();}, []);
  useEffect(load, [query]);
  useFocusEffect(useCallback(() => {
    let active = true;
    getLikedProducts().then(products => {
      if (!active) return;
      const likedIds = new Set(products.map(product => product.id));
      setState(current => current.data ? {
        ...current,
        data: {
          ...current.data,
          items: current.data.items.map(item => ({
            ...item,
            viewerState: {liked: likedIds.has(item.productId)},
          })),
        },
      } : current);
    }).catch(() => undefined);
    return () => {active = false;};
  }, []));
  useEffect(() => {impressed.current.clear();}, [state.data?.searchRequestId]);
  const toggleLike = async (product: CatalogProduct) => {
    const liked = product.viewerState.liked;
    setState(current => current.data ? {...current, data: {...current.data, items: current.data.items.map(item => item.productId === product.productId ? {...item, viewerState: {liked: !liked}} : item)}} : current);
    try {
      if (liked) await unlikeProduct(product.productId);
      else {
        await likeProduct(product.productId, product.shadeId);
        showToast('좋아요한 제품에 저장했어요', onOpenLikedProducts
          ? {label: '보기', onPress: onOpenLikedProducts}
          : undefined);
      }
    } catch {load();}
  };
  const open = (product: CatalogProduct, position: number) => {
    if (state.data?.searchRequestId) queueProductEvent({eventType: 'search_result_open', section: 'search', productId: product.productId, shadeId: product.shadeId, searchRequestId: state.data.searchRequestId, position, context: {screen: 'product_search'}});
    onOpenProduct(product);
  };
  impressionRef.current = (product, position) => {
    if (!state.data?.searchRequestId) return;
    queueProductEvent({eventType: 'impression', section: 'search', productId: product.productId, shadeId: product.shadeId, searchRequestId: state.data.searchRequestId, position, context: {screen: 'product_search', viewportRatio: 0.6, visibleMs: 700}});
  };
  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: Array<ViewToken<CatalogProduct>>}) => {
      viewableItems.forEach(token => {
        if (!token.isViewable || !token.item || token.index === null) return;
        const key = `${token.item.productId}:${token.item.shadeId ?? 'family'}`;
        if (impressed.current.has(key)) return;
        impressed.current.add(key);
        impressionRef.current(token.item, token.index);
      });
    },
  ).current;
  return (
    <View style={styles.root}>
      <FlatList
        columnWrapperStyle={styles.grid}
        contentContainerStyle={[styles.content, {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl}]}
        data={state.status === 'ready' ? state.data?.items ?? [] : []}
        keyExtractor={product => `${product.productId}:${product.shadeId ?? ''}`}
        ListEmptyComponent={state.status === 'loading'
          ? <RecommendationSectionState kind="loading" message="제품을 검색하고 있어요." />
          : state.status === 'error'
            ? <RecommendationSectionState kind="error" message={state.message ?? '검색하지 못했어요.'} actionLabel="다시 시도" onAction={load} />
            : <RecommendationSectionState kind="empty" message="일치하는 검증 상품이 없어요. 브랜드나 제품명을 바꿔 검색해 보세요." />}
        ListFooterComponent={<Pressable accessibilityRole="button" onPress={load} style={styles.refresh}><Text style={styles.refreshText}>검색 결과 새로고침</Text></Pressable>}
        ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>‘{query}’ 검색 결과</Text><Text style={styles.description}>정식 catalog의 브랜드·제품명·shade만 검색해요.</Text></View>}
        numColumns={2}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({item, index}) => <RecommendationProductCard product={item} onOpen={() => open(item, index)} onToggleLike={() => toggleLike(item)} />}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
      />
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {gap: spacing.xs},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  root: {backgroundColor: colors.background, flex: 1},
  content: {gap: spacing.md, paddingHorizontal: spacing.screenX},
  grid: {gap: spacing.sm},
  refresh: {alignItems: 'center', minHeight: 44, justifyContent: 'center'},
  refreshText: {...typography.caption, color: colors.textSecondary, textDecorationLine: 'underline'},
});
