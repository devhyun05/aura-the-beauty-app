// AURADIN 보관함 서버 영속화 어댑터 (R1 패리티 게이트 1 — 종합보고서 §13 R1).
//
// AuradinSearchScreen의 보관함(saved)은 화면 로컬 상태라 재마운트 시 소실됐다.
// 기존 레거시 찜 API(/products/{id}/like → user_product_likes)를 재사용해 영속화한다:
//   - Auradin catalogItemId는 UUID가 아니므로 백엔드 external_key 업서트 경로(§17.1-b)를 탄다
//     — payload에 상품 정보를 실어 보내면 products 테이블에 upsert 후 like 된다.
//   - /products/liked 목록은 external_key를 id로 되돌려주므로(_map_db_product),
//     재마운트 복원 시에도 catalogItemId 기준 dedup이 유지된다.
// 모든 호출은 best-effort — 백엔드 미설정/실패 시 화면 로컬 동작(낙관적 상태)을 해치지 않는다.

import {
  getBackendApiBaseUrl,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {
  likeProduct,
  unlikeProduct,
  type ProductLikePayload,
} from '../../../shared/services/productService';
import {mapCandidate} from './auradinSearchService';
import type {AuradinCandidateProduct} from '../types';

// 레거시 like 업서트 계약(services/backend/app/api/products.py)의 category enum.
// Auradin 6-카테고리 중 벗어나는 값은 백엔드가 'lip'으로 정규화하므로 그대로 통과시킨다.
export function toAuradinLikePayload(product: AuradinCandidateProduct): ProductLikePayload {
  return {
    id: product.id,
    brandName: product.brandName || 'AURADIN',
    productName: product.productName,
    shadeName: product.shadeName || undefined,
    category: product.category,
    price: product.priceKrw ?? 0,
    imageUrl: product.imageUrl,
    purchaseUrl: product.purchaseUrl,
    matchRate: product.matchRate,
    tags: product.tags,
    palette: product.palette,
    reason: product.reasonCopy ?? product.matchSummary,
  };
}

// 서버 찜 반영 — 실패는 조용히 (보관함 UX는 로컬 상태가 즉답, 서버는 영속화 계층).
export async function persistAuradinSave(product: AuradinCandidateProduct): Promise<void> {
  if (!getBackendApiBaseUrl()) {
    return;
  }

  try {
    await likeProduct(toAuradinLikePayload(product));
  } catch (error) {
    console.info('[aura:auradin] save:persist-failed', {
      id: product.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function removeAuradinSave(productId: string): Promise<void> {
  if (!getBackendApiBaseUrl()) {
    return;
  }

  try {
    await unlikeProduct(productId);
  } catch (error) {
    console.info('[aura:auradin] save:remove-failed', {
      id: productId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// /products/liked 응답 행(services/backend _map_db_product 계약) — 필요한 필드만 느슨하게.
type BackendLikedRow = {
  id?: string | null;
  brandName?: string | null;
  productName?: string | null;
  shadeName?: string | null;
  category?: string | null;
  matchRate?: number | null;
  price?: number | null;
  tags?: string[] | null;
  palette?: string[] | null;
  imageUrl?: string | null;
  purchaseUrl?: string | null;
  reason?: string | null;
};

// 찜 행 → 화면 소비 타입. 레거시 행의 reason은 문자열이라 reasonCopy로 옮긴다.
export function mapLikedRowToCandidate(row: BackendLikedRow): AuradinCandidateProduct | null {
  if (!row.id || !row.productName) {
    return null;
  }

  return mapCandidate({
    id: row.id,
    brandName: row.brandName,
    productName: row.productName,
    shadeName: row.shadeName,
    category: row.category,
    matchRate: row.matchRate,
    price: row.price,
    tags: row.tags,
    palette: row.palette,
    imageUrl: row.imageUrl,
    purchaseUrl: row.purchaseUrl,
    reason: null,
    reasonCopy: row.reason ?? null,
  });
}

// 재마운트 시 보관함 복원. 실패/백엔드 미설정 시 빈 배열(화면 로컬 동작 유지).
export async function fetchAuradinSavedProducts(): Promise<AuradinCandidateProduct[]> {
  if (!getBackendApiBaseUrl()) {
    return [];
  }

  try {
    const response = await requestBackendJson<{products?: BackendLikedRow[] | null}>(
      '/products/liked',
    );

    return Array.isArray(response.products)
      ? response.products
          .map(mapLikedRowToCandidate)
          .filter((product): product is AuradinCandidateProduct => Boolean(product))
      : [];
  } catch (error) {
    console.info('[aura:auradin] save:hydrate-failed', {
      message: error instanceof Error ? error.message : String(error),
    });

    return [];
  }
}
