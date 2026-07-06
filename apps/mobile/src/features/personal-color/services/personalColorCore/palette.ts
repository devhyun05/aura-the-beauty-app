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
const VALUE_KO: Record<ValueBand, string> = { light: '라이트', mid: '미드', deep: '딥' };
const CHROMA_KO: Record<ChromaBand, string> = { soft: '뮤트', clear: '클리어', vivid: '비비드' };

// 대표색 예시 (교육적 시작값)
const EXEMPLARS: Record<string, string[]> = {
  'warm-light-clear': ['살구', '피치', '코랄'],
  'warm-mid-vivid': ['골드', '오렌지', '토마토레드'],
  'warm-deep-soft': ['카멜', '올리브', '브릭', '테라코타'],
  'cool-light-soft': ['라벤더', '로즈', '더스티핑크'],
  'cool-mid-clear': ['블루', '푸시아', '민트'],
  'cool-deep-vivid': ['버건디', '네이비', '마젠타'],
  'neutral-mid-clear': ['그레이지', '뮤트로즈', '소프트카키'],
};

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
    exemplars: EXEMPLARS[id] ?? [],
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

function opposite<T>(list: T[], value: T): T {
  const i = list.indexOf(value);
  return list[list.length - 1 - i];
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

function bestReasons(t: PaletteTargets): PaletteAxisReason[] {
  const reasons: PaletteAxisReason[] = [];
  if (t.undertone !== 'neutral') {
    reasons.push({
      axis: 'temperature',
      direction: t.undertone,
      noteKo: t.undertone === 'warm' ? '따뜻한 언더톤과 어울려 혈색이 살아나요' : '쿨한 언더톤과 어울려 맑아 보여요',
    });
  }
  reasons.push({
    axis: 'value',
    direction: t.valueBand,
    noteKo: `${VALUE_KO[t.valueBand]} 명도대와 조화로워요`,
  });
  return reasons;
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
    best.push({ family: fam, reasons: bestReasons(t), noteKo: '얼굴 근처에 두면 잘 받아요' });
  }

  // worst: 반대 undertone × 반대 chroma (소프트 카피)
  const worstU = opposite(UNDERTONES, t.undertone === 'neutral' ? 'warm' : t.undertone);
  const worstC = opposite(CHROMA_BANDS, t.chromaBand);
  const worstCombos: Array<[Undertone, ValueBand, ChromaBand]> = [
    [worstU, t.valueBand, worstC],
    [worstU, opposite(VALUE_BANDS, t.valueBand), t.chromaBand],
    [t.undertone, opposite(VALUE_BANDS, t.valueBand), worstC],
  ];
  const worst: PaletteItem[] = [];
  const seenW = new Set<string>();
  for (const [u, v, c] of worstCombos) {
    const fam = makeColorFamily(u, v, c);
    if (seenW.has(fam.id)) continue;
    seenW.add(fam.id);
    worst.push({
      family: fam,
      reasons: [
        { axis: 'temperature', direction: u, noteKo: '언더톤이 반대라 얼굴이 칙칙해 보일 수 있어요' },
        { axis: 'chroma', direction: c, noteKo: '채도 방향이 달라 대비가 흐려질 수 있어요' },
      ],
      noteKo: '얼굴 근처보다 포인트(하의·가방)로 쓰면 좋아요',
    });
  }

  return { best, worst, colorFamilies: ALL_COLOR_FAMILIES };
}
