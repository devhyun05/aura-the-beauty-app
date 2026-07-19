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
import {
  initializeProductEventCollection,
  productEventIdentity,
  queueProductEvent,
} from '../services/productEventService';
import {
  getArRecommendations,
  getCohortRecommendations,
  getPersonalizedRecommendations,
  getSeasonalRecommendations,
} from '../services/productHubService';
import {
  cohortRecommendationTitle,
  cohortSizeEvidenceCopy,
  personalizedRecommendationTitle,
} from '../services/productRecommendationPresentation';
import {
  DEFAULT_TREND_REGION_CODE,
  resolveTrendRegionCode,
  type TrendRegionCode,
} from '../services/trendRegionService';
import {
  PRODUCT_SHELF_CATEGORY_TABS,
  filterProductShelfItems,
  productShelfCategoryLabel,
} from '../services/productShelfCategories';
import type {
  CatalogProduct,
  ProductRecommendationCategory,
  ProductRecommendationFallback,
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
  regionLabel?: string | null;
  weatherSummary?: string | null;
  freshnessStatus?: string | null;
  cohortSizeBand?: string | null;
  personalizationStatus?: ProductSectionStatus;
  cohortStatus?: ProductSectionStatus;
  fallback?: ProductRecommendationFallback | null;
};

type ShelfLoadState = {
  status: 'loading' | 'ready' | 'error';
  data?: ShelfPageData;
  message?: string;
};

type ShelfCategoryStates = Partial<Record<ProductRecommendationCategory, ShelfLoadState>>;

const SHELF_DEFAULTS: Record<ProductRecommendationShelf, {title: string; description: string}> = {
  ar: {
    title: 'AR 필터 기반 추천제품',
    description: '저장한 AR 룩의 색상과 피니시에 가까우며 판매 정보가 확인되는 상품이에요.',
  },
  personalized: {
    title: '회원님만을 위한 추천제품',
    description: '가입 시 안내한 좋아요·검색·클릭 기록을 바탕으로 취향에 맞춰 정렬했어요.',
  },
  seasonal: {
    title: '요즘 트렌드 제품',
    description: '최근 트렌드와 지역 날씨 신호에 잘 맞는 판매 상품을 보여드려요.',
  },
  cohort: {
    title: '나와 비슷한 분들이 많이 좋아해요',
    description: '나와 퍼스널컬러·제품 취향이 비슷한 사용자들이 좋아한 상품이에요.',
  },
};

function uniqueProducts(items: CatalogProduct[]): CatalogProduct[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.externalSource ?? 'catalog'}:${item.productId}:${item.shadeId ?? 'family'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadShelfData(
  shelf: ProductRecommendationShelf,
  arStyleId?: string | null,
  category: ProductRecommendationCategory = 'all',
  regionCode: TrendRegionCode = DEFAULT_TREND_REGION_CODE,
): Promise<ShelfPageData> {
  const requestedCategory = category === 'all' ? undefined : category;
  if (shelf === 'ar') {
    const data = await getArRecommendations(arStyleId, 20, requestedCategory);
    const items = uniqueProducts(data.groups.flatMap(group => group.items));
    const hasMatchedItems = items.some(item => !item.reasonCodes?.includes('POPULAR_FALLBACK'));
    return {
      status: items.length > 0 ? 'ready' : data.status,
      items,
      runId: data.runId,
      fallback: data.fallback,
      description: data.basedOn?.styleTitle && hasMatchedItems
        ? `${data.basedOn.styleTitle} 룩의 색상과 피니시를 기준으로 골랐어요.`
        : data.basedOn?.styleTitle && items.length > 0
          ? '저장한 AR 룩과 일치하는 상품이 부족해 이 카테고리의 인기 제품을 보여드려요.'
          : items.length > 0
            ? '저장한 AR 룩을 만들기 전에는 지금 많이 찾는 제품을 먼저 보여드려요.'
            : null,
    };
  }
  if (shelf === 'seasonal') {
    const data = await getSeasonalRecommendations(undefined, 60, requestedCategory, regionCode);
    const items = uniqueProducts(data.items);
    return {
      status: items.length > 0 ? 'ready' : data.status,
      items,
      collectionId: data.collection?.id,
      liveCollection: data.collection?.isLive,
      title: data.collection?.title,
      description: data.collection?.summary,
      regionLabel: data.collection?.regionLabel,
      weatherSummary: data.collection?.weatherSummary,
      freshnessStatus: data.collection?.freshnessStatus,
      fallback: data.fallback,
    };
  }
  const data = shelf === 'personalized'
    ? await getPersonalizedRecommendations(60, requestedCategory)
    : await getCohortRecommendations(60, requestedCategory);
  const items = uniqueProducts(data.items);
  return {
    status: items.length > 0 ? 'ready' : data.status,
    items,
    runId: data.runId,
    title: data.title,
    description: data.description,
    cohortSizeBand: data.cohortSizeBand,
    personalizationStatus: data.personalizationStatus,
    cohortStatus: data.cohortStatus,
    fallback: data.fallback,
  };
}

function unavailableMessage(shelf: ProductRecommendationShelf, status?: ProductSectionStatus): string {
  if (status === 'personalizationOff') return '개인화 설정에서 동의하면 이 추천을 이용할 수 있어요.';
  if (status === 'control') return '추천 품질을 검증하는 비교 그룹이라 현재 상품을 표시하지 않아요.';
  if (shelf === 'ar') return '저장한 AR 룩과 색상 근거가 맞는 판매 상품이 아직 없어요.';
  if (shelf === 'seasonal') return '확인 가능한 요즘 트렌드 제품을 준비하고 있어요.';
  if (shelf === 'cohort') return '비슷한 컬러 취향 추천을 준비하고 있어요.';
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
  const likedProductIdsRef = useRef<Set<string>>(new Set());
  const confirmedLikedProductIdsRef = useRef<Set<string>>(new Set());
  const productLikeIntentVersionsRef = useRef(new Map<string, number>());
  const likedProductsRequestRef = useRef(0);
  const hasFocusedRef = useRef(false);
  const [categoryStates, setCategoryStates] = useState<ShelfCategoryStates>({});
  const categoryStatesRef = useRef<ShelfCategoryStates>({});
  const activeCategoryRef = useRef<ProductRecommendationCategory>('all');
  const seasonalRegionCodeRef = useRef<TrendRegionCode>(DEFAULT_TREND_REGION_CODE);
  const loadedRegionCodesRef = useRef(new Map<ProductRecommendationCategory, TrendRegionCode>());
  const regionResolutionStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdsRef = useRef(new Map<ProductRecommendationCategory, number>());
  const requestSerialRef = useRef(0);
  const impressed = useRef(new Set<string>());
  const viewabilityConfig = useRef({itemVisiblePercentThreshold: 60, minimumViewTime: 700}).current;
  const impressionRef = useRef<(product: CatalogProduct, position: number) => void>(() => undefined);

  const applyServerLikedProductIds = useCallback((nextIds: Set<string>) => {
    confirmedLikedProductIdsRef.current = new Set(nextIds);
    likedProductIdsRef.current = nextIds;
    setLikedProductIds(nextIds);
  }, []);

  const applyLikedIntent = useCallback((productId: string, liked: boolean) => {
    const nextIds = new Set(likedProductIdsRef.current);
    if (liked) nextIds.add(productId);
    else nextIds.delete(productId);
    likedProductIdsRef.current = nextIds;
    setLikedProductIds(nextIds);
  }, []);

  const recordConfirmedLike = useCallback((productId: string, liked: boolean) => {
    const nextIds = new Set(confirmedLikedProductIdsRef.current);
    if (liked) nextIds.add(productId);
    else nextIds.delete(productId);
    confirmedLikedProductIdsRef.current = nextIds;
  }, []);

  const updateCategoryState = useCallback((category: ProductRecommendationCategory, next: ShelfLoadState) => {
    categoryStatesRef.current = {...categoryStatesRef.current, [category]: next};
    setCategoryStates(categoryStatesRef.current);
  }, []);

  const loadCategory = useCallback((
    category: ProductRecommendationCategory,
    regionCode: TrendRegionCode = seasonalRegionCodeRef.current,
    preserveExisting = false,
  ) => {
    const requestId = ++requestSerialRef.current;
    requestIdsRef.current.set(category, requestId);
    const existing = categoryStatesRef.current[category];
    if (!preserveExisting || !existing?.data) {
      updateCategoryState(category, {status: 'loading'});
    }
    loadShelfData(shelf, arStyleId, category, regionCode)
      .then(data => {
        if (requestIdsRef.current.get(category) === requestId) {
          if (shelf === 'seasonal') loadedRegionCodesRef.current.set(category, regionCode);
          updateCategoryState(category, {status: 'ready', data});
        }
      })
      .catch(error => {
        if (requestIdsRef.current.get(category) !== requestId) return;
        if (preserveExisting && categoryStatesRef.current[category]?.data) return;
        updateCategoryState(category, {
          status: 'error',
          message: error instanceof Error
            ? error.message
            : shelf === 'seasonal'
              ? '요즘 트렌드 제품을 불러오지 못했어요.'
              : '추천 제품을 불러오지 못했어요.',
        });
      });
  }, [arStyleId, shelf, updateCategoryState]);

  const load = useCallback(() => {
    loadCategory(activeCategory);
  }, [activeCategory, loadCategory]);

  const selectCategory = useCallback((category: ProductRecommendationCategory) => {
    activeCategoryRef.current = category;
    setActiveCategory(category);
    const loadedRegion = loadedRegionCodesRef.current.get(category);
    if (!categoryStatesRef.current[category]) {
      loadCategory(category);
    } else if (
      shelf === 'seasonal'
      && loadedRegion !== seasonalRegionCodeRef.current
    ) {
      loadCategory(category, seasonalRegionCodeRef.current, true);
    }
  }, [loadCategory, shelf]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void initializeProductEventCollection();
    categoryStatesRef.current = {};
    setCategoryStates({});
    requestIdsRef.current.clear();
    loadedRegionCodesRef.current.clear();
    seasonalRegionCodeRef.current = DEFAULT_TREND_REGION_CODE;
    activeCategoryRef.current = 'all';
    regionResolutionStartedRef.current = false;
    setActiveCategory('all');
    loadCategory('all', DEFAULT_TREND_REGION_CODE);
    return () => {
      requestSerialRef.current += 1;
      requestIdsRef.current.clear();
    };
  }, [loadCategory]);

  useEffect(() => {
    if (
      shelf !== 'seasonal'
      || regionResolutionStartedRef.current
      || !categoryStates.all
      || categoryStates.all.status === 'loading'
    ) return;
    regionResolutionStartedRef.current = true;
    void resolveTrendRegionCode().then(regionCode => {
      if (mountedRef.current && regionCode !== DEFAULT_TREND_REGION_CODE) {
        seasonalRegionCodeRef.current = regionCode;
        loadCategory(activeCategoryRef.current, regionCode, true);
      }
    });
  }, [categoryStates.all, loadCategory, shelf]);

  const state = categoryStates[activeCategory] ?? {status: 'loading' as const};

  useFocusEffect(useCallback(() => {
    let active = true;
    const requestId = ++likedProductsRequestRef.current;
    getLikedProducts().then(products => {
      if (active && likedProductsRequestRef.current === requestId) {
        applyServerLikedProductIds(new Set(products.map(product => product.id)));
      }
    }).catch(() => undefined);
    if (hasFocusedRef.current && (shelf === 'personalized' || shelf === 'cohort')) {
      loadCategory(activeCategoryRef.current, seasonalRegionCodeRef.current, true);
    } else {
      hasFocusedRef.current = true;
    }
    return () => {
      active = false;
      if (likedProductsRequestRef.current === requestId) {
        likedProductsRequestRef.current += 1;
      }
    };
  }, [applyServerLikedProductIds, loadCategory, shelf]));

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
  const initialNickname = initialTitle?.match(/^(.+?)님/)?.[1]?.trim() || '회원';
  const recommendationData = state.data ? {
    status: state.data.status,
    runId: state.data.runId,
    title: state.data.title,
    description: state.data.description,
    cohortSizeBand: state.data.cohortSizeBand ?? undefined,
    personalizationStatus: state.data.personalizationStatus,
    cohortStatus: state.data.cohortStatus,
    fallback: state.data.fallback,
    items: state.data.items,
  } : undefined;
  const suppliedTitle = shelf === 'seasonal'
    ? SHELF_DEFAULTS.seasonal.title
    : initialTitle?.trim() || defaults.title;
  const title = shelf === 'personalized'
    ? personalizedRecommendationTitle(recommendationData, initialTitle?.trim() || defaults.title)
    : shelf === 'cohort'
      ? cohortRecommendationTitle(recommendationData, initialNickname, initialTitle?.trim() || defaults.title)
      : suppliedTitle;
  const description = shelf === 'cohort' && state.data?.cohortSizeBand
    ? SHELF_DEFAULTS.cohort.description
    : state.data?.description?.trim() || defaults.description;

  const queueShelfEvent = useCallback((eventType: 'impression' | 'product_open', product: CatalogProduct, position: number) => {
    const data = state.data;
    if (!data) return;
    const isSignedRunSection = shelf === 'ar' || shelf === 'personalized';
    const isUnsignedFallback = isSignedRunSection
      && (!data.runId || !product.exposureToken)
      && Boolean(data.fallback);
    if (isSignedRunSection && !isUnsignedFallback && (!data.runId || !product.exposureToken)) return;
    const isExternalSeasonal = shelf === 'seasonal' && Boolean(product.externalSource);
    if (shelf === 'seasonal' && data.liveCollection && !isExternalSeasonal) return;
    if (shelf === 'seasonal' && !isExternalSeasonal && !data.liveCollection && !data.collectionId) return;
    const fallbackSource = shelf === 'ar' ? 'ar_fallback' : 'personalized_fallback';
    const eventSource = isExternalSeasonal
      ? data.liveCollection ? 'seasonal_live' : 'seasonal_supplement'
      : isUnsignedFallback
        ? fallbackSource
        : undefined;
    queueProductEvent({
      eventType,
      section: isExternalSeasonal || isUnsignedFallback ? 'legacy' : shelf,
      ...productEventIdentity(product),
      runId: isUnsignedFallback ? undefined : data.runId ?? undefined,
      exposureToken: isUnsignedFallback ? undefined : product.exposureToken,
      collectionId: shelf === 'seasonal' && !isExternalSeasonal && !data.liveCollection ? data.collectionId ?? undefined : undefined,
      position,
      context: eventType === 'impression'
        ? {screen: 'product_shelf', category: activeCategory, source: eventSource, viewportRatio: 0.6, visibleMs: 700}
        : {screen: 'product_shelf', category: activeCategory, source: eventSource},
    });
  }, [activeCategory, shelf, state.data]);
  impressionRef.current = (product, position) => queueShelfEvent('impression', product, position);

  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: Array<ViewToken<CatalogProduct>>}) => {
      viewableItems.forEach(token => {
        if (!token.isViewable || !token.item || token.index === null) return;
        const key = `${token.item.externalSource ?? 'catalog'}:${token.item.productId}:${token.item.shadeId ?? 'family'}`;
        if (impressed.current.has(key)) return;
        impressed.current.add(key);
        impressionRef.current(token.item, token.index);
      });
    },
  ).current;

  const toggleLike = async (product: CatalogProduct) => {
    if (product.canLike === false) return;
    const productKey = `${product.externalSource ?? 'catalog'}:${product.productId}`;
    const wasLiked = likedProductIdsRef.current.has(product.productId);
    const nextLiked = !wasLiked;
    const intentVersion = (productLikeIntentVersionsRef.current.get(productKey) ?? 0) + 1;
    productLikeIntentVersionsRef.current.set(productKey, intentVersion);
    likedProductsRequestRef.current += 1;
    applyLikedIntent(product.productId, nextLiked);
    try {
      if (wasLiked) await unlikeProduct(product.productId, product.externalSource);
      else {
        if (product.externalSource) await likeExternalProduct(product.productId, product.externalSource);
        else await likeProduct(product.productId, product.shadeId);
      }
      recordConfirmedLike(product.productId, nextLiked);
      if (!mountedRef.current) return;
      if (productLikeIntentVersionsRef.current.get(productKey) !== intentVersion) return;
      if (nextLiked) {
        showToast('좋아요한 제품에 저장했어요', onOpenLikedProducts
          ? {label: '보기', onPress: onOpenLikedProducts}
          : undefined);
      }
      if (shelf === 'personalized' || shelf === 'cohort') {
        loadCategory(activeCategoryRef.current, seasonalRegionCodeRef.current, true);
      }
    } catch {
      if (!mountedRef.current) return;
      if (productLikeIntentVersionsRef.current.get(productKey) !== intentVersion) return;
      applyLikedIntent(
        product.productId,
        confirmedLikedProductIdsRef.current.has(product.productId),
      );
      if (shelf === 'personalized' || shelf === 'cohort') {
        loadCategory(activeCategoryRef.current, seasonalRegionCodeRef.current, true);
      }
      showToast('좋아요를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (productLikeIntentVersionsRef.current.get(productKey) === intentVersion) {
        productLikeIntentVersionsRef.current.delete(productKey);
      }
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

  const activeCategoryLabel = productShelfCategoryLabel(activeCategory);
  const basisStatus = shelf === 'personalized'
    ? state.data?.personalizationStatus ?? state.data?.status
    : shelf === 'cohort'
      ? state.data?.cohortStatus ?? state.data?.status
      : state.data?.status;
  const unavailable = unavailableMessage(shelf, basisStatus);
  const empty = activeCategory === 'all' || ['personalizationOff', 'control'].includes(basisStatus ?? '')
    ? unavailable
    : `${activeCategoryLabel}에서 보여드릴 추천 상품을 준비하고 있어요.`;

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {shelf === 'seasonal' && (state.data?.regionLabel || state.data?.weatherSummary) ? <Text style={styles.evidence}>{[state.data.regionLabel, state.data.weatherSummary].filter(Boolean).join(' · ')}</Text> : null}
        {shelf === 'seasonal' && state.data?.freshnessStatus === 'stale' ? <Text accessibilityLiveRegion="polite" style={styles.evidence}>최근 확인된 트렌드 제품이에요. 새 신호를 확인하고 있어요.</Text> : null}
        {shelf === 'cohort' && state.data?.cohortSizeBand ? <Text style={styles.evidence}>{cohortSizeEvidenceCopy(state.data.cohortSizeBand)}</Text> : null}
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
              onPress={() => selectCategory(tab.id)}
              style={selected ? styles.tabSelected : styles.tab}>
              <Text style={selected ? styles.tabTextSelected : styles.tabText}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.countRow}>
        <Text style={styles.count}>{state.status === 'ready' ? `${activeCategoryLabel} · ${visibleItems.length}개` : activeCategoryLabel}</Text>
      </View>
      <FlatList
        columnWrapperStyle={visibleItems.length ? styles.grid : undefined}
        contentContainerStyle={[styles.content, {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl}]}
        data={state.status === 'ready' ? visibleItems : []}
        initialNumToRender={6}
        keyExtractor={item => `${item.externalSource ?? 'catalog'}:${item.productId}:${item.shadeId ?? 'family'}`}
        ListEmptyComponent={state.status === 'loading'
          ? <RecommendationGridPlaceholder />
          : state.status === 'error'
            ? <RecommendationSectionState kind="error" message={state.message ?? (shelf === 'seasonal' ? '요즘 트렌드 제품을 불러오지 못했어요.' : '추천 제품을 불러오지 못했어요.')} actionLabel="다시 시도" onAction={load} />
            : <RecommendationSectionState kind="empty" message={empty} />}
        numColumns={2}
        onViewableItemsChanged={onViewableItemsChanged}
        maxToRenderPerBatch={6}
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
        style={styles.list}
        updateCellsBatchingPeriod={40}
        viewabilityConfig={viewabilityConfig}
        windowSize={5}
      />
      {toast}
    </View>
  );
}

function RecommendationGridPlaceholder() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.placeholderGrid}>
      {[0, 1, 2, 3].map(index => (
        <View key={index} style={styles.placeholderCard}>
          <View style={styles.placeholderImage} />
          <View style={styles.placeholderBrand} />
          <View style={styles.placeholderName} />
          <View style={styles.placeholderPrice} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {backgroundColor: colors.background, flex: 1, minHeight: 0},
  intro: {gap: spacing.xs, paddingBottom: spacing.md, paddingHorizontal: spacing.screenX, paddingTop: spacing.lg},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  evidence: {...typography.caption, color: colors.textTertiary},
  tabs: {gap: spacing.xs, paddingHorizontal: spacing.screenX},
  tabScroller: {backgroundColor: colors.background, flexGrow: 0, height: 44, zIndex: 1},
  tab: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  tabSelected: {alignItems: 'center', backgroundColor: colors.black, borderColor: colors.black, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  tabText: {color: colors.textSecondary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  tabTextSelected: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  countRow: {gap: spacing.xs, paddingHorizontal: spacing.screenX, paddingVertical: spacing.md},
  count: {...typography.caption, color: colors.textSecondary},
  placeholderGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, width: '100%'},
  placeholderCard: {gap: spacing.xs, width: '46%'},
  placeholderImage: {aspectRatio: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, width: '100%'},
  placeholderBrand: {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 10, width: 64},
  placeholderName: {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 14, width: '88%'},
  placeholderPrice: {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 12, width: 88},
  content: {flexGrow: 1, gap: spacing.xl, paddingHorizontal: spacing.screenX, paddingTop: spacing.sm},
  grid: {gap: spacing.md},
  list: {flex: 1, minHeight: 0},
});
