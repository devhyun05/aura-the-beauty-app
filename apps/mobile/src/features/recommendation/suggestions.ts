// AURADIN — 추천 질의 풀 + 세션 샘플러 (3-1).
// 홈 컴포저의 로테이션 placeholder와 추천 칩이 여기서 샘플된다. i18n 없음(기존 컨벤션: 인라인 한국어).
// 빈 전송은 현재 표시 중인 추천 질의(placeholder)를 실제 검색으로 승격한다(실기기 이슈 3의 완성형).
//
// 정직성: 샘플러는 순수 함수(seed 결정적) — 같은 (seed, count, personalColor)면 항상 같은 결과라
// suggestions.test.ts가 expectEqual로 고정한다. 세션별 변주는 HomeView가 마운트마다 새 seed를 준다.

export type Suggestion = {
  /** 칩·placeholder에 노출하는 짧은 라벨 */
  chip: string;
  /** 탭 또는 빈 전송 시 백엔드로 보내는 완전한 질의 */
  query: string;
  /** 있으면 해당 톤 리포트일 때만 노출(없으면 톤 무관하게 항상 후보) */
  tone?: 'warm' | 'cool';
};

// 서빙 6종(lip/cheek/shadow/base/brow/liner)에 고루 걸친 정적 시드 풀.
export const SUGGESTION_POOL: readonly Suggestion[] = [
  { chip: '데일리 로즈 립', query: '데일리로 쓸 만한 로즈 립 추천해줘' },
  { chip: '쿨톤 글로시 립', query: '쿨톤 글로시 핑크 립, 2만원 이하', tone: 'cool' },
  { chip: '웜톤 코랄 틴트', query: '웜톤한테 어울리는 코랄 틴트 추천', tone: 'warm' },
  { chip: '물빠진 벽돌 립', query: '물빠진 벽돌색 매트 립' },
  { chip: '면접용 블러셔', query: '면접용 자연스러운 블러셔, 너무 붉지 않게' },
  { chip: '피치 크림 블러셔', query: '피치빛 크림 블러셔 추천해줘' },
  { chip: '은은한 쉬머 섀도우', query: '글리터 강한 거 말고 은은한 쉬머 아이섀도우' },
  { chip: '데일리 브라운 섀도우', query: '데일리로 무난한 브라운 아이섀도우 팔레트' },
  { chip: '커버 좋은 쿠션', query: '커버 잘 되는 쿠션 추천해줘' },
  { chip: '자연스러운 브로우', query: '자연스러운 브로우 펜슬 추천해줘' },
  { chip: '또렷한 아이라이너', query: '번짐 적고 또렷한 아이라이너 추천' },
  { chip: '올리브영 데일리 립', query: '올리브영에서 살 수 있는 데일리 립' },
];

/** 퍼스널컬러 문자열 → warm/cool 축(모르면 null). '웜/봄/가을'·'쿨/여름/겨울'·warm/cool 대응. */
export function reportTone(personalColor?: string | null): 'warm' | 'cool' | null {
  if (!personalColor) return null;
  const lower = personalColor.toLowerCase();
  if (lower.includes('warm') || /웜|봄|가을/.test(personalColor)) return 'warm';
  if (lower.includes('cool') || /쿨|여름|겨울/.test(personalColor)) return 'cool';
  return null;
}

/** 리포트 톤에 맞는 후보만 — 톤 무관 항목은 항상 포함, 반대 톤 항목만 제외(톤 미상이면 전부 후보). */
export function eligibleSuggestions(personalColor?: string | null): Suggestion[] {
  const tone = reportTone(personalColor);
  return SUGGESTION_POOL.filter((s) => !s.tone || !tone || s.tone === tone);
}

/**
 * seed로 결정적 회전 샘플 — 같은 (seed, count, personalColor) → 같은 결과.
 * 회전 윈도우(start = seed % pool)라 세션마다(=마운트마다 새 seed) 다른 구간이 노출되되 중복은 없다.
 */
export function sampleSuggestions(
  seed: number,
  count: number,
  personalColor?: string | null,
): Suggestion[] {
  const pool = eligibleSuggestions(personalColor);
  if (pool.length === 0 || count <= 0) return [];
  const n = Math.min(Math.floor(count), pool.length);
  const start = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
  const out: Suggestion[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(pool[(start + i) % pool.length]);
  }
  return out;
}
