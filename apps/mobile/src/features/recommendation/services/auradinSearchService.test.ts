// 매퍼 단위 검증 (프로젝트 관례: expectEqual + tsc --noEmit 게이트).
// 백엔드 SearchTurn → 화면 소비 타입 매핑이 role/근거/가격/스와치를 올바로 옮기는지 확인.

import {mapCandidate, mapQuestionOption, mapSearchTurn} from './auradinSearchService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

// --- 제품 매핑: role/가격/근거 관통 ---
const candidate = mapCandidate({
  id: 'auradin-anchor',
  role: 'anchor',
  source: 'curated',
  brandName: '롬앤',
  productName: '베러 댄 팔레트',
  shadeName: '샌디드 브리즈 가든',
  category: 'shadow',
  matchRate: 90,
  price: 18000,
  tags: ['쉬머'],
  palette: ['#B85E68'],
  imageUrl: 'https://example.com/p.jpg',
  purchaseUrl: 'https://example.com/buy',
  reason: {matchedOn: ['아이섀도우', '플럼'], inferred: ['쉬머 단서'], caveat: ['톤 참고용']},
  reasonCopy: '플럼 컬러 아이섀도우로 보여요.',
});

expectEqual(candidate.role, 'anchor', 'candidate role passthrough');
expectEqual(candidate.source, 'curated', 'candidate source');
expectEqual(candidate.externalSource, 'auradin_search', 'non-UUID session candidates use the server-owned external like route');

const catalogCandidate = mapCandidate({
  id: 'auradin-seed-catalog-candidate',
  externalSource: 'auradin_catalog',
  brandName: '네이밍',
  productName: '컬러 립 제품',
});
expectEqual(catalogCandidate.externalSource, 'auradin_catalog', 'packaged catalog candidates retain one cross-screen like identity');
expectEqual(candidate.priceText, '18,000원', 'candidate priceText formatting (DS: 원 suffix)');
expectEqual(candidate.matchSummary, '아이섀도우 · 플럼', 'candidate matchSummary from matchedOn');
expectEqual(candidate.matchRate, 90, 'candidate matchRate');
expectEqual(candidate.reason?.inferred.length, 1, 'candidate reason inferred passthrough');
expectEqual(candidate.reason?.caveat[0], '톤 참고용', 'candidate reason caveat passthrough');
expectEqual(candidate.purchaseUrl, 'https://example.com/buy', 'candidate purchaseUrl');
expectEqual(candidate.reasonCopy, '플럼 컬러 아이섀도우로 보여요.', 'candidate reasonCopy passthrough');
expectEqual(candidate.category, 'shadow', 'candidate category passthrough');

// reasonCopy 빈 문자열은 undefined로 정규화 (fallback은 백엔드가 보장)
const noCopy = mapCandidate({id: 'x', brandName: 'B', productName: 'P', reasonCopy: ''});
expectEqual(noCopy.reasonCopy, undefined, 'empty reasonCopy → undefined');
const internalCandidate = mapCandidate({id: '169fec46-f3e0-4ea1-9c63-0a2ed3aa6cdb'});
expectEqual(internalCandidate.externalSource, undefined, 'UUID catalog candidates retain the internal like route');
const uuidExternalCandidate = mapCandidate({
  id: '269fec46-f3e0-4ea1-9c63-0a2ed3aa6cdb',
  externalSource: 'auradin_search',
});
expectEqual(
  uuidExternalCandidate.externalSource,
  'auradin_search',
  'explicit external source takes precedence over UUID-shaped ids',
);

// --- 질문 옵션 매핑: 서버의 의미 정보만 보존하고 상품 이미지는 화면 계약에서 제외 ---
const legacyColorPayload = {
  id: 'colorFamily-coral',
  imageUrl: 'https://example.com/coral.jpg',
  label: '코랄',
  filterDelta: {attribute: 'colorFamily', op: 'eq', values: ['coral']},
};
const colorOption = mapQuestionOption(legacyColorPayload);
expectEqual(colorOption.attribute, 'colorFamily', 'question option keeps filter attribute');
expectEqual(colorOption.value, 'coral', 'question option keeps the first non-empty value');
expectEqual(colorOption.op, 'eq', 'question option keeps filter operation');
expectEqual(
  Object.prototype.hasOwnProperty.call(colorOption, 'imageUrl'),
  false,
  'legacy question product image is ignored',
);

const noopOption = mapQuestionOption({
  id: 'finish-noop',
  label: '상관 없어요',
  filterDelta: {attribute: 'finish', op: 'noop'},
});
expectEqual(noopOption.op, 'noop', 'noop stays explicit for the skip link');

const finishOption = mapQuestionOption({
  id: 'finish-matte',
  label: '보송한 매트',
  filterDelta: {attribute: 'finish', op: 'eq', values: ['', 'matte']},
});
expectEqual(finishOption.value, 'matte', 'blank values do not hide a later semantic value');

const channelOption = mapQuestionOption({
  id: 'channel-naver',
  label: '구매 링크만 있으면 괜찮아요',
  filterDelta: {attribute: 'channel', op: 'eq', values: ['naver']},
});
expectEqual(channelOption.attribute, 'channel', 'channel attribute passthrough');
expectEqual(channelOption.value, 'naver', 'channel value passthrough');

// --- turn 매핑: phase / 구매 가능 카드만 / 질문 / 헤더 ---
const resultsTurn = mapSearchTurn({
  sessionId: 'auradin-x',
  phase: 'results',
  thinking: [],
  result: {
    headerLabel: '조건에 가까운 제품을 골랐어요',
    products: [
      {
        id: 'ok',
        role: 'anchor',
        brandName: 'B',
        productName: 'P',
        shadeName: 'S',
        price: 12000,
        imageUrl: 'https://example.com/a.jpg',
        purchaseUrl: 'https://example.com/a',
        reason: {matchedOn: ['립'], inferred: [], caveat: []},
      },
      // imageUrl/purchaseUrl 없는 후보는 걸러져야 함
      {id: 'drop', brandName: 'B2', productName: 'P2', shadeName: 'S2', price: 9000},
    ],
  },
});
expectEqual(resultsTurn.phase, 'results', 'turn phase');
expectEqual(resultsTurn.candidates.length, 1, 'turn filters non-purchasable candidates');
expectEqual(resultsTurn.headerLabel, '조건에 가까운 제품을 골랐어요', 'turn headerLabel');

const questionTurn = mapSearchTurn({
  sessionId: 'auradin-q',
  phase: 'question',
  thinking: [],
  question: {
    id: 'q-1-colorFamily',
    title: '색감은 어느 쪽이 더 끌려요?',
    attribute: 'colorFamily',
    options: [{id: 'colorFamily-rose', label: '로즈', filterDelta: {attribute: 'colorFamily', values: ['rose']}}],
  },
});
expectEqual(questionTurn.phase, 'question', 'question turn phase');
expectEqual(questionTurn.question?.options.length, 1, 'question options mapped');
expectEqual(questionTurn.question?.attribute, 'colorFamily', 'question attribute is validated and preserved');
expectEqual(questionTurn.candidates.length, 0, 'question turn has no candidates');

const contextualQuestionTurn = mapSearchTurn({
  phase: 'question',
  question: {
    id: 'q-2-finish',
    title: '립 마무리감은 어느 쪽이 좋아요?',
    attribute: 'finish',
    contextCategory: 'lip',
    options: [{id: 'finish-matte', label: '보송한 매트', filterDelta: {attribute: 'finish', values: ['matte']}}],
  },
});
expectEqual(contextualQuestionTurn.question?.attribute, 'finish', 'finish question attribute is preserved');
expectEqual(contextualQuestionTurn.question?.contextCategory, 'lip', 'valid finish context category is preserved');

const invalidQuestionTurn = mapSearchTurn({
  phase: 'question',
  question: {
    id: 'q-invalid',
    title: 'invalid',
    attribute: 'futureAttribute',
    contextCategory: 'perfume',
    options: [],
  },
});
expectEqual(invalidQuestionTurn.question?.attribute, undefined, 'unknown question attribute is dropped');
expectEqual(invalidQuestionTurn.question?.contextCategory, undefined, 'unknown context category is dropped');

const misplacedContextTurn = mapSearchTurn({
  phase: 'question',
  question: {
    id: 'q-price',
    title: '예산은 어느 정도가 편해요?',
    attribute: 'priceTier',
    contextCategory: 'lip',
    options: [],
  },
});
expectEqual(misplacedContextTurn.question?.contextCategory, undefined, 'context category is limited to finish and texture questions');

// 알 수 없는 phase → failed로 정규화
expectEqual(mapSearchTurn({phase: 'weird'}).phase, 'failed', 'unknown phase normalizes to failed');

// --- appliedFilters 관통 (최상위, 빈 label 제거) ---
const filtersTurn = mapSearchTurn({
  sessionId: 'auradin-f',
  phase: 'results',
  thinking: [],
  result: {headerLabel: 'x', products: []},
  appliedFilters: [
    {label: '립', source: 'prompt'},
    {label: '쿨톤 참고', source: 'report', coverage: 'partial_unknown'},
    {label: '', source: 'prompt'}, // 빈 label은 제거돼야
  ],
});
expectEqual(filtersTurn.appliedFilters?.length, 2, 'appliedFilters drops empty labels');
expectEqual(filtersTurn.appliedFilters?.[0].label, '립', 'appliedFilters label passthrough');
expectEqual(filtersTurn.appliedFilters?.[1].source, 'report', 'appliedFilters report source passthrough');
expectEqual(
  filtersTurn.appliedFilters?.[1].label,
  '쿨톤 참고 · 정보 미상 포함',
  'partial unknown coverage appends an honest chip suffix',
);
expectEqual(mapSearchTurn({phase: 'results'}).appliedFilters?.length, 0, 'missing appliedFilters → []');
