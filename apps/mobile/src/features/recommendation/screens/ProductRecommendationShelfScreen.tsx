import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text} from 'tamagui';

import {
  getLikedProducts,
  likeExternalProduct,
  likeProduct,
  unlikeProduct,
} from '../../../shared/services/productService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {useTransientToast} from '../../../shared/ui';
import {RecommendationProductCard} from '../components/RecommendationProductCard';
import {RecommendationSectionState} from '../components/RecommendationSectionState';
import {initializeProductEventCollection, queueProductEvent} from '../services/productEventService';
import {
  getArRecommendations,
  getCohortRecommendations,
  getPersonalizedRecommendations,
  getSeasonalRecommendations,
} from '../services/productHubService';
import {
  filterProductShelfItems,
  PRODUCT_SHELF_CATEGORY_TABS,
  productShelfCategoryLabel,
} from '../services/productShelfCategories';
import type {
  CatalogProduct,
  ProductRecommendationCategory,
  ProductRecommendationShelf,
  ProductSectionStatus,
} from '../types';

type ShelfPageData = {
  status: ProductSectionStatus;
  items: CatalogProduct[];
  runId?: string | null;
  collectionId?: string | null;
  liveCollection?: boolean;
  title?: string | null;
  description?: string | null;
  cohortSizeBand?: string | null;
};

type ShelfLoadState = {
  status: 'loading' | 'ready' | 'error';
  data?: ShelfPageData;
  message?: string;
};

const SHELF_DEFAULTS: Record<ProductRecommendationShelf, {title: string; description: string}> = {
  ar: {
    title: 'AR 필터 기반 추천제품',
    description: '저장한 AR 룩의 실제 shade 색상과 피니시에 가까운 검증 상품이에요.',
  },
  personalized: {
    title: '회원님만을 위한 추천제품',
    description: '동의한 좋아요·검색·클릭 기록을 바탕으로 취향에 맞춰 정렬했어요.',
  },
  seasonal: {
    title: '시즌 상품',
    description: '현재 트렌드 신호와 실제 판매 상품을 확인해 보여드려요.',
  },
  cohort: {
    title: '나와 비슷한 분들이 많이 좋아해요',
    description: '개인정보 기준을 충족한 익명 컬러 취향 집계에서 많이 좋아한 상품이에요.',
  },
};

function uniqueProducts(items: CatalogProduct[]): CatalogProduct[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.productId}:${item.shadeId ?? 'family'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadShelfData(
  shelf: ProductRecommendationShelf,
  arStyleId?: string | null,
): Promise<ShelfPageData> {
  if (shelf === 'ar') {
    const data = await getArRecommendations(arStyleId, 20);
    return {
      status: data.status,
      items: uniqueProducts(data.groups.flatMap(group => group.items)),
      runId: data.runId,
      description: data.basedOn?.styleTitle
        ? `${data.basedOn.styleTitle} 룩의 색상과 피니시를 기준으로 골랐어요.`
        : null,
    };
  }
  if (shelf === 'seasonal') {
    const data = await getSeasonalRecommendations(undefined, 30);
    return {
      status: data.status,
      items: data.items,
      collectionId: data.collection?.id,
      liveCollection: data.collection?.isLive,
      title: data.collection?.title,
      description: data.collection?.summary,
    };
  }
  const data = shelf === 'personalized'
    ? await getPersonalizedRecommendations(30)
    : await getCohortRecommendations(30);
  return {
    status: data.status,
    items: data.items,
    runId: data.runId,
    title: data.title,
    description: data.description,
    cohortSizeBand: data.cohortSizeBand,
  };
}

function unavailableMessage(shelf: ProductRecommendationShelf, status?: ProductSectionStatus): string {
  if (status === 'personalizationOff') return '개인화 설정에서 동의하면 이 추천을 이용할 수 있어요.';
  if (status === 'control') return '추천 품질을 검증하는 비교 그룹이라 현재 상품을 표시하지 않아요.';
  if (shelf === 'ar') return '저장한 AR 룩과 색상 근거가 맞는 검증 상품이 아직 없어요.';
  if (shelf === 'seasonal') return '확인 가능한 최신 시즌 상품을 준비하고 있어요.';
  if (shelf === 'cohort') return '같은 컬러 취향의 실제 동의 사용자가 100명 이상 모이면 추천을 시작해요.';
  return '좋아요·검색·클릭 기록이 더 쌓이면 취향에 맞는 상품을 보여드려요.';
}

export function ProductRecommendationShelfScreen({
  arStyleId,
  initialTitle,
  onOpenLikedProducts,
  onOpenProduct,
  shelf,
}: {
  arStyleId?: string | null;
  initialTitle?: string | null;
  onOpenLikedProducts?: () => void;
  onOpenProduct: (product: CatalogProduct) => void;
  shelf: ProductRecommendationShelf;
}) {
  const insets = useSafeAreaInsets();
  const {showToast, toast} = useTransientToast(2600);
  const [activeCategory, setActiveCategory] = useState<ProductRecommendationCategory>('all');
  const [likedProductIds, setLikedProductIds] = useState<Set<string>>(new Set());
  const [state, setState] = useState<ShelfLoadState>({status: 'loading'});
  const requestIdRef = useRef(0);
  const impressed = useRef(new Set<string>());
  const viewabilityConfig = useRef({itemVisiblePercentThreshold: 60, minimumViewTime: 700}).current;
  const impressionRef = useRef<(product: CatalogProduct, position: number) => void>(() => undefined);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState({status: 'loading'});
    loadShelfData(shelf, arStyleId)
      .then(data => {
        if (requestIdRef.current === requestId) setState({status: 'ready', data});
      })
      .catch(error => {
        if (requestIdRef.current !== requestId) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '추천 제품을 불러오지 못했어요.',
        });
      });
  }, [arStyleId, shelf]);

  useEffect(() => {
    void initializeProductEventCollection();
    load();
    return () => {requestIdRef.current += 1;};
  }, [load]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getLikedProducts().then(products => {
      if (active) setLikedProductIds(new Set(products.map(product => product.id)));
    }).catch(() => undefined);
    return () => {active = false;};
  }, []));

  useEffect(() => {
    impressed.current.clear();
  }, [state.data?.runId, state.data?.collectionId, shelf, activeCategory]);

  const allItems = useMemo(() => (state.data?.items ?? []).map(item => ({
    ...item,
    viewerState: {
      liked: item.canLike === false ? false : likedProductIds.has(item.productId),
    },
  })), [likedProductIds, state.data?.items]);
  const visibleItems = useMemo(
    () => filterProductShelfItems(allItems, activeCategory),
    [activeCategory, allItems],
  );
  const defaults = SHELF_DEFAULTS[shelf];
  const title = initialTitle?.trim() || (shelf === 'personalized' ? state.data?.title?.trim() : '') || defaults.title;
  const description = state.data?.description?.trim() || defaults.description;

  const queueShelfEvent = useCallback((eventType: 'impression' | 'product_open', product: CatalogProduct, position: number) => {
    const data = state.data;
    if (!data) return;
    if ((shelf === 'ar' || shelf === 'personalized') && (!data.runId || !product.exposureToken)) return;
    if (shelf === 'seasonal' && (!data.collectionId || data.liveCollection)) return;
    queueProductEvent({
      eventType,
      section: shelf,
      productId: product.productId,
      shadeId: product.shadeId,
      runId: data.runId ?? undefined,
      exposureToken: product.exposureToken,
      collectionId: shelf === 'seasonal' ? data.collectionId ?? undefined : undefined,
      position,
      context: eventType === 'impression'
        ? {screen: 'product_shelf', category: activeCategory, viewportRatio: 0.6, visibleMs: 700}
        : {screen: 'product_shelf', category: activeCategory},
    });
  }, [activeCategory, shelf, state.data]);
  impressionRef.current = (product, position) => queueShelfEvent('impression', product, position);

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

  const toggleLike = async (product: CatalogProduct) => {
    if (product.canLike === false) return;
    const wasLiked = likedProductIds.has(product.productId);
    const next = new Set(likedProductIds);
    if (wasLiked) next.delete(product.productId);
    else next.add(product.productId);
    setLikedProductIds(next);
    try {
      if (wasLiked) await unlikeProduct(product.productId, product.externalSource);
      else {
        if (product.externalSource) await likeExternalProduct(product.productId, product.externalSource);
        else await likeProduct(product.productId, product.shadeId);
        showToast('좋아요한 제품에 저장했어요', onOpenLikedProducts
          ? {label: '보기', onPress: onOpenLikedProducts}
          : undefined);
      }
    } catch {
      setLikedProductIds(likedProductIds);
      showToast('좋아요를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const openProduct = async (product: CatalogProduct, position: number) => {
    queueShelfEvent('product_open', product, position);
    if (product.externalSource) {
      if (!product.purchaseUrl) {
        showToast('판매처 정보를 확인할 수 없어요.');
        return;
      }
      try {
        const supported = await Linking.canOpenURL(product.purchaseUrl);
        if (!supported) throw new Error('Unsupported seller URL');
        await Linking.openURL(product.purchaseUrl);
      } catch {
        showToast('판매처 페이지를 열 수 없어요. 잠시 후 다시 시도해 주세요.');
      }
      return;
    }
    onOpenProduct(product);
  };

  const empty = state.status === 'ready' && state.data?.status === 'ready'
    ? `현재 이 추천 기준에는 ${productShelfCategoryLabel(activeCategory)} 상품이 없어요. 검증된 실제 상품이 준비되면 표시할게요.`
    : unavailableMessage(shelf, state.data?.status);

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {shelf === 'cohort' && state.data?.cohortSizeBand ? <Text style={styles.evidence}>익명 집계 모수 {state.data.cohortSizeBand}</Text> : null}
      </View>
      <ScrollView
        contentContainerStyle={styles.tabs}
        horizontal
        style={styles.tabScroller}
        showsHorizontalScrollIndicator={false}>
        {PRODUCT_SHELF_CATEGORY_TABS.map(tab => {
          const selected = activeCategory === tab.id;
          return (
            <Pressable
              accessibilityLabel={`${tab.label} 상품 보기`}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              key={tab.id}
              onPress={() => setActiveCategory(tab.id)}
              style={selected ? styles.tabSelected : styles.tab}>
              <Text style={selected ? styles.tabTextSelected : styles.tabText}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.countRow}>
        <Text style={styles.count}>{productShelfCategoryLabel(activeCategory)} · {visibleItems.length}개</Text>
      </View>
      <FlatList
        columnWrapperStyle={visibleItems.length ? styles.grid : undefined}
        contentContainerStyle={[styles.content, {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl}]}
        data={state.status === 'ready' && state.data?.status === 'ready' ? visibleItems : []}
        keyExtractor={item => `${item.productId}:${item.shadeId ?? 'family'}`}
        ListEmptyComponent={state.status === 'loading'
          ? <RecommendationSectionState kind="loading" message="추천 제품을 불러오는 중이에요." />
          : state.status === 'error'
            ? <RecommendationSectionState kind="error" message={state.message ?? '추천 제품을 불러오지 못했어요.'} actionLabel="다시 시도" onAction={load} />
            : <RecommendationSectionState kind="empty" message={empty} />}
        numColumns={2}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({item, index}) => (
          <RecommendationProductCard
            grid
            onOpen={() => {void openProduct(item, index);}}
            onToggleLike={() => {void toggleLike(item);}}
            product={item}
            showReason
          />
        )}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
      />
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {backgroundColor: colors.background, flex: 1},
  intro: {gap: spacing.xs, paddingBottom: spacing.md, paddingHorizontal: spacing.screenX, paddingTop: spacing.lg},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  evidence: {...typography.caption, color: colors.textTertiary},
  tabs: {gap: spacing.xs, paddingHorizontal: spacing.screenX},
  tabScroller: {flexGrow: 0, height: 44},
  tab: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  tabSelected: {alignItems: 'center', backgroundColor: colors.black, borderColor: colors.black, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  tabText: {color: colors.textSecondary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  tabTextSelected: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  countRow: {paddingHorizontal: spacing.screenX, paddingVertical: spacing.md},
  count: {...typography.caption, color: colors.textSecondary},
  content: {flexGrow: 1, gap: spacing.xl, paddingHorizontal: spacing.screenX},
  grid: {gap: spacing.md},
});
