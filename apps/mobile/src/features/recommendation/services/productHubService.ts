import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import type {
  ArRecommendationData,
  CatalogProduct,
  PersonalizedRecommendationData,
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

export async function getArRecommendations(styleId?: string | null): Promise<ArRecommendationData> {
  requireBackend();
  const params = new URLSearchParams({regions: 'lip,cheek,liner', per_region_limit: '6'});
  if (styleId) params.set('style_id', styleId);
  return requestBackendJson(`/products/recommendations/ar?${params.toString()}`);
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

export async function getSeasonalRecommendations(entryKey?: number): Promise<SeasonalRecommendationData> {
  if (!getBackendApiBaseUrl()) {
    return {status: 'unavailable', collection: null, items: []};
  }
  const params = new URLSearchParams({locale: 'ko-KR', limit: '12'});
  if (entryKey !== undefined) params.set('entry', String(entryKey));
  return requestBackendJson(`/products/recommendations/seasonal?${params.toString()}`);
}

export async function getPersonalizedRecommendations(): Promise<PersonalizedRecommendationData> {
  requireBackend();
  return requestBackendJson('/products/recommendations/personalized?limit=12');
}

export async function getCohortRecommendations(): Promise<PersonalizedRecommendationData> {
  requireBackend();
  return requestBackendJson('/products/recommendations/cohort?limit=12');
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
