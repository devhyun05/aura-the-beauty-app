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
import {mapCandidate} from './auradinSearchService';
import type {AuradinCandidateProduct} from '../types';

// dev 머지: 레거시 /products/{id}/like는 UUID 전용이 됐고, Auradin catalogItemId(non-UUID)는
// dev의 external-product like 경로를 탄다. external_source='auradin_catalog'로 like하면 백엔드가
// resolve_auradin_catalog_product로 활성 스냅샷 카탈로그에서 상품을 조회하므로 payload가 불필요하다.
// (services/backend/app/api/products.py: /products/external/{source}/{id}/like)
const AURADIN_CATALOG_SOURCE = 'auradin_catalog';

// 후보의 출처로 external_source를 정한다 — 큐레이션 카탈로그 픽은 auradin_catalog,
// 라이브 발견 픽은 auradin_search. 백엔드가 각각 해당 소스로 상품을 resolve한다.
function likeSourceFor(product: AuradinCandidateProduct): string {
  return product.externalSource || AURADIN_CATALOG_SOURCE;
}

function auradinLikePath(productId: string, source: string): string {
  return `/products/external/${encodeURIComponent(source)}/${encodeURIComponent(productId)}/like`;
}

// 서버 찜 반영 — 실패는 조용히 (보관함 UX는 로컬 상태가 즉답, 서버는 영속화 계층).
export async function persistAuradinSave(product: AuradinCandidateProduct): Promise<void> {
  if (!getBackendApiBaseUrl()) {
    return;
  }

  try {
    await requestBackendJson(auradinLikePath(product.id, likeSourceFor(product)), {method: 'POST'});
  } catch (error) {
    console.info('[aura:auradin] save:persist-failed', {
      id: product.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function removeAuradinSave(
  productId: string,
  externalSource?: string | null,
): Promise<void> {
  if (!getBackendApiBaseUrl()) {
    return;
  }

  try {
    await requestBackendJson(
      auradinLikePath(productId, externalSource || AURADIN_CATALOG_SOURCE),
      {method: 'DELETE'},
    );
  } catch (error) {
    console.info('[aura:auradin] save:remove-failed', {
      id: productId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// /products/liked 응답 행. dev 머지: 외부 제품 스냅샷은 productId(id 아님) + 객체형 price
// (_map_external_like_snapshot). 레거시 UUID 제품은 id + 숫자 price라 양쪽을 느슨하게 수용한다.
type BackendLikedRow = {
  id?: string | null;
  productId?: string | null;
  brandName?: string | null;
  productName?: string | null;
  shadeName?: string | null;
  category?: string | null;
  matchRate?: number | null;
  price?: number | {amount?: number | null; currency?: string | null} | null;
  tags?: string[] | null;
  palette?: string[] | null;
  imageUrl?: string | null;
  purchaseUrl?: string | null;
  reason?: string | null;
  externalSource?: string | null;
  status?: string | null;
};

function likedRowPrice(price: BackendLikedRow['price']): number | null {
  if (typeof price === 'number') {
    return price;
  }
  return typeof price?.amount === 'number' ? price.amount : null;
}

// 찜 행 → 화면 소비 타입. external 스냅샷의 productId·객체형 price·source를 흡수한다.
export function mapLikedRowToCandidate(row: BackendLikedRow): AuradinCandidateProduct | null {
  const id = row.id || row.productId;
  // 판매처 스냅샷이 안전하지 않아 unavailable로 내려온 행은 복원에서 제외.
  if (!id || !row.productName || row.status === 'unavailable') {
    return null;
  }

  return mapCandidate({
    id,
    brandName: row.brandName,
    productName: row.productName,
    shadeName: row.shadeName,
    category: row.category,
    matchRate: row.matchRate,
    price: likedRowPrice(row.price),
    tags: row.tags,
    palette: row.palette,
    imageUrl: row.imageUrl,
    purchaseUrl: row.purchaseUrl,
    externalSource: row.externalSource ?? null,
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
