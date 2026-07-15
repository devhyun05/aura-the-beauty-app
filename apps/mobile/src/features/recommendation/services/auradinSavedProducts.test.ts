// 보관함 서버 영속화 어댑터 단위 검증 (프로젝트 관례: expectEqual + tsc --noEmit 게이트).
// R1 게이트 1 — dev 머지 후 Auradin catalogItemId(비-UUID)는 external-product like 경로
// (/products/external/auradin_catalog/{id}/like)를 타고, /products/liked 행이 화면 소비
// 타입으로 복원되는지 확인한다. 상품 payload는 백엔드가 활성 카탈로그에서 resolve하므로 불요.

import {mapLikedRowToCandidate} from './auradinSavedProducts';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

// --- /products/liked 행 → 화면 소비 타입 복원 (재마운트 dedup은 external_key=id 기준) ---
const restored = mapLikedRowToCandidate({
  id: 'auradin-lip-0007',
  brandName: '롬앤',
  productName: '쥬시 래스팅 틴트',
  shadeName: '베어 그레이프',
  category: 'lip',
  matchRate: 88,
  price: 9900,
  tags: ['쿨톤', '매트'],
  palette: ['#B95E76'],
  imageUrl: 'https://example.com/tint.jpg',
  purchaseUrl: 'https://example.com/buy/auradin-lip-0007',
  reason: '쿨톤 보고서 조건과 맞아요.',
});

if (!restored) {
  throw new Error('liked row should map to a candidate');
}
expectEqual(restored.id, 'auradin-lip-0007', 'restored id matches catalogItemId');
expectEqual(restored.priceText, '9,900원', 'restored price text');
expectEqual(restored.priceKrw, 9900, 'restored numeric price');
expectEqual(restored.reasonCopy, '쿨톤 보고서 조건과 맞아요.', 'restored reason copy');
expectEqual(restored.matchRate, 88, 'restored matchRate');

// 필수 필드(id/productName) 없는 행은 버린다
expectEqual(
  mapLikedRowToCandidate({id: null, productName: '이름만'}),
  null,
  'row without id is dropped',
);
expectEqual(
  mapLikedRowToCandidate({id: 'x-1', productName: ''}),
  null,
  'row without product name is dropped',
);

console.log('auradinSavedProducts contract assertions passed');
