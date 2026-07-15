/**
 * 향수 추천 규칙 엔진 (#7) — 체향·환경 입력으로 "이 조건에서 어떤 계열·부향률이 맞고,
 * 향이 시간축으로 어떻게 전개되고 얼마나 갈지"를 예측한다. 순수 로직(Unity/브리지 무관),
 * 결정론적이라 테스트 가능. 패널(PerfumePanel)이 입력 칩을 바꿀 때마다 recommend()를 다시 부른다.
 *
 * 예측의 한계(중요): 개인 피부 상재균·pH·호르몬 상태는 앱이 알 수 없다. 그래서 이 엔진은
 * "정확히 이 향이 난다"가 아니라 측정/입력 가능한 변수(피부 유분·계절·습도·상황·선호 강도)로
 * 방향성을 좁히는 확률적 가이드다. caveat 필드로 이 점을 항상 사용자에게 노출한다.
 */
import {profileFactors} from './scentProfile';
import type {ScentProfile} from './scentProfile';

export type SkinType = 'dry' | 'normal' | 'oily';
export type Climate = 'cold' | 'mild' | 'hot';
export type Humidity = 'dry' | 'normal' | 'humid';
export type Occasion = 'daily' | 'office' | 'date' | 'evening' | 'active';
export type IntensityPref = 'subtle' | 'moderate' | 'bold';

export interface PerfumeContext {
  skin: SkinType;
  climate: Climate;
  humidity: Humidity;
  occasion: Occasion;
  intensity: IntensityPref;
}

export type Concentration = 'edc' | 'edt' | 'edp' | 'parfum';
export type FamilyId =
  | 'citrus'
  | 'floral'
  | 'fruity'
  | 'green'
  | 'aromatic'
  | 'spicy'
  | 'woody'
  | 'amber'
  | 'musk'
  | 'gourmand'
  | 'aquatic'
  | 'leather';

// ── 계열 카탈로그 ─────────────────────────────────────────────────────────
// base    : 지속 계수(베이스 노트 무게). 우디·앰버·머스크가 오래 남고, 시트러스·아쿠아틱이 짧다.
// sillage : 고유 확산(존재감) 0..1.
// heat    : 열 반응 -0.4..0.4. 양수=더위에 피어남(스파이시·앰버), 음수=열에 무너짐(시트러스).
// humid   : 습도 반응 -0.3..0.3.
// occ     : 상황별 적합도 0..1.
// climate : 잘 맞는 계절('any'=무난).
interface Family {
  id: FamilyId;
  label: string;
  blurb: string;
  notes: string; // 대표 노트 예시(구체성)
  base: number; // 0.6..1.4
  sillage: number; // 0..1
  heat: number; // -0.4..0.4
  humid: number; // -0.3..0.3
  occ: Record<Occasion, number>;
  climate: Climate | 'any';
}

const F = (
  id: FamilyId,
  label: string,
  blurb: string,
  notes: string,
  base: number,
  sillage: number,
  heat: number,
  humid: number,
  occ: [number, number, number, number, number], // daily,office,date,evening,active
  climate: Climate | 'any',
): Family => ({
  id,
  label,
  blurb,
  notes,
  base,
  sillage,
  heat,
  humid,
  occ: {
    daily: occ[0],
    office: occ[1],
    date: occ[2],
    evening: occ[3],
    active: occ[4],
  },
  climate,
});

export const FAMILIES: Family[] = [
  F('citrus', '시트러스', '상큼하고 가벼운 첫인상. 빨리 날아간다.', '베르가못·레몬·자몽', 0.7, 0.45, -0.35, 0.05, [0.9, 0.8, 0.6, 0.3, 0.9], 'hot'),
  F('aquatic', '아쿠아틱', '물·바다 같은 청량감. 땀과 잘 안 부딪힌다.', '해양 노트·멜론·워터릴리', 0.7, 0.4, -0.2, 0.1, [0.85, 0.75, 0.5, 0.3, 0.95], 'hot'),
  F('green', '그린', '풀·잎사귀의 깔끔함. 담백하고 단정.', '갈바넘·바이올렛 리프·무화과잎', 0.8, 0.45, -0.1, 0.0, [0.8, 0.85, 0.55, 0.4, 0.7], 'mild'),
  F('fruity', '프루티', '과즙 같은 발랄함. 밝고 친근.', '복숭아·배·블랙커런트', 0.8, 0.55, 0.0, 0.05, [0.85, 0.6, 0.75, 0.5, 0.7], 'mild'),
  F('floral', '플로럴', '꽃다발의 우아함. 가장 무난한 데이트 향.', '로즈·자스민·피오니', 0.9, 0.6, 0.05, 0.0, [0.8, 0.7, 0.9, 0.6, 0.5], 'mild'),
  F('aromatic', '아로마틱', '허브·라벤더의 클린함. 단정한 오피스 향.', '라벤더·세이지·로즈마리', 0.95, 0.55, -0.05, -0.05, [0.7, 0.9, 0.6, 0.5, 0.6], 'mild'),
  F('musk', '머스크', '살결 같은 은은함. 스킨센트, 오래 붙는다.', '화이트머스크·앰브레트', 1.1, 0.35, 0.05, 0.0, [0.9, 0.85, 0.7, 0.55, 0.6], 'any'),
  F('woody', '우디', '나무의 묵직함. 지속과 신뢰감.', '샌달우드·시더·베티버', 1.25, 0.65, 0.1, -0.05, [0.6, 0.85, 0.7, 0.8, 0.4], 'cold'),
  F('spicy', '스파이시', '따뜻한 향신료. 더위에 오히려 피어난다.', '핑크페퍼·카다멈·시나몬', 1.15, 0.7, 0.3, -0.05, [0.5, 0.55, 0.8, 0.85, 0.4], 'cold'),
  F('gourmand', '구르망', '바닐라·카라멜의 달콤함. 포근하고 관능적.', '바닐라·통카·카라멜', 1.2, 0.7, 0.15, 0.0, [0.55, 0.4, 0.85, 0.8, 0.3], 'cold'),
  F('amber', '앰버', '오리엔탈 온기. 존재감과 지속이 가장 강한 축.', '앰버·벤조인·라부다넘', 1.35, 0.85, 0.25, -0.1, [0.4, 0.4, 0.8, 0.95, 0.3], 'cold'),
  F('leather', '레더', '가죽의 스모키한 깊이. 강렬한 이브닝 향.', '레더·버치타르·스웨이드', 1.3, 0.8, 0.15, -0.1, [0.35, 0.5, 0.7, 0.9, 0.3], 'cold'),
];

const FAMILY_BY_ID: Record<FamilyId, Family> = FAMILIES.reduce(
  (m, f) => {
    m[f.id] = f;
    return m;
  },
  {} as Record<FamilyId, Family>,
);

// ── 부향률 ────────────────────────────────────────────────────────────────
// hours=보통 피부·평온한 날씨 기준 기대 지속. proj=고유 확산 기여.
const CONC: Record<
  Concentration,
  {label: string; hours: number; proj: number}
> = {
  edc: {label: '오 드 코롱 (EDC)', hours: 2.5, proj: 0.3},
  edt: {label: '오 드 뚜왈렛 (EDT)', hours: 4, proj: 0.5},
  edp: {label: '오 드 퍼퓸 (EDP)', hours: 6.5, proj: 0.7},
  parfum: {label: '퍼퓸 (Parfum)', hours: 9, proj: 0.85},
};
const CONC_ORDER: Concentration[] = ['edc', 'edt', 'edp', 'parfum'];

// ── 환경·체질 배수 ────────────────────────────────────────────────────────
const SKIN_LONGEVITY: Record<SkinType, number> = {dry: 0.72, normal: 1, oily: 1.25};
const CLIMATE_LONGEVITY: Record<Climate, number> = {cold: 1.15, mild: 1, hot: 0.8};
const HUMID_LONGEVITY: Record<Humidity, number> = {dry: 0.92, normal: 1, humid: 1.06};

// 상황별 "오래 가야 하는 정도" 0..1 — 오피스·이브닝은 높고, 액티브는 낮다.
const OCCASION_LONGEVITY_NEED: Record<Occasion, number> = {
  daily: 0.5,
  office: 0.75,
  date: 0.6,
  evening: 0.85,
  active: 0.3,
};

// 선호 강도 → 목표 확산.
const INTENSITY_TARGET: Record<IntensityPref, number> = {
  subtle: 0.32,
  moderate: 0.58,
  bold: 0.85,
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const roundHalf = (x: number) => Math.round(x * 2) / 2;
const dir = (v: string, hi: string, lo: string) => (v === hi ? 1 : v === lo ? -1 : 0);

// ── 출력 타입 ─────────────────────────────────────────────────────────────
export interface RankedFamily {
  id: FamilyId;
  label: string;
  blurb: string;
  notes: string;
  score: number; // 0..1
  reasons: string[];
}

export interface Phase {
  key: 'top' | 'heart' | 'base';
  label: string;
  window: string;
  intensity: number; // 0..1 (막대 길이)
  desc: string;
}

export interface Recommendation {
  concentration: {id: Concentration; label: string; reason: string};
  families: RankedFamily[];
  longevityHours: number;
  longevityLabel: string;
  projection: number; // 0..1 (대표 계열 기준)
  projectionLabel: string;
  timeline: Phase[];
  tips: string[];
  caveat: string;
}

// 계열↔계절 근접도: 같으면 1, 인접(cold-mild-hot 한 칸)은 0.6, 반대는 0.2, any는 0.62.
function climateMatch(fam: Family, climate: Climate): number {
  if (fam.climate === 'any') return 0.62;
  if (fam.climate === climate) return 1;
  const order: Climate[] = ['cold', 'mild', 'hot'];
  const gap = Math.abs(order.indexOf(fam.climate) - order.indexOf(climate));
  return gap === 1 ? 0.6 : 0.2;
}

/** 조건에 맞는 계열을 점수순으로 정렬. 상위가 추천 계열. */
export function rankFamilies(ctx: PerfumeContext): RankedFamily[] {
  const target = INTENSITY_TARGET[ctx.intensity];
  const need = OCCASION_LONGEVITY_NEED[ctx.occasion];
  return FAMILIES.map(fam => {
    const occ = fam.occ[ctx.occasion];
    const intMatch = 1 - Math.abs(fam.sillage - target);
    const clim = climateMatch(fam, ctx.climate);
    const baseNorm = (fam.base - 0.6) / 0.8; // 0..1
    const longevitySuit = 1 - need * (1 - baseNorm);

    const score = clamp01(
      occ * 0.45 + intMatch * 0.25 + clim * 0.15 + longevitySuit * 0.15,
    );

    // 상위 기여 요인을 사람이 읽는 이유로.
    const reasons: string[] = [];
    if (occ >= 0.75) reasons.push(`${occasionLabel(ctx.occasion)}에 잘 맞음`);
    if (clim >= 0.9) reasons.push(`${climateLabel(ctx.climate)}에 어울림`);
    if (intMatch >= 0.85) reasons.push(`원하는 ${intensityLabel(ctx.intensity)} 강도와 일치`);
    if (need >= 0.7 && baseNorm >= 0.7) reasons.push('오래 가는 계열');
    if (fam.heat >= 0.25 && ctx.climate === 'hot') reasons.push('더위에 향이 피어남');
    if (reasons.length === 0) reasons.push('무난한 선택');

    return {
      id: fam.id,
      label: fam.label,
      blurb: fam.blurb,
      notes: fam.notes,
      score,
      reasons: reasons.slice(0, 2),
    };
  }).sort((a, b) => b.score - a.score);
}

/** 상황·강도·피부에 맞는 부향률. 이유 문장 포함. */
export function recommendConcentration(ctx: PerfumeContext): {
  id: Concentration;
  label: string;
  reason: string;
} {
  // 선호 강도가 뼈대.
  let idx = ctx.intensity === 'subtle' ? 1 : ctx.intensity === 'moderate' ? 2 : 3;
  const reasons: string[] = [];

  // 건성은 향이 빨리 빠지니 한 단계 올려 지속을 보완.
  if (ctx.skin === 'dry') {
    idx = Math.min(idx + 1, 3);
    reasons.push('건성 피부라 지속 보완을 위해 농도를 올림');
  }
  // 더운 날은 휘발이 빨라 EDC/EDT는 금방 사라짐 — 최소 EDT 이상.
  if (ctx.climate === 'hot') idx = Math.max(idx, 1);
  // 오피스는 과하면 민폐 — EDP 이하로 제한.
  if (ctx.occasion === 'office') {
    idx = Math.min(idx, 2);
    reasons.push('오피스에선 너무 진하지 않게');
  }
  // 액티브(운동·야외활동)는 가볍게 — EDP 이하.
  if (ctx.occasion === 'active') idx = Math.min(idx, 2);
  // 이브닝은 존재감 허용 — 최소 EDP.
  if (ctx.occasion === 'evening') {
    idx = Math.max(idx, 2);
    reasons.push('이브닝은 존재감 있게');
  }

  const id = CONC_ORDER[idx];
  if (reasons.length === 0) reasons.push(`${intensityLabel(ctx.intensity)} 취향에 맞춤`);
  return {id, label: CONC[id].label, reason: reasons.join(' · ')};
}

/** 지속 시간(시간 단위) 예측 — 부향률·피부·계절·습도·계열 베이스를 곱. */
export function predictLongevity(
  ctx: PerfumeContext,
  conc: Concentration,
  familyId?: FamilyId,
): number {
  const fam = familyId ? FAMILY_BY_ID[familyId] : undefined;
  const hours =
    CONC[conc].hours *
    SKIN_LONGEVITY[ctx.skin] *
    CLIMATE_LONGEVITY[ctx.climate] *
    HUMID_LONGEVITY[ctx.humidity] *
    (fam ? fam.base : 1);
  return roundHalf(hours);
}

function longevityLabel(hours: number): string {
  if (hours < 3) return '짧음';
  if (hours < 5.5) return '보통';
  if (hours < 8) return '김';
  return '매우 김';
}

/** 확산(실라주) 예측 0..1 — 대표 계열 기준. */
export function predictProjection(
  ctx: PerfumeContext,
  conc: Concentration,
  familyId: FamilyId,
): number {
  const fam = FAMILY_BY_ID[familyId];
  let p = fam.sillage * 0.45 + CONC[conc].proj * 0.4 + 0.15 * 0.5;
  // 더위/추위: 계열의 열 반응만큼 확산이 오르내림.
  p += dir(ctx.climate, 'hot', 'cold') * (0.08 + fam.heat);
  // 습도: 높으면 향 분자가 공기에 오래 머물러 더 진하게 느껴짐.
  p += dir(ctx.humidity, 'humid', 'dry') * (0.05 + fam.humid);
  // 유분: 지성일수록 확산이 강함.
  p += ctx.skin === 'oily' ? 0.06 : ctx.skin === 'dry' ? -0.05 : 0;
  return clamp01(p);
}

function projectionLabel(p: number): string {
  if (p < 0.38) return '은은함';
  if (p < 0.62) return '적당함';
  return '강함';
}

/** 탑·미들·베이스 3단 시간축 전개. window는 예측 지속에 맞춰 늘어난다. */
export function buildTimeline(
  ctx: PerfumeContext,
  familyId: FamilyId,
  hours: number,
  proj: number,
): Phase[] {
  const fam = FAMILY_BY_ID[familyId];
  const heartEnd = roundHalf(Math.max(1, hours * 0.4));
  const fmt = (h: number) => (h < 1 ? `${Math.round(h * 60)}분` : `${h}시간`);
  return [
    {
      key: 'top',
      label: '탑 노트',
      window: '0–15분',
      intensity: clamp01(proj + 0.15),
      desc: '가장 휘발이 빠른 첫인상. 여기서 맡은 향이 곧 옅어지니 이걸로 판단하지 말 것.',
    },
    {
      key: 'heart',
      label: '미들 노트',
      window: `15분–${fmt(heartEnd)}`,
      intensity: proj,
      desc: `향의 진짜 성격. ${fam.label}의 ${fam.notes.split('·')[0]} 계열이 중심으로 자리 잡는다.`,
    },
    {
      key: 'base',
      label: '베이스 노트',
      window: `${fmt(heartEnd)}–${fmt(hours)}`,
      intensity: clamp01(proj - 0.2),
      desc: '피부에 남는 잔향(드라이다운). 체향과 가장 많이 섞이는 구간.',
    },
  ];
}

/** 실행 가능한 팁 — 조건별로 골라 담는다. 프로필이 있으면 체질별 팁도 덧붙인다. */
function buildTips(
  ctx: PerfumeContext,
  conc: Concentration,
  profile?: ScentProfile | null,
): string[] {
  const tips: string[] = [];
  if (ctx.skin === 'dry')
    tips.push('건성 피부는 무향 보디로션을 바른 뒤 뿌리면 지속이 크게 늘어난다.');
  if (ctx.skin === 'oily')
    tips.push('지성 피부는 향을 오래 잡아두니 평소보다 한두 번 적게 뿌려도 충분하다.');
  if (ctx.climate === 'hot')
    tips.push('더운 날은 맥박점 대신 옷·머리카락에 살짝 얹으면 과한 확산을 줄일 수 있다.');
  if (ctx.climate === 'cold')
    tips.push('추운 날은 향이 잘 안 피어나니 체온 높은 맥박점(손목·목·귀 뒤)에 뿌리자.');
  if (ctx.humidity === 'humid')
    tips.push('습한 날은 확산이 강해지니 평소보다 분사 횟수를 줄이는 게 안전하다.');
  if (conc === 'parfum')
    tips.push('퍼퓸은 농축도가 높아 한 포인트만 찍어도 충분하다.');
  // 체향 프로필 기반 개인화 팁 — 프로필이 없으면(undefined) 아무것도 덧붙지 않아 기존 결과와 동일.
  if (profile?.fade === 'fast')
    tips.push(
      '향이 빨리 날아가는 체질이라, 미니 사이즈를 들고 다니며 중간에 재분사하는 게 현실적이다.',
    );
  if (profile?.warmth === 'warm')
    tips.push('체온이 높아 확산이 강하니, 평소보다 분사 수를 한 번 줄이는 게 좋다.');
  tips.push('뿌린 뒤 문지르지 말 것 — 탑 노트 분자가 깨져 향 전개가 흐트러진다.');
  return tips;
}

const occasionLabel = (o: Occasion) =>
  ({daily: '데일리', office: '오피스', date: '데이트', evening: '이브닝', active: '액티브'}[o]);
const climateLabel = (c: Climate) => ({cold: '추운 날', mild: '선선한 날', hot: '더운 날'}[c]);
const climateShort = (c: Climate) => ({cold: '겨울', mild: '봄가을', hot: '여름'}[c]);
const intensityLabel = (i: IntensityPref) =>
  ({subtle: '은은한', moderate: '적당한', bold: '강한'}[i]);
const skinLabel = (s: SkinType) => ({dry: '건성', normal: '중성', oily: '지성'}[s]);
const humidityLabel = (h: Humidity) => ({dry: '건조', normal: '보통', humid: '습함'}[h]);

/**
 * 상단 진입점 — 입력 컨텍스트 하나로 전체 추천을 조립.
 * profile(체향 프로필)이 있으면 개인 보정 계수로 지속(곱)·확산(합)을 미세 조정하고
 * 체질 팁을 덧붙인다. profile을 넘기지 않으면(미설정) 결과는 기존과 완전히 동일하다
 * — profileFactors(null)이 {longevity:1, projection:0}을 주고, 이미 roundHalf/clamp01된
 * 값을 다시 roundHalf/clamp01해도 변하지 않기 때문.
 */
export function recommend(
  ctx: PerfumeContext,
  profile?: ScentProfile | null,
): Recommendation {
  const families = rankFamilies(ctx).slice(0, 4);
  const concentration = recommendConcentration(ctx);
  const top = families[0].id;
  const factors = profileFactors(profile);
  const longevityHours = roundHalf(
    predictLongevity(ctx, concentration.id, top) * factors.longevity,
  );
  const projection = clamp01(
    predictProjection(ctx, concentration.id, top) + factors.projection,
  );
  const timeline = buildTimeline(ctx, top, longevityHours, projection);
  const tips = buildTips(ctx, concentration.id, profile);

  const caveat =
    '이 예측은 피부 유분·계절·습도·상황 같은 측정 가능한 조건 기반의 방향성 가이드다. ' +
    '실제 발향은 개인의 피부 상재균·pH·호르몬에 따라 달라지므로, 최종 판단은 직접 시향하고 ' +
    '30분 뒤 미들 노트까지 확인하는 것을 권한다.';

  return {
    concentration,
    families,
    longevityHours,
    longevityLabel: longevityLabel(longevityHours),
    projection,
    projectionLabel: projectionLabel(projection),
    timeline,
    tips,
    caveat,
  };
}

// ── UI가 공유하는 옵션 목록 ───────────────────────────────────────────────
export const SKIN_OPTIONS: {id: SkinType; label: string}[] = [
  {id: 'dry', label: '건성'},
  {id: 'normal', label: '중성'},
  {id: 'oily', label: '지성'},
];
export const CLIMATE_OPTIONS: {id: Climate; label: string}[] = [
  {id: 'cold', label: '추움'},
  {id: 'mild', label: '선선'},
  {id: 'hot', label: '더움'},
];
export const HUMIDITY_OPTIONS: {id: Humidity; label: string}[] = [
  {id: 'dry', label: '건조'},
  {id: 'normal', label: '보통'},
  {id: 'humid', label: '습함'},
];
export const OCCASION_OPTIONS: {id: Occasion; label: string}[] = [
  {id: 'daily', label: '데일리'},
  {id: 'office', label: '오피스'},
  {id: 'date', label: '데이트'},
  {id: 'evening', label: '이브닝'},
  {id: 'active', label: '액티브'},
];
export const INTENSITY_OPTIONS: {id: IntensityPref; label: string}[] = [
  {id: 'subtle', label: '은은'},
  {id: 'moderate', label: '적당'},
  {id: 'bold', label: '강함'},
];

export const DEFAULT_CONTEXT: PerfumeContext = {
  skin: 'normal',
  climate: 'mild',
  humidity: 'normal',
  occasion: 'daily',
  intensity: 'moderate',
};

export {climateShort, skinLabel, humidityLabel};
