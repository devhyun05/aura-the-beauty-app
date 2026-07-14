// 보관함 서버 영속화 어댑터 단위 검증 (프로젝트 관례: expectEqual + tsc --noEmit 게이트).
// R1 게이트 1 — Auradin catalogItemId(비-UUID)가 레거시 like 업서트 계약 payload로
// 올바로 변환되는지, /products/liked 행이 화면 소비 타입으로 복원되는지 확인한다.

import {mapLikedRowToCandidate, toAuradinLikePayload} from './auradinSavedProducts';
import type {AuradinCandidateProduct} from '../types';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

// --- catalogItemId → like payload (external_key 업서트 경로 계약) ---
const candidate: AuradinCandidateProduct = {
  id: 'auradin-lip-0007',
  brandName: '롬앤',
  productName: '쥬시 래스팅 틴트',
  shadeName: '베어 그레이프',
  priceText: '9,900원',
  matchSummary: '쿨톤 · 매트',
  palette: ['#B95E76'],
  tags: ['쿨톤', '매트'],
  imageSource: {uri: 'https://example.com/tint.jpg'},
  matchRate: 88,
  purchaseUrl: 'https://example.com/buy/auradin-lip-0007',
  imageUrl: 'https://example.com/tint.jpg',
  category: 'lip',
  priceKrw: 9900,
  reasonCopy: '쿨톤 보고서 조건과 맞아요.',
};

const payload = toAuradinLikePayload(candidate);
expectEqual(payload.id, 'auradin-lip-0007', 'payload keeps catalogItemId as external key');
expectEqual(payload.brandName, '롬앤', 'payload brand');
expectEqual(payload.productName, '쥬시 래스팅 틴트', 'payload product name');
expectEqual(payload.price, 9900, 'payload numeric price from priceKrw');
expectEqual(payload.category, 'lip', 'payload category passthrough');
expectEqual(payload.matchRate, 88, 'payload matchRate');
expectEqual(payload.reason, '쿨톤 보고서 조건과 맞아요.', 'payload reason prefers reasonCopy');

// priceKrw 미확보 시 0으로 보수 처리 (백엔드 _parse_price 계약과 호환)
const noPricePayload = toAuradinLikePayload({...candidate, priceKrw: undefined});
expectEqual(noPricePayload.price, 0, 'payload price defaults to 0');

// reasonCopy 없으면 matchSummary로 폴백
const noCopyPayload = toAuradinLikePayload({...candidate, reasonCopy: undefined});
expectEqual(noCopyPayload.reason, '쿨톤 · 매트', 'payload reason falls back to matchSummary');

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
