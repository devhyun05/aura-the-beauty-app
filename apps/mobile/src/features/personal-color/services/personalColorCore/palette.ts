// best/worst 팔레트 — 소프트 프레이밍(“안 어울림” 금지, 축 태그 이유).
// colorFamily는 제품추천 join key: (undertone, valueBand, chromaBand).

import type {
  AuraAxis,
  AxisName,
  ChromaBand,
  ColorFamily,
  PaletteAxisReason,
  PaletteItem,
  Undertone,
  ValueBand,
} from './contracts';

const UNDERTONES: Undertone[] = ['warm', 'neutral', 'cool'];
const VALUE_BANDS: ValueBand[] = ['light', 'mid', 'deep'];
const CHROMA_BANDS: ChromaBand[] = ['soft', 'clear', 'vivid'];

const UNDERTONE_KO: Record<Undertone, string> = { warm: '웜', neutral: '뉴트럴', cool: '쿨' };
const VALUE_KO: Record<ValueBand, string> = { light: '라이트', mid: '중간 명도', deep: '딥' };
const CHROMA_KO: Record<ChromaBand, string> = { soft: '뮤트', clear: '클리어', vivid: '비비드' };

export type ColorFamilyReference = {
  exemplars: [string, string, string];
  hex: string;
};

// 3(온도) × 3(명도) × 3(채도) 전 조합의 화면용 기준색과 대표 색 이름.
// 측색값 자체가 아니라 사용자가 계열을 이해하기 위한 고정 참고값이다.
const COLOR_FAMILY_REFERENCES: Record<string, ColorFamilyReference> = {
  'warm-light-soft': {hex: '#F4C9B4', exemplars: ['피치 베이지', '바닐라 크림', '소프트 살구']},
  'warm-light-clear': {hex: '#FFD2AE', exemplars: ['크림 피치', '살구', '라이트 코랄']},
  'warm-light-vivid': {hex: '#FF8D68', exemplars: ['라이트 코랄', '생기 코랄', '피치 팝']},
  'warm-mid-soft': {hex: '#C98F79', exemplars: ['로즈 베이지', '밀크티', '소프트 카멜']},
  'warm-mid-clear': {hex: '#E99B63', exemplars: ['애프리콧', '코랄 베이지', '웜 로즈']},
  'warm-mid-vivid': {hex: '#E84B37', exemplars: ['토마토 레드', '오렌지', '골드']},
  'warm-deep-soft': {hex: '#A7744E', exemplars: ['카멜', '올리브 브라운', '테라코타']},
  'warm-deep-clear': {hex: '#A94E3E', exemplars: ['브릭', '시나몬', '모스 그린']},
  'warm-deep-vivid': {hex: '#C94A24', exemplars: ['번트 오렌지', '칠리 레드', '딥 골드']},
  'neutral-light-soft': {hex: '#E2CBC7', exemplars: ['그레이지 핑크', '오트밀', '소프트 로즈']},
  'neutral-light-clear': {hex: '#F0C9C9', exemplars: ['로즈 아이보리', '라이트 모브', '페일 민트']},
  'neutral-light-vivid': {hex: '#F06F8B', exemplars: ['워터멜론 핑크', '클리어 코랄', '아쿠아']},
  'neutral-mid-soft': {hex: '#B28E93', exemplars: ['모브 베이지', '그레이지', '소프트 카키']},
  'neutral-mid-clear': {hex: '#B66572', exemplars: ['로즈 우드', '청록', '뉴트럴 레드']},
  'neutral-mid-vivid': {hex: '#C63562', exemplars: ['라즈베리', '에메랄드', '코발트']},
  'neutral-deep-soft': {hex: '#765B59', exemplars: ['코코아', '차콜 브라운', '딥 카키']},
  'neutral-deep-clear': {hex: '#7F3548', exemplars: ['와인 로즈', '페트롤 블루', '다크 틸']},
  'neutral-deep-vivid': {hex: '#7B1F42', exemplars: ['플럼 레드', '로열 퍼플', '딥 에메랄드']},
  'cool-light-soft': {hex: '#D9C9ED', exemplars: ['라벤더', '더스티 핑크', '파우더 블루']},
  'cool-light-clear': {hex: '#C9DDF5', exemplars: ['아이스 블루', '쿨 핑크', '민트']},
  'cool-light-vivid': {hex: '#8DA7F2', exemplars: ['페리윙클', '라일락 핑크', '아쿠아 블루']},
  'cool-mid-soft': {hex: '#A97F96', exemplars: ['더스티 로즈', '모브', '슬레이트 블루']},
  'cool-mid-clear': {hex: '#58BFC0', exemplars: ['쿨 민트', '블루', '로즈 핑크']},
  'cool-mid-vivid': {hex: '#D62F85', exemplars: ['푸시아', '코발트 블루', '바이올렛']},
  'cool-deep-soft': {hex: '#4C596B', exemplars: ['차콜 블루', '플럼 그레이', '스모키 네이비']},
  'cool-deep-clear': {hex: '#263F73', exemplars: ['네이비', '버건디', '딥 틸']},
  'cool-deep-vivid': {hex: '#A71965', exemplars: ['마젠타', '로열 블루', '블루 레드']},
};

export function getColorFamilyReference(
  family: Pick<ColorFamily, 'id' | 'exemplars'>,
): ColorFamilyReference {
  const reference = COLOR_FAMILY_REFERENCES[family.id];
  if (reference) {
    return reference;
  }

  const exemplars = family.exemplars.filter((value): value is string => typeof value === 'string' && value.length > 0);
  return {
    hex: '#C9C2B8',
    exemplars: [exemplars[0] ?? family.id, exemplars[1] ?? '대표 색', exemplars[2] ?? '참고 색'],
  };
}

export function familyId(u: Undertone, v: ValueBand, c: ChromaBand): string {
  return `${u}-${v}-${c}`;
}

export function makeColorFamily(u: Undertone, v: ValueBand, c: ChromaBand): ColorFamily {
  const id = familyId(u, v, c);
  return {
    id,
    undertone: u,
    valueBand: v,
    chromaBand: c,
    labelKo: `${UNDERTONE_KO[u]} · ${VALUE_KO[v]} · ${CHROMA_KO[c]}`,
    exemplars: [...getColorFamilyReference({id, exemplars: []}).exemplars],
  };
}

export const ALL_COLOR_FAMILIES: ColorFamily[] = (() => {
  const out: ColorFamily[] = [];
  for (const u of UNDERTONES) {
    for (const v of VALUE_BANDS) {
      for (const c of CHROMA_BANDS) {
        out.push(makeColorFamily(u, v, c));
      }
    }
  }
  return out;
})();

function undertoneTarget(temp: number | null): Undertone {
  if (temp == null || Math.abs(temp) < 0.25) return 'neutral';
  return temp > 0 ? 'warm' : 'cool';
}
function valueTarget(value: number | null): ValueBand {
  if (value == null) return 'mid';
  if (value < -0.33) return 'light';
  if (value > 0.33) return 'deep';
  return 'mid';
}
function chromaTarget(chroma: number | null, clarity: number | null): ChromaBand {
  const ch = chroma ?? 0;
  const cl = clarity ?? 0;
  if (ch > 0.4 && cl > 0.3) return 'vivid';
  if (ch < -0.2 && cl < -0.2) return 'soft';
  return 'clear';
}

function adjacent<T>(list: T[], value: T): T[] {
  const i = list.indexOf(value);
  const out: T[] = [value];
  if (i - 1 >= 0) out.push(list[i - 1]);
  if (i + 1 < list.length) out.push(list[i + 1]);
  return out;
}

function bandDistance<T>(list: T[], a: T, b: T): number {
  return Math.abs(list.indexOf(a) - list.indexOf(b));
}

export type PaletteTargets = {
  undertone: Undertone;
  valueBand: ValueBand;
  chromaBand: ChromaBand;
};

export function resolveTargets(axes: Record<AxisName, AuraAxis>): PaletteTargets {
  return {
    undertone: undertoneTarget(axes.temperature.value),
    valueBand: valueTarget(axes.value.value),
    chromaBand: chromaTarget(axes.chroma.value, axes.clarity.value),
  };
}

function bestReasons(t: PaletteTargets, family: ColorFamily): PaletteAxisReason[] {
  return [
    {
      axis: 'temperature',
      direction: family.undertone,
      noteKo: family.undertone === t.undertone
        ? `측정된 ${UNDERTONE_KO[t.undertone]} 방향과 일치해요`
        : `측정된 ${UNDERTONE_KO[t.undertone]} 방향과 이웃한 온도 범위예요`,
    },
    {
      axis: 'value',
      direction: family.valueBand,
      noteKo: family.valueBand === t.valueBand
        ? `측정된 ${VALUE_KO[t.valueBand]} 명도와 일치해요`
        : `측정된 ${VALUE_KO[t.valueBand]} 명도와 이웃한 범위예요`,
    },
    {
      axis: 'chroma',
      direction: family.chromaBand,
      noteKo: family.chromaBand === t.chromaBand
        ? `측정된 ${CHROMA_KO[t.chromaBand]} 채도와 일치해요`
        : `측정된 ${CHROMA_KO[t.chromaBand]} 채도와 이웃한 범위예요`,
    },
  ];
}

function worstReasons(t: PaletteTargets, family: ColorFamily): PaletteAxisReason[] {
  const candidates: Array<PaletteAxisReason & {distance: number}> = [
    {
      axis: 'temperature',
      direction: family.undertone,
      distance: bandDistance(UNDERTONES, family.undertone, t.undertone),
      noteKo: `측정된 ${UNDERTONE_KO[t.undertone]} 방향과 온도 차이가 커요`,
    },
    {
      axis: 'value',
      direction: family.valueBand,
      distance: bandDistance(VALUE_BANDS, family.valueBand, t.valueBand),
      noteKo: `측정된 ${VALUE_KO[t.valueBand]} 명도와 밝기 차이가 커요`,
    },
    {
      axis: 'chroma',
      direction: family.chromaBand,
      distance: bandDistance(CHROMA_BANDS, family.chromaBand, t.chromaBand),
      noteKo: `측정된 ${CHROMA_KO[t.chromaBand]} 채도와 선명도 차이가 커요`,
    },
  ];

  return candidates
    .filter(reason => reason.distance > 0)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 2)
    .map(({distance: _distance, ...reason}) => reason);
}

export function buildPalette(axes: Record<AxisName, AuraAxis>): {
  best: PaletteItem[];
  worst: PaletteItem[];
  colorFamilies: ColorFamily[];
} {
  const t = resolveTargets(axes);

  const bestUndertones = adjacent(UNDERTONES, t.undertone);
  const bestValues = adjacent(VALUE_BANDS, t.valueBand);
  const bestChromas = adjacent(CHROMA_BANDS, t.chromaBand);

  const best: PaletteItem[] = [];
  // 중심 타깃 + 각 축 인접 1밴드 (최대 ~5)
  const bestCombos: Array<[Undertone, ValueBand, ChromaBand]> = [
    [t.undertone, t.valueBand, t.chromaBand],
    [bestUndertones[1] ?? t.undertone, t.valueBand, t.chromaBand],
    [t.undertone, bestValues[1] ?? t.valueBand, t.chromaBand],
    [t.undertone, t.valueBand, bestChromas[1] ?? t.chromaBand],
    [t.undertone, bestValues[2] ?? t.valueBand, t.chromaBand],
  ];
  const seen = new Set<string>();
  for (const [u, v, c] of bestCombos) {
    const fam = makeColorFamily(u, v, c);
    if (seen.has(fam.id)) continue;
    seen.add(fam.id);
    best.push({
      family: fam,
      reasons: bestReasons(t, fam),
      noteKo: `${fam.labelKo} 계열은 얼굴 가까이에 두기 좋은 색 범위예요`,
    });
  }

  // worst: 현재 타깃에서 가장 먼 4개 조합. mid/clear처럼 반대값이 자기 자신인
  // 축에서도 중복 없이 4개가 나오도록 전체 27개 계열에서 거리순으로 고른다.
  const worstCombos = ALL_COLOR_FAMILIES
    .map(family => ({
      family,
      score:
        bandDistance(UNDERTONES, family.undertone, t.undertone) * 1.2
        + bandDistance(VALUE_BANDS, family.valueBand, t.valueBand)
        + bandDistance(CHROMA_BANDS, family.chromaBand, t.chromaBand),
    }))
    .filter(({family}) => family.id !== familyId(t.undertone, t.valueBand, t.chromaBand))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({family}) => [family.undertone, family.valueBand, family.chromaBand] as [Undertone, ValueBand, ChromaBand]);
  const worst: PaletteItem[] = [];
  const seenW = new Set<string>();
  for (const [u, v, c] of worstCombos) {
    const fam = makeColorFamily(u, v, c);
    if (seenW.has(fam.id)) continue;
    seenW.add(fam.id);
    worst.push({
      family: fam,
      reasons: worstReasons(t, fam),
      noteKo: `${fam.labelKo} 계열은 얼굴에서 멀리 두거나 작은 포인트로 쓰기 좋아요`,
    });
  }

  return { best, worst, colorFamilies: ALL_COLOR_FAMILIES };
}
