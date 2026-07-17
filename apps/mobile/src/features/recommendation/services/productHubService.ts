import {
  getProductBackendApiBaseUrl,
  requestProductBackendJson,
} from '../../../shared/services/productBackendApi';
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
const SEASONAL_CACHE_TTL_MS = 120_000;
const seasonalResponseCache = new Map<string, {data: SeasonalRecommendationData; expiresAt: number}>();
const seasonalRequests = new Map<string, Promise<SeasonalRecommendationData>>();

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
  const params = new URLSearchParams({
    regions: category ?? 'base,brow,shadow,liner,cheek,lip',
    per_region_limit: String(Math.min(20, Math.max(1, perRegionLimit))),
  });
  if (styleId) params.set('style_id', styleId);
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
      Math.min(60, perRegionLimit * regions.length),
      category,
    );
    const groups = regions.map(region => {
      const items = seasonal.items
        .filter(product => product.category === region)
        .slice(0, perRegionLimit)
        .map(markAsPopularFallback);
      return {
        region,
        label: regionLabels[region],
        status: items.length > 0 ? 'ready' as const : 'noEligibleProducts' as const,
        items,
      };
    });

    return {
      status: groups.some(group => group.items.length > 0) ? 'ready' : 'unavailable',
      fallback: {
        type: 'popular',
        reason: 'DATABASE_NOT_CONFIGURED',
        categories: regions,
        popularCoverage: groups.some(group => group.items.length > 0),
      },
      groups,
    };
  }
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
  const params = new URLSearchParams({
    locale: 'ko-KR',
    limit: String(Math.min(60, Math.max(1, limit))),
    regionCode: normalizeTrendRegionCode(regionCode),
  });
  if (category) params.set('category', category);
  const requestPath = `/products/recommendations/seasonal?${params.toString()}`;
  const cached = seasonalResponseCache.get(requestPath);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = seasonalRequests.get(requestPath);
  if (pending) return pending;
  const request = requestProductBackendJson<SeasonalRecommendationData>(requestPath)
    .then(data => {
      const normalized = normalizeSeasonalRecommendationData(data);
      if (seasonalResponseCache.size >= 20) seasonalResponseCache.clear();
      seasonalResponseCache.set(requestPath, {
        data: normalized,
        expiresAt: Date.now() + SEASONAL_CACHE_TTL_MS,
      });
      return normalized;
    })
    .finally(() => seasonalRequests.delete(requestPath));
  seasonalRequests.set(requestPath, request);
  return request;
}

export async function getPersonalizedRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<PersonalizedRecommendationData> {
  requireBackend();
  const params = new URLSearchParams({limit: String(Math.min(60, Math.max(1, limit)))});
  if (category) params.set('category', category);
  try {
    const data = await requestProductBackendJson<PersonalizedRecommendationData>(
      `/products/recommendations/personalized?${params.toString()}`,
    );
    return normalizePersonalizedRecommendationData(data);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const seasonal = await getSeasonalRecommendations(undefined, limit, category);
    return {
      status: seasonal.items.length > 0 ? 'ready' : 'unavailable',
      personalizationStatus: 'unavailable',
      title: '지금 많이 찾는 추천제품',
      description: '개인화 추천을 연결하는 동안 인기 제품을 먼저 보여드려요.',
      fallback: {type: 'popular', reason: 'DATABASE_NOT_CONFIGURED'},
      items: seasonal.items.map(markAsPopularFallback),
    };
  }
}

export async function getCohortRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<PersonalizedRecommendationData> {
  requireBackend();
  const params = new URLSearchParams({limit: String(Math.min(60, Math.max(1, limit)))});
  if (category) params.set('category', category);
  try {
    const data = await requestProductBackendJson<PersonalizedRecommendationData>(
      `/products/recommendations/cohort?${params.toString()}`,
    );
    return normalizePersonalizedRecommendationData(data);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const seasonal = await getSeasonalRecommendations(undefined, limit, category);
    return {
      status: seasonal.items.length > 0 ? 'ready' : 'unavailable',
      cohortStatus: 'unavailable',
      description: '컬러 취향 추천을 연결하는 동안 인기 제품을 먼저 보여드려요.',
      fallback: {type: 'popular', reason: 'DATABASE_NOT_CONFIGURED'},
      items: seasonal.items.map(markAsPopularFallback),
    };
  }
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
