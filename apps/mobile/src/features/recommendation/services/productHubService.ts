import {
  getProductBackendApiBaseUrl,
  requestProductBackendJson,
} from '../../../shared/services/productBackendApi';
import {getProductPreferenceMutationRevision} from '../../../shared/services/productService';
import type {
  ArRecommendationData,
  CatalogProduct,
  PersonalizedRecommendationData,
  ProductRecommendationCategory,
  ProductRecommendationFeatureFlags,
  ProductSearchData,
  SeasonalRecommendationData,
} from '../types';
import {
  DEFAULT_TREND_REGION_CODE,
  normalizeTrendRegionCode,
  type TrendRegionCode,
} from './trendRegionService';

const disabledFlags: ProductRecommendationFeatureFlags = {
  productHubV2: true,
  seasonalRecommendationsV1: false,
  arRecipePersistenceV1: false,
  arProductRecommendationsV1: false,
  engagementPersonalizationV1: false,
  cohortRecommendationsV1: false,
  legacyNaverProductSearch: false,
  naverShoppingInsightEnabled: false,
};
export const PRODUCT_HUB_CACHE_TTL_MS = 30_000;
export const PRODUCT_HUB_STALE_TTL_MS = 5 * 60_000;
const PRODUCT_HUB_CACHE_MAX_ENTRIES = 20;
const SEASONAL_CACHE_TTL_MS = 120_000;
const seasonalResponseCache = new Map<string, {data: SeasonalRecommendationData; expiresAt: number}>();
const seasonalRequests = new Map<string, Promise<SeasonalRecommendationData>>();

type ProductHubCacheEntry<T> = {
  cachedAt: number;
  data: T;
};

const arResponseCache = new Map<string, ProductHubCacheEntry<ArRecommendationData>>();
const arRequests = new Map<string, Promise<ArRecommendationData>>();
const personalizedResponseCache = new Map<string, ProductHubCacheEntry<PersonalizedRecommendationData>>();
const personalizedRequests = new Map<string, Promise<PersonalizedRecommendationData>>();
const cohortResponseCache = new Map<string, ProductHubCacheEntry<PersonalizedRecommendationData>>();
const cohortRequests = new Map<string, Promise<PersonalizedRecommendationData>>();
let arCacheGeneration = 0;
let seasonalCacheGeneration = 0;
let personalizedCacheGeneration = 0;
let cohortCacheGeneration = 0;
let observedPreferenceMutationRevision = getProductPreferenceMutationRevision();

export type SavedArLookOption = {
  id: string;
  title: string;
  savedAt?: string | null;
};

const regionLabels: Record<Exclude<ProductRecommendationCategory, 'all'>, string> = {
  base: '베이스',
  brow: '브로우',
  cheek: '치크',
  liner: '아이라이너',
  lip: '립',
  shadow: '아이섀도우',
};

function readRecommendationCache<T>(
  cache: Map<string, ProductHubCacheEntry<T>>,
  key: string,
  maxAgeMs: number,
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeRecommendationCache<T>(
  cache: Map<string, ProductHubCacheEntry<T>>,
  key: string,
  data: T,
): void {
  if (cache.size >= PRODUCT_HUB_CACHE_MAX_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.delete(key);
  cache.set(key, {cachedAt: Date.now(), data});
}

function arRecommendationCacheKey(
  styleId: string | null | undefined,
  perRegionLimit: number,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): string {
  return `${styleId ?? 'latest'}:${perRegionLimit}:${category ?? 'all'}`;
}

function preferenceRecommendationCacheKey(
  limit: number,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): string {
  return `${limit}:${category ?? 'all'}`;
}

function seasonalRecommendationRequestPath(
  limit: number,
  category: Exclude<ProductRecommendationCategory, 'all'> | undefined,
  regionCode: TrendRegionCode,
): string {
  const params = new URLSearchParams({
    locale: 'ko-KR',
    limit: String(Math.min(60, Math.max(1, limit))),
    regionCode: normalizeTrendRegionCode(regionCode),
  });
  if (category) params.set('category', category);
  return `/products/recommendations/seasonal?${params.toString()}`;
}

function synchronizePreferenceMutationRevision(): void {
  const revision = getProductPreferenceMutationRevision();
  if (revision === observedPreferenceMutationRevision) return;
  observedPreferenceMutationRevision = revision;
  invalidatePreferenceRecommendationCache();
}

export function peekArRecommendations(
  styleId?: string | null,
  perRegionLimit = 6,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): ArRecommendationData | null {
  return readRecommendationCache(
    arResponseCache,
    arRecommendationCacheKey(styleId, perRegionLimit, category),
    PRODUCT_HUB_STALE_TTL_MS,
  );
}

export function peekPersonalizedRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): PersonalizedRecommendationData | null {
  synchronizePreferenceMutationRevision();
  return readRecommendationCache(
    personalizedResponseCache,
    preferenceRecommendationCacheKey(limit, category),
    PRODUCT_HUB_STALE_TTL_MS,
  );
}

export function peekCohortRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): PersonalizedRecommendationData | null {
  synchronizePreferenceMutationRevision();
  return readRecommendationCache(
    cohortResponseCache,
    preferenceRecommendationCacheKey(limit, category),
    PRODUCT_HUB_STALE_TTL_MS,
  );
}

export function peekSeasonalRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
  regionCode: TrendRegionCode = DEFAULT_TREND_REGION_CODE,
): SeasonalRecommendationData | null {
  const cached = seasonalResponseCache.get(
    seasonalRecommendationRequestPath(limit, category, regionCode),
  );
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    seasonalResponseCache.delete(
      seasonalRecommendationRequestPath(limit, category, regionCode),
    );
    return null;
  }
  return cached.data;
}

export function invalidatePreferenceRecommendationCache(): void {
  observedPreferenceMutationRevision = getProductPreferenceMutationRevision();
  personalizedCacheGeneration += 1;
  cohortCacheGeneration += 1;
  personalizedResponseCache.clear();
  cohortResponseCache.clear();
  personalizedRequests.clear();
  cohortRequests.clear();
}

export function clearProductHubRecommendationCache(): void {
  arCacheGeneration += 1;
  seasonalCacheGeneration += 1;
  arResponseCache.clear();
  arRequests.clear();
  invalidatePreferenceRecommendationCache();
  seasonalResponseCache.clear();
  seasonalRequests.clear();
}

function isDatabaseUnavailable(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'DATABASE_NOT_CONFIGURED',
  );
}

function markAsPopularFallback(product: CatalogProduct): CatalogProduct {
  return {
    ...product,
    reasonCodes: Array.from(new Set([...(product.reasonCodes ?? []), 'POPULAR_FALLBACK'])),
  };
}

function requireBackend(): void {
  if (!getProductBackendApiBaseUrl()) {
    throw new Error('제품 카탈로그 서버가 연결되지 않았어요.');
  }
}

/**
 * A recommendation endpoint may explain why personalization was unavailable
 * while still supplying catalog-grounded popular products.  Product presence
 * wins for rendering; titles, descriptions, and recommendation evidence stay
 * attached so the UI can explain why a fallback is being shown.
 */
export function normalizeArRecommendationData(
  data: ArRecommendationData,
): ArRecommendationData {
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const hasProducts = groups.some(group => group.items.length > 0);
  if (!hasProducts) return {...data, groups};

  return {
    ...data,
    status: 'ready',
    groups: groups.map(group => group.items.length > 0
      ? {...group, status: 'ready'}
      : group),
  };
}

export function normalizeSeasonalRecommendationData(
  data: SeasonalRecommendationData,
): SeasonalRecommendationData {
  const items = Array.isArray(data.items) ? data.items : [];
  return items.length > 0 && data.status !== 'ready'
    ? {...data, status: 'ready', items}
    : {...data, items};
}

export function normalizePersonalizedRecommendationData(
  data: PersonalizedRecommendationData,
): PersonalizedRecommendationData {
  const items = Array.isArray(data.items) ? data.items : [];
  return items.length > 0 && data.status !== 'ready'
    ? {...data, status: 'ready', items}
    : {...data, items};
}

export async function getProductRecommendationFeatures(): Promise<{
  flags: ProductRecommendationFeatureFlags;
  catalogConfigured: boolean;
  externalDataReady: boolean;
}> {
  if (!getProductBackendApiBaseUrl()) {
    return {flags: disabledFlags, catalogConfigured: false, externalDataReady: false};
  }
  return requestProductBackendJson('/products/features');
}

export async function getArRecommendations(
  styleId?: string | null,
  perRegionLimit = 6,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<ArRecommendationData> {
  requireBackend();
  const normalizedLimit = Math.min(20, Math.max(1, perRegionLimit));
  const cacheKey = arRecommendationCacheKey(styleId, normalizedLimit, category);
  const cached = readRecommendationCache(
    arResponseCache,
    cacheKey,
    PRODUCT_HUB_CACHE_TTL_MS,
  );
  if (cached) return cached;
  const pending = arRequests.get(cacheKey);
  if (pending) return pending;
  const generation = arCacheGeneration;
  const params = new URLSearchParams({
    regions: category ?? 'base,brow,shadow,liner,cheek,lip',
    per_region_limit: String(normalizedLimit),
  });
  if (styleId) params.set('style_id', styleId);
  const request = (async () => {
    try {
      const data = await requestProductBackendJson<ArRecommendationData>(
        `/products/recommendations/ar?${params.toString()}`,
      );
      return normalizeArRecommendationData(data);
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;

      const regions = (category
        ? [category]
        : ['base', 'brow', 'shadow', 'liner', 'cheek', 'lip']) as Array<
          Exclude<ProductRecommendationCategory, 'all'>
        >;
      const seasonal = await getSeasonalRecommendations(
        undefined,
        Math.min(60, normalizedLimit * regions.length),
        category,
      );
      const groups = regions.map(region => {
        const items = seasonal.items
          .filter(product => product.category === region)
          .slice(0, normalizedLimit)
          .map(markAsPopularFallback);
        return {
          region,
          label: regionLabels[region],
          status: items.length > 0 ? 'ready' as const : 'noEligibleProducts' as const,
          items,
        };
      });

      return {
        status: groups.some(group => group.items.length > 0) ? 'ready' as const : 'unavailable' as const,
        fallback: {
          type: 'popular',
          reason: 'DATABASE_NOT_CONFIGURED',
          categories: regions,
          popularCoverage: groups.some(group => group.items.length > 0),
        },
        groups,
      };
    }
  })().then(data => {
    if (generation === arCacheGeneration) {
      writeRecommendationCache(arResponseCache, cacheKey, data);
    }
    return data;
  });
  arRequests.set(cacheKey, request);
  const clearPending = () => {
    if (arRequests.get(cacheKey) === request) arRequests.delete(cacheKey);
  };
  void request.then(clearPending, clearPending);
  return request;
}

export async function getSavedArLookOptions(): Promise<SavedArLookOption[]> {
  requireBackend();
  const response = await requestProductBackendJson<{
    styles?: Array<{
      id?: string | null;
      title?: string | null;
      savedAt?: string | null;
      stylePayload?: {schemaVersion?: string | null} | null;
    }>;
  }>('/makeup-styles');
  return (response.styles ?? [])
    .filter(style => style.stylePayload?.schemaVersion === 'saved_ar_look_v1' && style.id)
    .map(style => ({
      id: String(style.id),
      title: String(style.title || '저장한 AR 메이크업 룩'),
      savedAt: style.savedAt,
    }));
}

export async function getSeasonalRecommendations(
  _entryKey?: number,
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
  regionCode: TrendRegionCode = DEFAULT_TREND_REGION_CODE,
): Promise<SeasonalRecommendationData> {
  if (!getProductBackendApiBaseUrl()) {
    return {status: 'unavailable', collection: null, items: []};
  }
  const requestPath = seasonalRecommendationRequestPath(limit, category, regionCode);
  const cached = seasonalResponseCache.get(requestPath);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = seasonalRequests.get(requestPath);
  if (pending) return pending;
  const generation = seasonalCacheGeneration;
  const request = requestProductBackendJson<SeasonalRecommendationData>(requestPath)
    .then(data => {
      const normalized = normalizeSeasonalRecommendationData(data);
      if (generation === seasonalCacheGeneration) {
        if (seasonalResponseCache.size >= 20) seasonalResponseCache.clear();
        seasonalResponseCache.set(requestPath, {
          data: normalized,
          expiresAt: Date.now() + SEASONAL_CACHE_TTL_MS,
        });
      }
      return normalized;
    });
  seasonalRequests.set(requestPath, request);
  const clearPending = () => {
    if (seasonalRequests.get(requestPath) === request) {
      seasonalRequests.delete(requestPath);
    }
  };
  void request.then(clearPending, clearPending);
  return request;
}

export async function getPersonalizedRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<PersonalizedRecommendationData> {
  requireBackend();
  synchronizePreferenceMutationRevision();
  const normalizedLimit = Math.min(60, Math.max(1, limit));
  const cacheKey = preferenceRecommendationCacheKey(normalizedLimit, category);
  const cached = readRecommendationCache(
    personalizedResponseCache,
    cacheKey,
    PRODUCT_HUB_CACHE_TTL_MS,
  );
  if (cached) return cached;
  const pending = personalizedRequests.get(cacheKey);
  if (pending) return pending;
  const generation = personalizedCacheGeneration;
  const params = new URLSearchParams({limit: String(normalizedLimit)});
  if (category) params.set('category', category);
  const request = (async () => {
    try {
      const data = await requestProductBackendJson<PersonalizedRecommendationData>(
        `/products/recommendations/personalized?${params.toString()}`,
      );
      return normalizePersonalizedRecommendationData(data);
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      const seasonal = await getSeasonalRecommendations(undefined, normalizedLimit, category);
      return {
        status: seasonal.items.length > 0 ? 'ready' as const : 'unavailable' as const,
        personalizationStatus: 'unavailable' as const,
        title: '지금 많이 찾는 추천제품',
        description: '개인화 추천을 연결하는 동안 인기 제품을 먼저 보여드려요.',
        fallback: {type: 'popular', reason: 'DATABASE_NOT_CONFIGURED'},
        items: seasonal.items.map(markAsPopularFallback),
      };
    }
  })().then(data => {
    if (generation === personalizedCacheGeneration) {
      writeRecommendationCache(personalizedResponseCache, cacheKey, data);
    }
    return data;
  });
  personalizedRequests.set(cacheKey, request);
  const clearPending = () => {
    if (personalizedRequests.get(cacheKey) === request) personalizedRequests.delete(cacheKey);
  };
  void request.then(clearPending, clearPending);
  return request;
}

export async function getCohortRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<PersonalizedRecommendationData> {
  requireBackend();
  synchronizePreferenceMutationRevision();
  const normalizedLimit = Math.min(60, Math.max(1, limit));
  const cacheKey = preferenceRecommendationCacheKey(normalizedLimit, category);
  const cached = readRecommendationCache(
    cohortResponseCache,
    cacheKey,
    PRODUCT_HUB_CACHE_TTL_MS,
  );
  if (cached) return cached;
  const pending = cohortRequests.get(cacheKey);
  if (pending) return pending;
  const generation = cohortCacheGeneration;
  const params = new URLSearchParams({limit: String(normalizedLimit)});
  if (category) params.set('category', category);
  const request = (async () => {
    try {
      const data = await requestProductBackendJson<PersonalizedRecommendationData>(
        `/products/recommendations/cohort?${params.toString()}`,
      );
      return normalizePersonalizedRecommendationData(data);
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      const seasonal = await getSeasonalRecommendations(undefined, normalizedLimit, category);
      return {
        status: seasonal.items.length > 0 ? 'ready' as const : 'unavailable' as const,
        cohortStatus: 'unavailable' as const,
        description: '비슷한 취향 추천을 연결하는 동안 인기 제품을 먼저 보여드려요.',
        fallback: {type: 'popular', reason: 'DATABASE_NOT_CONFIGURED'},
        items: seasonal.items.map(markAsPopularFallback),
      };
    }
  })().then(data => {
    if (generation === cohortCacheGeneration) {
      writeRecommendationCache(cohortResponseCache, cacheKey, data);
    }
    return data;
  });
  cohortRequests.set(cacheKey, request);
  const clearPending = () => {
    if (cohortRequests.get(cacheKey) === request) cohortRequests.delete(cacheKey);
  };
  void request.then(clearPending, clearPending);
  return request;
}

export async function searchTrustedProducts(query: string): Promise<ProductSearchData> {
  requireBackend();
  const params = new URLSearchParams({q: query.trim(), limit: '30'});
  return requestProductBackendJson(`/products/search?${params.toString()}`);
}

export async function getTrustedProductDetail(
  productId: string,
  shadeId?: string | null,
): Promise<CatalogProduct> {
  requireBackend();
  const params = new URLSearchParams();
  if (shadeId) params.set('shade_id', shadeId);
  const query = params.toString();
  const response = await requestProductBackendJson<{product: CatalogProduct}>(
    `/products/${encodeURIComponent(productId)}${query ? `?${query}` : ''}`,
  );
  return response.product;
}

export async function openTrustedProductOffer(productId: string, offerId: string): Promise<{
  offerId: string;
  shadeId?: string | null;
  url: string;
  affiliateType: string;
  disclosureLabel?: string | null;
}> {
  requireBackend();
  return requestProductBackendJson(
    `/products/${encodeURIComponent(productId)}/offers/${encodeURIComponent(offerId)}/outbound`,
    {method: 'POST'},
  );
}

export type ProductConsentPurpose = 'engagement_personalization' | 'color_cohort';

export async function getProductConsents(): Promise<{
  purposes: Record<ProductConsentPurpose, {accepted: boolean; version?: string | null}>;
}> {
  requireBackend();
  return requestProductBackendJson('/products/consents');
}

export async function setProductConsent(purpose: ProductConsentPurpose, accepted: boolean): Promise<void> {
  requireBackend();
  await requestProductBackendJson('/products/consents', {
    method: 'PUT',
    body: {purpose, accepted, version: 'product-personalization-v1'},
  });
}

export async function deleteProductPersonalizationData(): Promise<void> {
  requireBackend();
  await requestProductBackendJson('/products/privacy/delete', {
    method: 'POST',
    body: {target: 'all_product_personalization'},
  });
}
