import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import type {
  ArRecommendationData,
  CatalogProduct,
  PersonalizedRecommendationData,
  ProductRecommendationCategory,
  ProductRecommendationFeatureFlags,
  ProductSearchData,
  SeasonalRecommendationData,
} from '../types';

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

export type SavedArLookOption = {
  id: string;
  title: string;
  savedAt?: string | null;
};

function requireBackend(): void {
  if (!getBackendApiBaseUrl()) {
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
  if (!getBackendApiBaseUrl()) {
    return {flags: disabledFlags, catalogConfigured: false, externalDataReady: false};
  }
  return requestBackendJson('/products/features');
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
  const data = await requestBackendJson<ArRecommendationData>(
    `/products/recommendations/ar?${params.toString()}`,
  );
  return normalizeArRecommendationData(data);
}

export async function getSavedArLookOptions(): Promise<SavedArLookOption[]> {
  requireBackend();
  const response = await requestBackendJson<{
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
  entryKey?: number,
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<SeasonalRecommendationData> {
  if (!getBackendApiBaseUrl()) {
    return {status: 'unavailable', collection: null, items: []};
  }
  const params = new URLSearchParams({
    locale: 'ko-KR',
    limit: String(Math.min(60, Math.max(1, limit))),
  });
  if (entryKey !== undefined) params.set('entry', String(entryKey));
  if (category) params.set('category', category);
  const data = await requestBackendJson<SeasonalRecommendationData>(
    `/products/recommendations/seasonal?${params.toString()}`,
  );
  return normalizeSeasonalRecommendationData(data);
}

export async function getPersonalizedRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<PersonalizedRecommendationData> {
  requireBackend();
  const params = new URLSearchParams({limit: String(Math.min(60, Math.max(1, limit)))});
  if (category) params.set('category', category);
  const data = await requestBackendJson<PersonalizedRecommendationData>(
    `/products/recommendations/personalized?${params.toString()}`,
  );
  return normalizePersonalizedRecommendationData(data);
}

export async function getCohortRecommendations(
  limit = 12,
  category?: Exclude<ProductRecommendationCategory, 'all'>,
): Promise<PersonalizedRecommendationData> {
  requireBackend();
  const params = new URLSearchParams({limit: String(Math.min(60, Math.max(1, limit)))});
  if (category) params.set('category', category);
  const data = await requestBackendJson<PersonalizedRecommendationData>(
    `/products/recommendations/cohort?${params.toString()}`,
  );
  return normalizePersonalizedRecommendationData(data);
}

export async function searchTrustedProducts(query: string): Promise<ProductSearchData> {
  requireBackend();
  const params = new URLSearchParams({q: query.trim(), limit: '30'});
  return requestBackendJson(`/products/search?${params.toString()}`);
}

export async function getTrustedProductDetail(
  productId: string,
  shadeId?: string | null,
): Promise<CatalogProduct> {
  requireBackend();
  const params = new URLSearchParams();
  if (shadeId) params.set('shade_id', shadeId);
  const query = params.toString();
  const response = await requestBackendJson<{product: CatalogProduct}>(
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
  return requestBackendJson(
    `/products/${encodeURIComponent(productId)}/offers/${encodeURIComponent(offerId)}/outbound`,
    {method: 'POST'},
  );
}

export type ProductConsentPurpose = 'engagement_personalization' | 'color_cohort';

export async function getProductConsents(): Promise<{
  purposes: Record<ProductConsentPurpose, {accepted: boolean; version?: string | null}>;
}> {
  requireBackend();
  return requestBackendJson('/products/consents');
}

export async function setProductConsent(purpose: ProductConsentPurpose, accepted: boolean): Promise<void> {
  requireBackend();
  await requestBackendJson('/products/consents', {
    method: 'PUT',
    body: {purpose, accepted, version: 'product-personalization-v1'},
  });
}

export async function deleteProductPersonalizationData(): Promise<void> {
  requireBackend();
  await requestBackendJson('/products/privacy/delete', {
    method: 'POST',
    body: {target: 'all_product_personalization'},
  });
}
