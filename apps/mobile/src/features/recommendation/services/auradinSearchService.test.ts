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

// --- 질문 옵션 스와치: colorFamily→3색 그라데이션(§8.2-3), finish/texture→질감(§8.2-1), noop→skip ---
const colorOption = mapQuestionOption({
  id: 'colorFamily-coral',
  label: '코랄',
  filterDelta: {attribute: 'colorFamily', op: 'eq', values: ['coral']},
});
const colorSwatch = colorOption.swatch;
expectEqual(
  typeof colorSwatch === 'object' && colorSwatch.kind,
  'gradient',
  'colorFamily option swatch → 3-stop gradient',
);
expectEqual(
  typeof colorSwatch === 'object' && colorSwatch.kind === 'gradient' ? colorSwatch.colors.length : 0,
  3,
  'colorFamily gradient has 3 stops (brightness range)',
);
expectEqual(
  typeof colorSwatch === 'object' && colorSwatch.kind === 'gradient' ? colorSwatch.colors[1] : '',
  '#F2896B',
  'colorFamily gradient keeps the legacy base hex as the middle stop',
);

const noopOption = mapQuestionOption({
  id: 'finish-noop',
  label: '상관 없어요',
  filterDelta: {attribute: 'finish', op: 'noop'},
});
expectEqual(noopOption.swatch, undefined, 'noop option → no swatch (skip tile)');

const finishOption = mapQuestionOption({
  id: 'finish-matte',
  label: '보송한 매트',
  filterDelta: {attribute: 'finish', op: 'eq', values: ['matte']},
});
const finishSwatch = finishOption.swatch;
expectEqual(
  typeof finishSwatch === 'object' && finishSwatch.kind === 'texture' ? finishSwatch.texture : '',
  'matte',
  'finish option → abstract texture swatch (matte)',
);

const textureOption = mapQuestionOption({
  id: 'texture-cream',
  label: '크림',
  filterDelta: {attribute: 'texture', op: 'eq', values: ['cream']},
});
const textureSwatch = textureOption.swatch;
expectEqual(
  typeof textureSwatch === 'object' && textureSwatch.kind === 'texture' ? textureSwatch.texture : '',
  'velvet',
  'texture option maps into the 4-kind abstract set (cream → velvet)',
);

// 매핑이 없는 속성/값 → 중립 단색 폴백 (라벨이 의미 전달, 제품 이미지 금지 §8.2-2)
const channelOption = mapQuestionOption({
  id: 'channel-naver',
  label: '구매 링크만 있으면 괜찮아요',
  filterDelta: {attribute: 'channel', op: 'eq', values: ['naver']},
});
expectEqual(channelOption.swatch, '#E4D6D2', 'unmapped option → neutral solid swatch');

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
    options: [{id: 'colorFamily-rose', label: '로즈', filterDelta: {attribute: 'colorFamily', values: ['rose']}}],
  },
});
expectEqual(questionTurn.phase, 'question', 'question turn phase');
expectEqual(questionTurn.question?.options.length, 1, 'question options mapped');
expectEqual(questionTurn.candidates.length, 0, 'question turn has no candidates');

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
