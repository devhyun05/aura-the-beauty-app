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
  getProductBackendApiBaseUrl,
  requestProductBackendJson,
} from '../../../shared/services/productBackendApi';
import {
  likeExternalProduct,
  likeProduct,
  unlikeProduct,
} from '../../../shared/services/productService';
import {mapCandidate} from './auradinSearchService';
import type {AuradinCandidateProduct} from '../types';

// UUID 내부 상품은 product like 경로를, Auradin 외부 상품은 source별 external 경로를 쓴다.
// 공용 productService를 재사용해 제품 전용 백엔드 override와 라우팅 규칙을 한곳에서 관리한다.

// 서버 찜 반영 — 실패는 조용히 (보관함 UX는 로컬 상태가 즉답, 서버는 영속화 계층).
export async function persistAuradinSave(product: AuradinCandidateProduct): Promise<boolean> {
  if (!getProductBackendApiBaseUrl()) {
    return false;
  }

  try {
    if (product.externalSource) {
      await likeExternalProduct(product.id, product.externalSource);
    } else {
      await likeProduct(product.id, product.shadeId);
    }
    return true;
  } catch (error) {
    console.info('[aura:auradin] save:persist-failed', {
      id: product.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function removeAuradinSave(
  productId: string,
  externalSource?: string | null,
): Promise<boolean> {
  if (!getProductBackendApiBaseUrl()) {
    return false;
  }

  try {
    await unlikeProduct(productId, externalSource);
    return true;
  } catch (error) {
    console.info('[aura:auradin] save:remove-failed', {
      id: productId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
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

  const externalSource: AuradinCandidateProduct['externalSource'] =
    row.externalSource === 'auradin_catalog' || row.externalSource === 'auradin_search'
      ? row.externalSource
      : undefined;
  if (row.externalSource && !externalSource) {
    return null;
  }

  const candidate = mapCandidate({
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
    externalSource: externalSource ?? null,
    reason: null,
    reasonCopy: row.reason ?? null,
  });

  return externalSource ? {...candidate, externalSource} : candidate;
}

// 포커스 시 보관함 복원. 백엔드 미설정은 빈 배열, 요청 실패는 호출자가 기존 상태를 유지하게 전파한다.
export async function fetchAuradinSavedProducts(): Promise<AuradinCandidateProduct[]> {
  if (!getProductBackendApiBaseUrl()) {
    return [];
  }

  try {
    const response = await requestProductBackendJson<{products?: BackendLikedRow[] | null}>(
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

    throw error;
  }
}
