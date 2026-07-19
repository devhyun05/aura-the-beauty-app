import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {InteractionManager, Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {ChevronRight, X} from 'lucide-react-native';
import {Text} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {Product} from '../../../shared/types/profile';
import {
  getArRecommendations,
  getCohortRecommendations,
  getPersonalizedRecommendations,
  getSavedArLookOptions,
  getSeasonalRecommendations,
  peekArRecommendations,
  peekCohortRecommendations,
  peekPersonalizedRecommendations,
  type SavedArLookOption,
} from '../services/productHubService';
import {
  initializeProductEventCollection,
  productEventIdentity,
  queueProductEvent,
} from '../services/productEventService';
import {
  cohortRecommendationTitle,
  cohortSizeEvidenceCopy,
  personalizedRecommendationTitle,
  recommendationNickname,
} from '../services/productRecommendationPresentation';
import {
  DEFAULT_TREND_REGION_CODE,
  getCachedTrendRegionCode,
  resolveTrendRegionCode,
  type TrendRegionCode,
} from '../services/trendRegionService';
import type {
  ArRecommendationData,
  CatalogProduct,
  PersonalizedRecommendationData,
  ProductRecommendationShelf,
  ProductRecommendationCategory,
  SeasonalRecommendationData,
} from '../types';
import {ProductRail} from './ProductRail';
import {RECOMMENDATION_RAIL_CARD_WIDTH} from './RecommendationProductCard';
import {ProductSearchBar} from './ProductSearchBar';
import {RecommendationSectionState} from './RecommendationSectionState';

type SectionLoad<T> = {status: 'loading' | 'ready' | 'error'; data?: T; message?: string};

function initialSectionLoad<T>(cached: T | null): SectionLoad<T> {
  return cached ? {status: 'ready', data: cached} : {status: 'loading'};
}

export function ProductRecommendationHubContent({
  arStyleId,
  likedProducts,
  likedProductIds,
  onCreateArLook,
  onOpenProduct,
  onOpenShelf,
  onSearch,
  onToggleLike,
  onSectionLayout,
  refreshKey = 0,
  preferenceRefreshKey = refreshKey,
}: {
  arStyleId?: string | null;
  likedProducts: Product[];
  likedProductIds: Set<string>;
  onCreateArLook: () => void;
  onOpenProduct: (product: CatalogProduct) => void;
  onOpenShelf: (shelf: ProductRecommendationShelf, title: string, arStyleId?: string | null) => void;
  onSearch: (query: string) => void;
  onToggleLike: (product: CatalogProduct) => void;
  onSectionLayout?: (section: ProductRecommendationShelf, y: number) => void;
  preferenceRefreshKey?: number;
  refreshKey?: number;
}) {
  const [ar, setAr] = useState<SectionLoad<ArRecommendationData>>(() =>
    initialSectionLoad(peekArRecommendations(arStyleId)),
  );
  const [seasonal, setSeasonal] = useState<SectionLoad<SeasonalRecommendationData>>({status: 'loading'});
  const [personalized, setPersonalized] = useState<SectionLoad<PersonalizedRecommendationData>>(() =>
    initialSectionLoad(peekPersonalizedRecommendations()),
  );
  const [cohort, setCohort] = useState<SectionLoad<PersonalizedRecommendationData>>(() =>
    initialSectionLoad(peekCohortRecommendations()),
  );
  const [activeRegion, setActiveRegion] = useState<Exclude<ProductRecommendationCategory, 'all'>>('lip');
  const [selectedArStyleId, setSelectedArStyleId] = useState<string | null>(arStyleId ?? null);
  const [lookPickerVisible, setLookPickerVisible] = useState(false);
  const [lookOptions, setLookOptions] = useState<SectionLoad<SavedArLookOption[]>>({status: 'loading'});
  const requestRefs = useRef({ar: 0, seasonal: 0, personalized: 0, cohort: 0, looks: 0});
  const seasonalRegionCodeRef = useRef<TrendRegionCode>(DEFAULT_TREND_REGION_CODE);

  useEffect(() => {setSelectedArStyleId(arStyleId ?? null);}, [arStyleId]);

  const loadAr = useCallback(() => {
    const requestId = ++requestRefs.current.ar;
    const cached = peekArRecommendations(selectedArStyleId);
    setAr(cached ? {status: 'ready', data: cached} : {status: 'loading'});
    getArRecommendations(selectedArStyleId)
      .then(data => {if (requestRefs.current.ar === requestId) setAr({status: 'ready', data});})
      .catch(error => {if (requestRefs.current.ar === requestId) setAr(current => current.data ? current : {status: 'error', message: error instanceof Error ? error.message : 'AR 추천을 불러오지 못했어요.'});});
  }, [selectedArStyleId]);
  const loadSeasonal = useCallback((regionCode: TrendRegionCode = seasonalRegionCodeRef.current) => {
    seasonalRegionCodeRef.current = regionCode;
    const requestId = ++requestRefs.current.seasonal;
    setSeasonal(current => current.data ? current : {status: 'loading'});
    return getSeasonalRecommendations(refreshKey, 12, undefined, regionCode)
      .then(data => {if (requestRefs.current.seasonal === requestId) setSeasonal({status: 'ready', data});})
      .catch(error => {if (requestRefs.current.seasonal === requestId) setSeasonal(current => current.data ? current : {status: 'error', message: error instanceof Error ? error.message : '요즘 트렌드 제품을 불러오지 못했어요.'});});
  }, [refreshKey]);
  const retrySeasonal = useCallback(() => {
    void loadSeasonal(seasonalRegionCodeRef.current);
  }, [loadSeasonal]);
  const loadPersonalized = useCallback(() => {
    const requestId = ++requestRefs.current.personalized;
    const cached = peekPersonalizedRecommendations();
    setPersonalized(current => current.data ? current : initialSectionLoad(cached));
    getPersonalizedRecommendations()
      .then(data => {if (requestRefs.current.personalized === requestId) setPersonalized({status: 'ready', data});})
      .catch(error => {if (requestRefs.current.personalized === requestId) setPersonalized(current => current.data ? current : {status: 'error', message: error instanceof Error ? error.message : '개인화 추천을 불러오지 못했어요.'});});
  }, [preferenceRefreshKey]);
  const loadCohort = useCallback(() => {
    const requestId = ++requestRefs.current.cohort;
    const cached = peekCohortRecommendations();
    setCohort(current => current.data ? current : initialSectionLoad(cached));
    getCohortRecommendations()
      .then(data => {if (requestRefs.current.cohort === requestId) setCohort({status: 'ready', data});})
      .catch(error => {if (requestRefs.current.cohort === requestId) setCohort(current => current.data ? current : {status: 'error', message: error instanceof Error ? error.message : '컬러 취향 추천을 불러오지 못했어요.'});});
  }, [preferenceRefreshKey]);
  const openLookPicker = useCallback(() => {
    const requestId = ++requestRefs.current.looks;
    setLookPickerVisible(true);
    setLookOptions({status: 'loading'});
    getSavedArLookOptions()
      .then(items => {if (requestRefs.current.looks === requestId) setLookOptions({status: 'ready', data: items});})
      .catch(error => {if (requestRefs.current.looks === requestId) setLookOptions({status: 'error', message: error instanceof Error ? error.message : '저장한 AR 룩을 불러오지 못했어요.'});});
  }, []);

  useEffect(() => {
    void initializeProductEventCollection();
    return () => {
      requestRefs.current.ar += 1;
      requestRefs.current.seasonal += 1;
      requestRefs.current.personalized += 1;
      requestRefs.current.cohort += 1;
      requestRefs.current.looks += 1;
    };
  }, []);

  useEffect(() => {
    loadAr();
  }, [loadAr]);

  useEffect(() => {
    const deferred = InteractionManager.runAfterInteractions(() => {
      loadPersonalized();
      loadCohort();
    });
    return () => deferred.cancel();
  }, [loadCohort, loadPersonalized]);

  useEffect(() => {
    let active = true;
    let deferred: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    void getCachedTrendRegionCode().then(cachedRegionCode => {
      if (!active) return;
      if (cachedRegionCode) {
        seasonalRegionCodeRef.current = cachedRegionCode;
        void loadSeasonal(cachedRegionCode);
        return;
      }
      seasonalRegionCodeRef.current = DEFAULT_TREND_REGION_CODE;
      void loadSeasonal(DEFAULT_TREND_REGION_CODE).then(() => {
        if (!active) return;
        // Paint the nationwide shelf before a first-run location permission sheet
        // can appear. Region resolution is an enhancement, never an initial gate.
        deferred = InteractionManager.runAfterInteractions(() => {
          void resolveTrendRegionCode().then(regionCode => {
            if (active && regionCode !== DEFAULT_TREND_REGION_CODE) {
              void loadSeasonal(regionCode);
            }
          });
        });
      });
    });
    return () => {
      active = false;
      deferred?.cancel();
    };
  }, [loadSeasonal]);

  const activeArGroup = useMemo(() => {
    const groups = ar.data?.groups ?? [];
    return groups.find(group => group.region === activeRegion) ?? groups.find(group => group.status === 'ready') ?? groups[0];
  }, [activeRegion, ar.data]);
  useEffect(() => {if (activeArGroup && activeArGroup.region !== activeRegion) setActiveRegion(activeArGroup.region);}, [activeArGroup, activeRegion]);
  const activeArUsesPopularFallback = Boolean(activeArGroup?.items.length)
    && activeArGroup!.items.every(item => item.reasonCodes?.includes('POPULAR_FALLBACK'));

  const nickname = recommendationNickname(personalized.data);
  const personalizedTitle = personalizedRecommendationTitle(personalized.data);
  const cohortTitle = cohortRecommendationTitle(cohort.data, nickname);
  const withLikeState = useCallback((items: CatalogProduct[]) => items.map(item => ({
    ...item,
    viewerState: {liked: item.canLike === false ? false : likedProductIds.has(item.productId)},
  })), [likedProductIds]);
  const likedFallbackItems = useMemo<CatalogProduct[]>(() => likedProducts
    .filter(product => product.status !== 'unavailable' && likedProductIds.has(product.id))
    .map(product => {
      const imageSource = product.imageSource;
      const imageUrl = imageSource && typeof imageSource === 'object' && 'uri' in imageSource
        ? String(imageSource.uri || '') || null
        : null;
      return {
        productId: product.id,
        shadeId: product.shadeId,
        brandName: product.brandName,
        productName: product.productName,
        category: 'liked',
        imageUrl,
        price: {amount: product.price, currency: 'KRW'},
        viewerState: {liked: true},
        status: product.status,
        canUnlike: product.canUnlike,
        purchaseUrl: product.purchaseUrl,
        externalSource: product.externalSource,
      };
    }), [likedProductIds, likedProducts]);

  const openArProduct = (product: CatalogProduct, position: number) => {
    if (ar.data?.runId && product.exposureToken) {
      queueProductEvent({eventType: 'product_open', section: 'ar', ...productEventIdentity(product), runId: ar.data.runId, exposureToken: product.exposureToken, position, context: {screen: 'product_hub'}});
    } else if (ar.data?.fallback) {
      queueProductEvent({eventType: 'product_open', section: 'legacy', ...productEventIdentity(product), position, context: {screen: 'product_hub', source: 'ar_fallback'}});
    }
    onOpenProduct(product);
  };
  const openSeasonalProduct = (product: CatalogProduct, position: number) => {
    if (product.externalSource) {
      queueProductEvent({eventType: 'product_open', section: 'legacy', ...productEventIdentity(product), position, context: {screen: 'product_hub', source: seasonal.data?.collection?.isLive ? 'seasonal_live' : 'seasonal_supplement'}});
    } else if (seasonal.data?.collection?.id && !seasonal.data.collection.isLive) {
      queueProductEvent({eventType: 'product_open', section: 'seasonal', ...productEventIdentity(product), collectionId: seasonal.data.collection.id, position, context: {screen: 'product_hub'}});
    }
    onOpenProduct(product);
  };

  return (
    <View style={styles.root}>
      <ProductSearchBar onSubmit={onSearch} />

      <View onLayout={event => onSectionLayout?.('ar', event.nativeEvent.layout.y)}>
        <Section title="AR 필터 기반 추천제품" onAction={() => onOpenShelf('ar', 'AR 필터 기반 추천제품', selectedArStyleId)}>
          {ar.status === 'loading' ? <RecommendationRailPlaceholder /> : null}
          {ar.status === 'error' ? <RecommendationSectionState kind="error" message={ar.message ?? 'AR 추천을 불러오지 못했어요.'} actionLabel="다시 시도" onAction={loadAr} /> : null}
          {ar.status === 'ready' && ['noArStyle', 'unavailable'].includes(ar.data?.status ?? '') ? <RecommendationSectionState kind="empty" message="저장한 AR 룩이 아직 없어요. 룩을 저장하면 색상과 피니시가 가까운 제품을 보여드려요." actionLabel="AR 룩 만들기" onAction={onCreateArLook} /> : null}
          {ar.status === 'ready' && ar.data?.status === 'unsupportedRecipe' ? <RecommendationSectionState kind="empty" message="이 룩은 이전 저장 형식이에요. AR에서 한 번만 다시 저장해 주세요." actionLabel="AR 룩 다시 저장" onAction={onCreateArLook} /> : null}
          {ar.status === 'ready' && ar.data?.status === 'noEligibleProducts' ? <RecommendationSectionState kind="empty" message="이 룩과 색상 근거가 맞는 판매 상품을 준비하고 있어요." /> : null}
          {ar.status === 'ready' && ar.data?.status === 'ready' ? <View style={styles.stack}>
            <View style={styles.metaRow}><Text numberOfLines={2} style={styles.meta}>{ar.data.basedOn?.styleTitle && !activeArUsesPopularFallback ? `${ar.data.basedOn.styleTitle}의 색상·피니시 기준` : ar.data.basedOn?.styleTitle ? `${activeArGroup?.label ?? '선택한 부위'}는 일치 상품이 부족해 인기 제품을 보여드려요.` : '저장한 룩이 없을 때는 부위별 인기 제품을 먼저 보여드려요.'}</Text>{ar.data.basedOn ? <Pressable accessibilityRole="button" onPress={openLookPicker} style={styles.inlineAction}><Text style={styles.inlineActionText}>기준 룩 변경</Text></Pressable> : <Pressable accessibilityRole="button" onPress={onCreateArLook} style={styles.inlineAction}><Text style={styles.inlineActionText}>AR 룩 만들기</Text></Pressable>}</View>
            <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>{ar.data.groups.map(group => <Pressable key={group.region} accessibilityRole="button" accessibilityState={{selected: group.region === activeRegion}} onPress={() => setActiveRegion(group.region)} style={group.region === activeRegion ? styles.chipActive : styles.chip}><Text style={group.region === activeRegion ? styles.chipTextActive : styles.chipText}>{group.label}</Text></Pressable>)}</ScrollView>
            {activeArGroup?.items.length ? <ProductRail items={withLikeState(activeArGroup.items)} onOpen={openArProduct} onToggleLike={onToggleLike} /> : <RecommendationSectionState kind="empty" message={`${activeArGroup?.label ?? '선택한 부위'}에 표시할 판매 상품이 아직 없어요.`} />}
          </View> : null}
        </Section>
      </View>

      <View onLayout={event => onSectionLayout?.('personalized', event.nativeEvent.layout.y)}>
        <Section title={personalizedTitle} onAction={() => onOpenShelf('personalized', personalizedTitle)}>
          <PersonalizedBody section="personalized" state={personalized} fallbackItems={likedFallbackItems} onRetry={loadPersonalized} likedProductIds={likedProductIds} onOpenProduct={onOpenProduct} onToggleLike={onToggleLike} />
        </Section>
      </View>

      <View onLayout={event => onSectionLayout?.('seasonal', event.nativeEvent.layout.y)}>
        <Section title="요즘 트렌드 제품" onAction={() => onOpenShelf('seasonal', '요즘 트렌드 제품')}>
          {seasonal.status === 'loading' ? <RecommendationRailPlaceholder /> : null}
          {seasonal.status === 'error' ? <RecommendationSectionState kind="error" message={seasonal.message ?? '요즘 트렌드 제품을 불러오지 못했어요.'} actionLabel="다시 시도" onAction={retrySeasonal} /> : null}
          {seasonal.status === 'ready' && (seasonal.data?.status !== 'ready' || !seasonal.data?.items.length) ? <RecommendationSectionState kind="empty" message="확인 가능한 요즘 트렌드 제품을 준비하고 있어요." actionLabel="새로고침" onAction={retrySeasonal} /> : null}
          {seasonal.status === 'ready' && seasonal.data?.status === 'ready' && seasonal.data.items.length > 0 ? <View style={styles.stack}>
            <Text style={styles.collectionTitle}>{seasonal.data.collection?.title?.replace(/시즌\s*상품/g, '요즘 트렌드 제품') ?? '지금 주목받는 트렌드 제품'}</Text>
            <Text numberOfLines={2} style={styles.summary}>{seasonal.data.collection?.summary ?? '새 트렌드 신호를 확인하는 동안 최근 반응이 좋은 제품을 먼저 보여드려요.'}</Text>
            {seasonal.data.collection?.isStale || seasonal.data.collection?.freshnessStatus === 'stale' ? <Text accessibilityLiveRegion="polite" style={styles.staleNotice}>최근 확인된 트렌드 제품이에요. 새 신호를 확인하고 있어요.</Text> : null}
            <ProductRail items={withLikeState(seasonal.data.items)} onOpen={openSeasonalProduct} onToggleLike={onToggleLike} />
            {seasonal.data.collection ? <Text numberOfLines={2} style={styles.source}>{[seasonal.data.collection.regionLabel, seasonal.data.collection.weatherSummary, seasonal.data.collection.trendWindow, seasonal.data.collection.sourceName ?? (seasonal.data.collection.providerStatus === 'popularFallback' ? '앱 내 인기' : '검증된 트렌드 수집')].filter(Boolean).join(' · ')} · 신뢰도 {Math.round((seasonal.data.collection.confidenceScore ?? 0.5) * 100)}%</Text> : null}
          </View> : null}
        </Section>
      </View>

      <View onLayout={event => onSectionLayout?.('cohort', event.nativeEvent.layout.y)}>
        <Section title={cohortTitle} onAction={() => onOpenShelf('cohort', cohortTitle)}>
          <PersonalizedBody section="cohort" state={cohort} onRetry={loadCohort} likedProductIds={likedProductIds} onOpenProduct={onOpenProduct} onToggleLike={onToggleLike} />
        </Section>
      </View>

      <Modal animationType="fade" onRequestClose={() => setLookPickerVisible(false)} transparent visible={lookPickerVisible}>
        <View accessibilityViewIsModal style={styles.modalBackdrop}><View style={styles.modalCard}><View style={styles.modalHeader}><Text accessibilityRole="header" style={styles.collectionTitle}>기준 AR 룩 변경</Text><Pressable accessibilityLabel="기준 AR 룩 선택 닫기" accessibilityRole="button" onPress={() => setLookPickerVisible(false)} style={styles.modalClose}><X color={colors.textPrimary} size={iconSize.sm} /></Pressable></View>
          {lookOptions.status === 'loading' ? <RecommendationSectionState kind="loading" message="저장한 AR 룩을 불러오는 중이에요." /> : null}
          {lookOptions.status === 'error' ? <RecommendationSectionState kind="error" message={lookOptions.message ?? '저장한 AR 룩을 불러오지 못했어요.'} actionLabel="다시 시도" onAction={openLookPicker} /> : null}
          {lookOptions.status === 'ready' && !lookOptions.data?.length ? <RecommendationSectionState kind="empty" message="선택할 수 있는 저장 AR 룩이 없어요." /> : null}
          {lookOptions.status === 'ready' && lookOptions.data?.length ? <ScrollView contentContainerStyle={styles.lookList}>{lookOptions.data.map(option => <Pressable accessibilityRole="button" accessibilityState={{selected: option.id === selectedArStyleId}} key={option.id} onPress={() => {setSelectedArStyleId(option.id); setLookPickerVisible(false);}} style={option.id === selectedArStyleId ? styles.lookOptionSelected : styles.lookOption}><Text style={styles.collectionTitle}>{option.title}</Text><Text style={styles.meta}>{option.savedAt ? formatDate(option.savedAt) : '저장 시점 확인'}</Text></Pressable>)}</ScrollView> : null}
        </View></View>
      </Modal>
    </View>
  );
}

function queuePreferenceEvent(section: 'personalized' | 'cohort', data: PersonalizedRecommendationData | undefined, eventType: 'impression' | 'product_open', product: CatalogProduct, position: number) {
  if (section === 'personalized' && (!data?.runId || !product.exposureToken)) {
    if (data?.fallback) {
      queueProductEvent({eventType, section: 'legacy', ...productEventIdentity(product), position, context: eventType === 'impression' ? {screen: 'product_hub', source: 'personalized_fallback', viewportRatio: 0.6, visibleMs: 700} : {screen: 'product_hub', source: 'personalized_fallback'}});
    }
    return;
  }
  queueProductEvent({eventType, section, ...productEventIdentity(product), runId: data?.runId ?? undefined, exposureToken: product.exposureToken, position, context: eventType === 'impression' ? {screen: 'product_hub', viewportRatio: 0.6, visibleMs: 700} : {screen: 'product_hub'}});
}

function PersonalizedBody({section, state, fallbackItems = [], onRetry, likedProductIds, onOpenProduct, onToggleLike}: {section: 'personalized' | 'cohort'; state: SectionLoad<PersonalizedRecommendationData>; fallbackItems?: CatalogProduct[]; onRetry: () => void; likedProductIds: Set<string>; onOpenProduct: (product: CatalogProduct) => void; onToggleLike: (product: CatalogProduct) => void}) {
  const minimumCohortSize = state.data?.minimumCohortSize ?? 5;
  const hasRecommendationItems = Boolean(state.data?.items.length);
  const basisStatus = section === 'personalized'
    ? state.data?.personalizationStatus ?? state.data?.status
    : state.data?.cohortStatus ?? state.data?.status;
  if (state.status === 'loading') return <RecommendationRailPlaceholder />;
  if (state.status === 'error') return <RecommendationSectionState kind="error" message={state.message ?? '추천을 불러오지 못했어요.'} actionLabel="다시 시도" onAction={onRetry} />;
  if (!hasRecommendationItems && basisStatus === 'personalizationOff') return <RecommendationSectionState kind="off" message="가입 동의 정보를 확인하지 못해 인기 상품을 준비하고 있어요." />;
  if (!hasRecommendationItems && basisStatus === 'control') return <RecommendationSectionState kind="off" message="추천 품질을 검증하는 비교 그룹이에요." />;
  if (section === 'personalized' && !hasRecommendationItems && fallbackItems.length > 0) return <View style={styles.stack}><Text style={styles.meta}>새 추천을 준비하는 동안 최근 좋아요한 제품을 보여드려요.</Text><ProductRail items={fallbackItems} onOpen={(product) => onOpenProduct(product)} onToggleLike={onToggleLike} /></View>;
  if (state.data?.status !== 'ready') return <RecommendationSectionState kind="empty" message={section === 'cohort' ? `퍼스널컬러와 제품 취향이 비슷한 사용자가 ${minimumCohortSize}명 이상 모이면 추천을 시작해요.` : '좋아요·검색·클릭 기록이 더 쌓이면 취향에 맞는 상품을 보여드려요.'} />;
  if (!hasRecommendationItems) return <RecommendationSectionState kind="empty" message={section === 'cohort' ? '나와 취향이 비슷한 사용자들이 좋아한 상품을 준비하고 있어요.' : '취향에 맞는 인기 상품을 준비하고 있어요.'} actionLabel="다시 시도" onAction={onRetry} />;
  const items = state.data.items.map(item => ({...item, viewerState: {liked: item.canLike === false ? false : likedProductIds.has(item.productId)}}));
  const impressionScopeKey = state.data.runId
    || `${section}:${state.data.cohortSizeBand ?? state.data.fallback?.reason ?? state.data.algorithmVersion ?? 'ready'}`;
  const description = section === 'cohort' && state.data.cohortSizeBand
    ? '나와 퍼스널컬러·제품 취향이 비슷한 사용자들이 좋아한 상품이에요.'
    : state.data.description;
  return <View style={styles.stack}>{description ? <Text style={styles.meta}>{description}</Text> : null}{section === 'cohort' && state.data.cohortSizeBand ? <Text style={styles.meta}>{cohortSizeEvidenceCopy(state.data.cohortSizeBand)}</Text> : null}<ProductRail impressionScopeKey={impressionScopeKey} items={items} onImpression={(product, position) => queuePreferenceEvent(section, state.data, 'impression', product, position)} onOpen={(product, position) => {queuePreferenceEvent(section, state.data, 'product_open', product, position); onOpenProduct(product);}} onToggleLike={onToggleLike} /></View>;
}

function Section({title, onAction, children}: {title: string; onAction: () => void; children: ReactNode}) {
  return <View style={styles.section}><View style={styles.header}><Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text><Pressable accessibilityRole="button" onPress={onAction} style={styles.headerAction}><Text style={styles.actionText}>더보기</Text><ChevronRight color={colors.textPrimary} size={iconSize.xs} /></Pressable></View>{children}</View>;
}

function RecommendationRailPlaceholder() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.placeholderRail}>
      {[0, 1, 2].map(index => (
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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '일자 확인' : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: {gap: 36},
  section: {gap: spacing.sm},
  header: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between'},
  title: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.bold, fontSize: 22, lineHeight: 28},
  headerAction: {alignItems: 'center', flexDirection: 'row', justifyContent: 'center', minHeight: 44, paddingLeft: spacing.sm},
  actionText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  stack: {gap: spacing.sm},
  metaRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between'},
  meta: {...typography.caption, color: colors.textSecondary, flexShrink: 1},
  inlineAction: {alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.xs},
  inlineActionText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs, textDecorationLine: 'underline'},
  collectionTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  summary: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  source: {...typography.caption, color: colors.textTertiary},
  staleNotice: {...typography.caption, color: colors.danger},
  chips: {gap: spacing.xs},
  chip: {borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  chipActive: {backgroundColor: colors.black, borderRadius: radius.pill, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  chipText: {...typography.caption, color: colors.textSecondary},
  chipTextActive: {...typography.caption, color: colors.white},
  modalBackdrop: {backgroundColor: 'rgba(0,0,0,0.42)', flex: 1, justifyContent: 'flex-end', padding: spacing.sm},
  modalCard: {backgroundColor: colors.background, borderRadius: radius.lg, gap: spacing.md, maxHeight: '72%', padding: spacing.lg},
  modalHeader: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between'},
  modalClose: {alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44},
  lookList: {gap: spacing.sm},
  lookOption: {borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, minHeight: 64, padding: spacing.md},
  lookOptionSelected: {backgroundColor: colors.surfaceMuted, borderColor: colors.textPrimary, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, minHeight: 64, padding: spacing.md},
  placeholderRail: {flexDirection: 'row', gap: spacing.sm, height: 236, overflow: 'hidden'},
  placeholderCard: {gap: spacing.xs, width: RECOMMENDATION_RAIL_CARD_WIDTH},
  placeholderImage: {backgroundColor: colors.surfaceMuted, borderRadius: radius.md, height: 148, width: RECOMMENDATION_RAIL_CARD_WIDTH},
  placeholderBrand: {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 10, width: 64},
  placeholderName: {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 14, width: 128},
  placeholderPrice: {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 12, width: 88},
});
