// AURADIN 3-1 — 추천 질의 샘플러 계약. 순수 함수라 seed 고정으로 결정성·톤 분기를 못박는다.
import {
  eligibleSuggestions,
  reportTone,
  sampleSuggestions,
  SUGGESTION_POOL,
} from './suggestions';

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const chips = (list: { chip: string }[]): string => list.map((s) => s.chip).join(',');

// --- 풀 무결성 -------------------------------------------------------------
expectEqual(SUGGESTION_POOL.length, 12, 'pool size');
expectEqual(
  SUGGESTION_POOL.every((s) => Boolean(s.chip) && Boolean(s.query)),
  true,
  'every suggestion has chip+query',
);

// --- reportTone 매핑 -------------------------------------------------------
expectEqual(reportTone('봄웜'), 'warm', 'tone 봄웜→warm');
expectEqual(reportTone('가을웜'), 'warm', 'tone 가을웜→warm');
expectEqual(reportTone('여름쿨'), 'cool', 'tone 여름쿨→cool');
expectEqual(reportTone('겨울쿨'), 'cool', 'tone 겨울쿨→cool');
expectEqual(reportTone('Warm Autumn'), 'warm', 'tone lowercased warm');
expectEqual(reportTone(null), null, 'tone null');
expectEqual(reportTone(''), null, 'tone empty');
expectEqual(reportTone('중성'), null, 'tone unknown→null');

// --- 자격(톤 필터) ---------------------------------------------------------
expectEqual(eligibleSuggestions(null).length, 12, 'eligible(null) = full');
expectEqual(eligibleSuggestions('쿨톤').length, 11, 'eligible(cool) drops warm-tagged');
expectEqual(eligibleSuggestions('웜톤').length, 11, 'eligible(warm) drops cool-tagged');
expectEqual(
  eligibleSuggestions('쿨톤').some((s) => s.tone === 'warm'),
  false,
  'cool report never shows warm-tagged',
);
expectEqual(
  eligibleSuggestions('웜톤').some((s) => s.tone === 'cool'),
  false,
  'warm report never shows cool-tagged',
);

// --- 샘플러 결정성 ---------------------------------------------------------
expectEqual(
  chips(sampleSuggestions(42, 3)),
  chips(sampleSuggestions(42, 3)),
  'same seed → identical sample',
);
expectEqual(chips(sampleSuggestions(0, 3)), '데일리 로즈 립,쿨톤 글로시 립,웜톤 코랄 틴트', 'seed 0 window');
expectEqual(chips(sampleSuggestions(1, 3)), '쿨톤 글로시 립,웜톤 코랄 틴트,물빠진 벽돌 립', 'seed 1 rotates window');

// --- 샘플러 톤 분기 (샘플에도 반대 톤 미노출) -------------------------------
expectEqual(
  sampleSuggestions(0, 12, '여름쿨').some((s) => s.tone === 'warm'),
  false,
  'cool sample excludes warm',
);
expectEqual(
  sampleSuggestions(0, 12, '봄웜').some((s) => s.tone === 'cool'),
  false,
  'warm sample excludes cool',
);

// --- count 클램프 + 중복 없음 ----------------------------------------------
expectEqual(sampleSuggestions(0, 100).length, 12, 'count clamps to pool size');
expectEqual(new Set(sampleSuggestions(3, 100).map((s) => s.chip)).size, 12, 'no duplicates in full sweep');
expectEqual(sampleSuggestions(0, 100, '쿨톤').length, 11, 'clamp respects tone filter');
expectEqual(sampleSuggestions(5, 0).length, 0, 'count 0 → empty');

// eslint-disable-next-line no-console
console.log('suggestions.test.ts — all assertions passed');
