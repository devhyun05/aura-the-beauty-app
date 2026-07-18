/**
 * 제품 — 채널 구조(분류체계 §5, A12 Phase A) — "물감"을 1급 엔티티로.
 *
 * 제품(ProductDef)은 라이브러리 엔티티다 — 레이어(잎)는 productId로 참조하고,
 * 시중품 프리셋은 같은 스키마의 내장 인스턴스(SYSTEM_PRODUCTS)일 뿐이다. 제품은
 * "빛을 어떻게 변환하나"를 채널(광학 현상 단위 = 셰이더 항)로 담는다:
 *   base    = 루마 보존 틴트(곱)         — ✅ 부위 *Color + opacity 합성 전달
 *   pearl   = 각도 의존 반사(가산)        — 🟡 시머로 근사(Finish.cginc). 듀오크롬(shift)·간섭광은 A15
 *   glitter = 이산 스파클(가산, ≤3)       — ✅ *ShimmerSize·Density(셀 해시). 다중 인스턴스=믹스 토퍼
 *   neon    = 발광(루마 초과 가산)         — ❌ 렌더 미지원(A15) — 데이터만 보존
 * 고정된 것은 이 채널 어휘 4종이지 제품의 구성이 아니다 — 전 슬롯 선택적이고, 어떤
 * 슬롯을 노출하고 기본값이 뭔지는 제품군 템플릿(FAMILY_TEMPLATES)이 정한다("축 6종
 * 고정, 부위별 노출 다름"의 퇴화 케이스 — R2 연장).
 *
 * 번역기(translateProduct)는 Unity 무변경 원칙을 지킨다 — 제품×테크닉 강도를 대상
 * 부위가 이미 소유한 브리지 필드(*Color·intensity·*Finish·*Shimmer·마감 세부)로만
 * 컴파일하고, 부위 비소유 필드는 절대 담지 않는다(regionOwnKeys 화이트리스트로 강제 —
 * 부위·필드가 늘어도 드리프트하지 않는다). 부위→필드 매핑은 multiUse.categoryKeys가
 * 카탈로그(regions.ts) 축 선언에서 유도하는 선례를 그대로 재사용한다.
 *
 * ⚠ 브리지엔 컴파일된 patch만 넘긴다 — 채널·제형 등 제품 상태 모델은 RN에만 산다.
 */
import type { FilterParams } from '../bridge/types';
import { categoryKeys } from './multiUse';
import { REGION_MAP, regionOwnKeys } from './regions';
import type { FinishDetailKeys, RegionDef, RegionKey } from './regions';

// ── 채널 타입(§5 그대로) ─────────────────────────────────────────────────────

/** 채널 반응곡선 — 강도 대비 발현(선형/부드럽게/급격히). Phase A는 데이터만 보존. */
export type ChannelResponse = 'linear' | 'soft' | 'hard';

/** 베이스 — 루마 보존 틴트(곱). 1회 농도(coverage)와 색. */
export interface ChannelBase {
  color: string;
  /** 1회 도포 최대 농도 0..1 (덧바름 곡선은 form.buildability) */
  coverage: number;
  response?: ChannelResponse;
}

/** 펄 — 각도 의존 반사(가산). 시머로 근사. shift=듀오크롬 색B(A15 대기, 채널 증설 아님). */
export interface ChannelPearl {
  color: string;
  gain: number;
  response?: ChannelResponse;
  /** 듀오크롬 색A→색B 전환색 — 렌더 미지원(A15), ProductDef에 보존만 */
  shift?: string;
}

/** 글리터 — 이산 스파클(가산). 다중 인스턴스=믹스 토퍼(≤3). holo=입자별 무지개(파라미터). */
export interface ChannelGlitter {
  color: string;
  /** 입자 크기 0..1 (고운↔굵은) */
  size: number;
  /** 입자 밀도 0..1 */
  density: number;
  response?: ChannelResponse;
  /** 홀로그램(입자별 무지개) — 파라미터(채널 아님). 렌더 미지원 시 보존만 */
  holo?: boolean;
}

/** 네온 — 발광(루마 초과 가산). 렌더 미지원(A15) — 데이터 보존만. */
export interface ChannelNeon {
  color: string;
  gain: number;
}

/** 제형 — 채널이 아니라 "쌓임·뭉갬·광"의 성질. */
export interface ProductForm {
  /** 뭉갬 한계(가장자리 최대 부드러움) — 마스크 베이킹 전담(A14), 런타임 유니폼 없음 */
  blendability: number;
  /** 덧바름 쌓임 곡선 — CPU 합성(coverage⊗강도→opacity), 셰이더 무변경 */
  buildability: number;
  /** 마감 enum(0=새틴 기준…1=매트 2=글로시 3=시머, FINISHES 사다리) */
  finish: number;
  /** 시머 게인 0..1 — finish=3(시머)일 때 *Shimmer로 전달(펄 채널 없이 시머 제형일 때) */
  shimmerGain?: number;
}

/** 제품 정의 — 라이브러리 엔티티. 전 채널 슬롯 선택적, glitter ≤3. */
export interface ProductDef {
  id: string;
  name: string;
  /** 시중품 느낌 라벨(실브랜드 아님) — '벨벳핏 쿠션' 류 */
  brandish?: string;
  /** 제품군 — 채널 템플릿·적합 부위를 결정(FAMILY_TEMPLATES) */
  family: ProductFamily;
  base?: ChannelBase;
  pearl?: ChannelPearl;
  /** 글리터 인스턴스 ≤3 (다중=믹스 토퍼) */
  glitter?: ChannelGlitter[];
  neon?: ChannelNeon;
  form: ProductForm;
  /** 제형(§5 — 제품이 품는 속성) — 대상 부위 `<region>Texture` enum 값. 부재=부위
   *  기본(0=크림/baseline). 값 규약은 대상 부위 제형 세그(regions.ts)를 따르므로
   *  제품군의 주 부위 템플릿에 맞춰 지정한다(예: 립=LIP_TEXTURES 벨벳틴트=1). */
  texture?: number;
  owner: 'system' | 'user';
}

// ── 제품군 템플릿 — "구성은 제품군 템플릿"(§5) ───────────────────────────────

export type ProductFamily =
  | 'foundation'
  | 'concealer'
  | 'lip'
  | 'lipTint'
  | 'lipLiner'
  | 'lipGloss'
  | 'blush'
  | 'eyeshadow'
  | 'glitterTopper'
  | 'highlighter'
  | 'contour'
  | 'powder'
  | 'eyeliner'
  | 'mascara'
  | 'brow'
  | 'hairTint'
  | 'neonPaint';

/** 채널 슬롯 이름 — 노출 여부·준수 검증의 단위. */
export type ChannelSlot = 'base' | 'pearl' | 'glitter' | 'neon';

/** 제품군 템플릿 — 노출 채널 슬롯 + 채널 기본값 + 적합 세부부위. */
export interface FamilyTemplate {
  label: string;
  /** 이 제품군이 노출하는 채널 슬롯(허용 상위집합 — 인스턴스는 부분집합) */
  slots: ChannelSlot[];
  /** 적합 세부부위(RegionKey) — 멀티유즈는 R6 3축 번역이 별도 담당 */
  regions: RegionKey[];
  /** 새 제품 생성 시드 채널 기본값 */
  base?: ChannelBase;
  pearl?: ChannelPearl;
  glitter?: ChannelGlitter;
  neon?: ChannelNeon;
  form: ProductForm;
}

/** 제형 공통 기본값 셰이퍼 — 템플릿 form 선언을 짧게. */
const form = (
  buildability: number,
  finish: number,
  blendability = 0.5,
): ProductForm => ({ blendability, buildability, finish });

export const FAMILY_TEMPLATES: Record<ProductFamily, FamilyTemplate> = {
  // 파운데=베이스만(§5 사례). 마감은 부위 고유 세그(0=새틴 1=매트 2=듀이)라 번역 제외.
  foundation: {
    label: '파운데이션',
    slots: ['base'],
    regions: ['foundation'],
    base: { color: '#E0B49A', coverage: 0.5, response: 'soft' },
    form: form(0.4, 0, 0.6),
  },
  concealer: {
    label: '컨실러',
    slots: ['base'],
    regions: ['concealer', 'lipBase'],  // 립 지우기(베이스립)도 컨실러 소관
    base: { color: '#E8C0A6', coverage: 0.7, response: 'hard' },
    form: form(0.35, 0, 0.55),
  },
  // 립스틱 — 베이스 중심, 프로스트(펄) 변형 허용.
  lip: {
    label: '립스틱',
    slots: ['base', 'pearl'],
    regions: ['lip'],
    base: { color: '#C0392B', coverage: 0.7, response: 'linear' },
    pearl: { color: '#E8C7C2', gain: 0.4 },
    form: form(0.45, 0),
  },
  // 립틴트 — 시어(낮은 coverage)·잘 쌓임(높은 buildability).
  lipTint: {
    label: '립틴트',
    slots: ['base'],
    regions: ['lip'],
    base: { color: '#D24B54', coverage: 0.35, response: 'soft' },
    form: form(0.7, 2),
  },
  // 블러셔 — 매트/펄 모두.
  blush: {
    label: '블러셔',
    slots: ['base', 'pearl'],
    regions: ['blush'],
    base: { color: '#E88CA0', coverage: 0.5, response: 'soft' },
    pearl: { color: '#F0C4CE', gain: 0.4 },
    form: form(0.5, 0),
  },
  // 아이섀도 — 매트·시머·듀오크롬(pearl.shift).
  eyeshadow: {
    label: '아이섀도',
    slots: ['base', 'pearl'],
    regions: ['eyeshadow', 'eyeshadowLower'],  // 언더 섀도도 같은 섀도 제품
    base: { color: '#8A6A55', coverage: 0.5, response: 'soft' },
    pearl: { color: '#C9A98A', gain: 0.5 },
    form: form(0.5, 0),
  },
  // 글리터 토퍼=글리터만(§5 사례). 세부 필드(*ShimmerSize·Density) 보유 부위에만 적합.
  glitterTopper: {
    label: '글리터 토퍼',
    slots: ['glitter'],
    regions: ['eyeshadow', 'blush', 'lip'],
    glitter: { color: '#D9C48A', size: 0.4, density: 0.5 },
    form: form(0.3, 0),
  },
  // 하이라이터=펄 중심(§5 사례). base가 색·농도를, pearl이 광 강조를 담당하지만
  // highlighter 부위는 *Shimmer 필드가 없어 pearl은 현재 데이터 보존만(렌더는 부위가 이미 글로우).
  highlighter: {
    label: '하이라이터',
    slots: ['base', 'pearl'],
    regions: ['highlighter', 'aegyo'],  // 애교살 펄 스틱=하이라이터류
    base: { color: '#F3E3C8', coverage: 0.4, response: 'soft' },
    pearl: { color: '#F7ECD6', gain: 0.6 },
    form: form(0.35, 3),
  },
  contour: {
    label: '컨투어',
    slots: ['base'],
    regions: ['contour', 'triangleZone'],  // 삼각존 음영도 섀딩 제품
    base: { color: '#8A6B54', coverage: 0.4, response: 'soft' },
    form: form(0.35, 1),
  },
  // 파우더 — 트랜스루선트(무색)만이 아니라 컬러(톤업 캐스트)·펄(피니싱) 모두.
  // base.color=캐스트(흰색=무색), pearl=펄 파우더(powderFinish=3 시머 근사).
  powder: {
    label: '파우더',
    slots: ['base', 'pearl'],
    regions: ['powder'],
    base: { color: '#FFFFFF', coverage: 0.5, response: 'soft' },
    pearl: { color: '#F7ECD6', gain: 0.4 },
    form: form(0.4, 1),
  },
  eyeliner: {
    label: '아이라이너',
    slots: ['base'],
    regions: ['eyelinerUpper', 'eyelinerLower'],
    base: { color: '#1A1A1A', coverage: 0.6, response: 'hard' },
    form: form(0.5, 0),
  },
  // 마스카라 — 상·하 속눈썹 공용(색·볼륨감=coverage).
  mascara: {
    label: '마스카라',
    slots: ['base'],
    regions: ['mascara', 'lowerMascara'],
    base: { color: '#1A1414', coverage: 0.6, response: 'soft' },
    form: form(0.5, 1),
  },
  // 브로우 — 결(마스카라)·채움(파우더)·한올(펜슬)·스타일 공용 색 제품.
  brow: {
    label: '브로우',
    slots: ['base'],
    regions: ['brow', 'browPowder', 'browPencil', 'browStyle'],
    base: { color: '#4A3628', coverage: 0.5, response: 'soft' },
    form: form(0.45, 1),
  },
  // 립라이너 — 외곽 링(매트).
  lipLiner: {
    label: '립라이너',
    slots: ['base'],
    regions: ['lipLiner'],
    base: { color: '#9E3B54', coverage: 0.6, response: 'hard' },
    form: form(0.4, 1),
  },
  // 립글로스 — 틴트(흰색=클리어) + 펄 변형.
  lipGloss: {
    label: '립글로스',
    slots: ['base', 'pearl'],
    regions: ['lipGloss'],
    base: { color: '#FFFFFF', coverage: 0.5, response: 'soft' },
    pearl: { color: '#F7E0DC', gain: 0.4 },
    form: form(0.5, 2),
  },
  // 헤어 틴트 — 루마 보존 염색.
  hairTint: {
    label: '헤어 틴트',
    slots: ['base'],
    regions: ['hair'],
    base: { color: '#5A4030', coverage: 0.5, response: 'soft' },
    form: form(0.4, 0),
  },
  // 네온 페인팅=네온 중심(§5 사례). base가 가시 발색, neon이 발광(A15 대기 — 데이터만).
  neonPaint: {
    label: '네온 페인트',
    slots: ['base', 'neon'],
    regions: ['lip', 'eyeshadow'],
    base: { color: '#39FF14', coverage: 0.5, response: 'hard' },
    neon: { color: '#39FF14', gain: 0.8 },
    form: form(0.4, 0),
  },
};

// ── 테크닉(Phase A는 강도만) — 모양·프로파일은 기존 축이 유지 ───────────────

/** 레이어가 소유하는 '하는 일'의 강도 — Phase A는 덧바름 압력(0..1)만 다룬다. */
export interface LeafTechnique {
  strength: number;
}

// ── 번역기 — 제품×테크닉 → 부위 소유 브리지 필드 ────────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 덧바름 쌓임 곡선(§5 buildability). 단조 증가·[0,coverage] 클램프:
 *   opacity = coverage · strength^(1 / (0.5 + buildability))
 * buildability↑ → 지수↓ → 낮은 강도에서도 빨리 쌓인다("잘 쌓이는 제품").
 * "시어한 제품×5회 ≈ 진한 제품×1회"는 버그가 아니라 실제 화장의 성질.
 */
function buildOpacity(
  coverage: number,
  strength: number,
  buildability: number,
): number {
  const s = clamp01(strength);
  const exp = 1 / (0.5 + clamp01(buildability));
  return clamp01(coverage * Math.pow(s, exp));
}

/** 부위 finish 컨트롤의 마감 세부 키(글리터 셀 해시 대상). 없으면 undefined. */
function finishDetailOf(def: RegionDef): FinishDetailKeys | undefined {
  for (const c of def.axes.finish ?? []) {
    if (c.type === 'finish') return c.detail;
  }
  return undefined;
}

/** 부위 제형(텍스처) enum 필드 = axes.texture 첫 segments 컨트롤 (예: eyeshadowTexture).
 *  카탈로그가 단일 출처(categoryKeys 색·마감 유도 선례). 제형 축 없는 부위는 undefined. */
function textureKeyOf(def: RegionDef): keyof FilterParams | undefined {
  for (const c of def.axes.texture ?? []) {
    if (c.type === 'segments') return c.key;
  }
  return undefined;
}

/**
 * 제품×테크닉 강도를 대상 부위의 브리지 필드로 번역한다(부위 소유 필드만 반환).
 * 담지 않는 것: blendability(마스크 베이킹 A14) · neon(발광 A15) · pearl.shift(듀오크롬 A15) ·
 * glitter 2번째 이후 인스턴스(단일 셀 해시라 미지원) — 전부 ProductDef에 데이터로 보존된다.
 */
export function translateProduct(
  p: ProductDef,
  t: LeafTechnique,
  region: RegionKey,
): Partial<FilterParams> {
  const def = REGION_MAP[region];
  const ck = categoryKeys(def);
  const patch: Partial<FilterParams> = {};
  const put = (k: keyof FilterParams, v: unknown) => {
    (patch as Record<string, unknown>)[k] = v;
  };

  // 베이스 — 색(루마 보존 틴트) + 최종 농도(coverage ⊗ 강도).
  if (p.base) {
    if (ck.colorKey) put(ck.colorKey, p.base.color);
    if (ck.intensityKey) {
      put(ck.intensityKey, buildOpacity(p.base.coverage, t.strength, p.form.buildability));
    }
  }

  // 제형(§5) — 제품이 품는 속성을 대상 부위 제형 enum 필드로. 부위에 제형 축이 있을
  // 때만(textureKey), 제품이 제형을 명시할 때만(부재=0 클로버링 방지) 전달한다.
  const textureKey = textureKeyOf(def);
  if (p.texture !== undefined && textureKey) {
    put(textureKey, p.texture);
  }

  // 마감 — FINISHES 사다리 부위(립·블러셔·아이섀도)만. 0=새틴=baseline이라, 베이스가
  // 있거나(제품의 명시적 새틴 선택) finish≠0일 때만 전달(부재=0 클로버링 방지).
  if (ck.finishKey && ck.finishIsLadder && (p.base || p.form.finish !== 0)) {
    put(ck.finishKey, p.form.finish);
    // 펄 채널 없이 시머 제형(finish=3)이면 form.shimmerGain을 게인으로.
    if (p.form.finish === 3 && ck.shimmerKey && p.form.shimmerGain !== undefined) {
      put(ck.shimmerKey, clamp01(p.form.shimmerGain));
    }
  }

  // 펄 — 시머로 근사(§5): finish를 3(시머)으로 올리고 게인을 *Shimmer로. (shift=A15 보존)
  if (p.pearl) {
    if (ck.finishKey && ck.finishIsLadder) put(ck.finishKey, 3);
    if (ck.shimmerKey) put(ck.shimmerKey, clamp01(p.pearl.gain));
  }

  // 글리터 — 첫 인스턴스만 마감 세부(셀 해시)로. 세부 필드 없는 부위는 펄 근사에 합산.
  const g = p.glitter?.[0];
  if (g) {
    const detail = finishDetailOf(def);
    if (detail) {
      put(detail.shimmerSize, clamp01(g.size));
      put(detail.shimmerDensity, clamp01(g.density));
    } else if (ck.finishKey && ck.finishIsLadder && ck.shimmerKey) {
      // 세부 필드 미보유 부위 — 시머 마감 + 밀도를 게인에 근사 합산.
      put(ck.finishKey, 3);
      const prev = (patch[ck.shimmerKey] as number) ?? 0;
      put(ck.shimmerKey, clamp01(prev + g.density));
    }
    // g[1..]는 미지원(단일 셀 해시) — ProductDef에 보존만.
  }

  // neon — 렌더 필드 없음(A15). blendability — 매핑 없음(마스크 베이킹 A14). 둘 다 무매핑.

  // 부위 소유 필드 화이트리스트 강제 — 비소유 필드는 절대 반환하지 않는다.
  const own = new Set<string>(regionOwnKeys(def) as string[]);
  const out: Partial<FilterParams> = {};
  for (const k of Object.keys(patch)) {
    if (own.has(k)) {
      (out as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k];
    }
  }
  return out;
}

// ── 시중품 프리셋 시드 ───────────────────────────────────────────────────────

/** 내장 제품 — 제품군당 2~3개. 실브랜드 금지(시중품 느낌 라벨만). */
export const SYSTEM_PRODUCTS: ProductDef[] = [
  // 파운데이션
  {
    id: 'sys:prod:foundation:velvet-cushion',
    name: '벨벳핏 쿠션',
    brandish: '벨벳핏 쿠션',
    family: 'foundation',
    base: { color: '#E0B49A', coverage: 0.5, response: 'soft' },
    form: form(0.4, 0, 0.6),
    texture: 1, // 쿠션 (FOUNDATION_TEXTURES)
    owner: 'system',
  },
  {
    id: 'sys:prod:foundation:matte-veil',
    name: '매트베일 파운데',
    brandish: '매트베일 파운데',
    family: 'foundation',
    base: { color: '#D9A183', coverage: 0.6, response: 'hard' },
    form: form(0.35, 1, 0.55),
    owner: 'system',
  },
  // 컨실러
  {
    id: 'sys:prod:concealer:cover-fix',
    name: '커버픽스 컨실러',
    brandish: '커버픽스 컨실러',
    family: 'concealer',
    base: { color: '#E8C0A6', coverage: 0.7, response: 'hard' },
    form: form(0.35, 0, 0.5),
    owner: 'system',
  },
  {
    id: 'sys:prod:concealer:natural-cover',
    name: '내추럴커버 컨실러',
    brandish: '내추럴커버 컨실러',
    family: 'concealer',
    base: { color: '#E0B49A', coverage: 0.5, response: 'soft' },
    form: form(0.4, 0, 0.6),
    owner: 'system',
  },
  // 립스틱
  {
    id: 'sys:prod:lip:velvet-matte',
    name: '벨벳 매트 립',
    brandish: '벨벳 매트 립',
    family: 'lip',
    base: { color: '#B5322B', coverage: 0.7, response: 'linear' },
    form: form(0.45, 1),
    texture: 1, // 벨벳틴트 (LIP_TEXTURES)
    owner: 'system',
  },
  {
    id: 'sys:prod:lip:glossy-syrup',
    name: '글로시 시럽 립',
    brandish: '글로시 시럽 립',
    family: 'lip',
    base: { color: '#E8735A', coverage: 0.5, response: 'soft' },
    form: form(0.55, 2),
    owner: 'system',
  },
  {
    id: 'sys:prod:lip:frost-pearl',
    name: '프로스트 펄 립',
    brandish: '프로스트 펄 립',
    family: 'lip',
    base: { color: '#D98BA0', coverage: 0.55, response: 'soft' },
    pearl: { color: '#F0D6DC', gain: 0.5 },
    form: form(0.45, 0),
    owner: 'system',
  },
  // 립틴트
  {
    id: 'sys:prod:lipTint:water-tint',
    name: '워터 틴트',
    brandish: '워터 틴트',
    family: 'lipTint',
    base: { color: '#D24B54', coverage: 0.35, response: 'soft' },
    form: form(0.7, 2),
    texture: 2, // 워터틴트 (LIP_TEXTURES)
    owner: 'system',
  },
  {
    id: 'sys:prod:lipTint:velvet-blur',
    name: '벨벳 블러 틴트',
    brandish: '벨벳 블러 틴트',
    family: 'lipTint',
    base: { color: '#B5555F', coverage: 0.4, response: 'soft' },
    form: form(0.6, 1),
    texture: 1, // 벨벳틴트 (LIP_TEXTURES)
    owner: 'system',
  },
  // 블러셔
  {
    id: 'sys:prod:blush:silky-cream',
    name: '실키 크림 블러셔',
    brandish: '실키 크림 블러셔',
    family: 'blush',
    base: { color: '#E88CA0', coverage: 0.5, response: 'soft' },
    form: form(0.5, 0),
    owner: 'system',
  },
  {
    id: 'sys:prod:blush:pearl-glow',
    name: '펄 글로우 블러셔',
    brandish: '펄 글로우 블러셔',
    family: 'blush',
    base: { color: '#F0A9B6', coverage: 0.45, response: 'soft' },
    pearl: { color: '#F5D2DA', gain: 0.4 },
    form: form(0.5, 0),
    owner: 'system',
  },
  // 아이섀도 (매트·펄·듀오크롬)
  {
    id: 'sys:prod:eyeshadow:daily-matte',
    name: '데일리 매트 섀도',
    brandish: '데일리 매트 섀도',
    family: 'eyeshadow',
    base: { color: '#8A6A55', coverage: 0.5, response: 'soft' },
    form: form(0.5, 1),
    owner: 'system',
  },
  {
    id: 'sys:prod:eyeshadow:shine-pearl',
    name: '샤인 펄 섀도',
    brandish: '샤인 펄 섀도',
    family: 'eyeshadow',
    base: { color: '#C9A98A', coverage: 0.5, response: 'soft' },
    pearl: { color: '#E6D2B8', gain: 0.55 },
    form: form(0.5, 0),
    owner: 'system',
  },
  {
    id: 'sys:prod:eyeshadow:aurora-duochrome',
    name: '오로라 듀오크롬 섀도',
    brandish: '오로라 듀오크롬 섀도',
    family: 'eyeshadow',
    base: { color: '#6E5A8C', coverage: 0.45, response: 'soft' },
    // shift=색B(A15 대기 — 데이터 보존, 번역은 시머 근사)
    pearl: { color: '#8C7AB0', gain: 0.6, shift: '#3E7C6A' },
    form: form(0.5, 0),
    owner: 'system',
  },
  // 글리터 토퍼 (단일 · 믹스 2종)
  {
    id: 'sys:prod:glitterTopper:stardust',
    name: '스타더스트 토퍼',
    brandish: '스타더스트 토퍼',
    family: 'glitterTopper',
    glitter: [{ color: '#E8D8A8', size: 0.35, density: 0.5 }],
    form: form(0.3, 0),
    owner: 'system',
  },
  {
    id: 'sys:prod:glitterTopper:galaxy-mix',
    name: '갤럭시 믹스 토퍼',
    brandish: '갤럭시 믹스 토퍼',
    family: 'glitterTopper',
    // 믹스 사례(§5 07-11) — 고운 실버 + 굵은 바이올렛(번역은 첫 인스턴스만).
    glitter: [
      { color: '#E8E4F0', size: 0.25, density: 0.6 },
      { color: '#C0A0D8', size: 0.7, density: 0.35, holo: true },
    ],
    form: form(0.3, 0),
    owner: 'system',
  },
  // 하이라이터 (펄 중심)
  {
    id: 'sys:prod:highlighter:glowbeam',
    name: '글로우빔 토퍼',
    brandish: '글로우빔 토퍼',
    family: 'highlighter',
    base: { color: '#F3E3C8', coverage: 0.4, response: 'soft' },
    pearl: { color: '#F7ECD6', gain: 0.6 },
    form: form(0.35, 3),
    owner: 'system',
  },
  {
    id: 'sys:prod:highlighter:liquid-glass',
    name: '리퀴드 글래스 하이라이터',
    brandish: '리퀴드 글래스 하이라이터',
    family: 'highlighter',
    base: { color: '#F0E0D0', coverage: 0.5, response: 'soft' },
    pearl: { color: '#FBF2E4', gain: 0.5 },
    form: form(0.4, 3),
    texture: 2, // 리퀴드 (GENERIC_TEXTURES — highlight/aegyo 공용)
    owner: 'system',
  },
  // 컨투어
  {
    id: 'sys:prod:contour:sculpt-shadow',
    name: '섀도우 스컬프 컨투어',
    brandish: '섀도우 스컬프 컨투어',
    family: 'contour',
    base: { color: '#8A6B54', coverage: 0.4, response: 'soft' },
    form: form(0.35, 1),
    owner: 'system',
  },
  {
    id: 'sys:prod:contour:natural-shading',
    name: '내추럴 셰이딩',
    brandish: '내추럴 셰이딩',
    family: 'contour',
    base: { color: '#7A5E4A', coverage: 0.35, response: 'soft' },
    form: form(0.4, 1),
    owner: 'system',
  },
  // 마스카라
  {
    id: 'sys:prod:mascara:volume-black',
    name: '볼륨 블랙',
    brandish: '맥스 볼륨 마스카라',
    family: 'mascara',
    base: { color: '#0E0A0E', coverage: 0.65, response: 'soft' },
    form: form(0.5, 1),
    owner: 'system',
  },
  {
    id: 'sys:prod:mascara:natural-brown',
    name: '내추럴 브라운',
    brandish: '데일리 브라운 마스카라',
    family: 'mascara',
    base: { color: '#3A2A20', coverage: 0.5, response: 'soft' },
    form: form(0.55, 1),
    owner: 'system',
  },
  // 브로우
  {
    id: 'sys:prod:brow:powder-duo',
    name: '브로우 파우더 듀오',
    brandish: '내추럴 브로우 카라',
    family: 'brow',
    base: { color: '#4A3628', coverage: 0.5, response: 'soft' },
    form: form(0.5, 1),
    owner: 'system',
  },
  {
    id: 'sys:prod:brow:dark-defined',
    name: '다크 디파인',
    brandish: '롱라스팅 브로우',
    family: 'brow',
    base: { color: '#2A1E16', coverage: 0.6, response: 'hard' },
    form: form(0.4, 1),
    owner: 'system',
  },
  // 립라이너
  {
    id: 'sys:prod:lipLiner:rose',
    name: '로즈 라이너',
    brandish: '슬림 립 펜슬',
    family: 'lipLiner',
    base: { color: '#9E3B54', coverage: 0.6, response: 'hard' },
    form: form(0.4, 1),
    texture: 4, // 펜슬 (GENERIC_TEXTURES)
    owner: 'system',
  },
  {
    id: 'sys:prod:lipLiner:mlbb',
    name: 'MLBB 라이너',
    brandish: '뮤트 로즈 펜슬',
    family: 'lipLiner',
    base: { color: '#B56C6A', coverage: 0.55, response: 'hard' },
    form: form(0.45, 1),
    texture: 4, // 펜슬 (GENERIC_TEXTURES)
    owner: 'system',
  },
  // 립글로스
  {
    id: 'sys:prod:lipGloss:clear',
    name: '클리어 글로스',
    brandish: '글래스 립 오일',
    family: 'lipGloss',
    base: { color: '#FFFFFF', coverage: 0.55, response: 'soft' },
    form: form(0.5, 2),
    owner: 'system',
  },
  {
    id: 'sys:prod:lipGloss:pink-pearl',
    name: '핑크 펄 글로스',
    brandish: '샤인 틴트 글로스',
    family: 'lipGloss',
    base: { color: '#F7D9D0', coverage: 0.5, response: 'soft' },
    pearl: { color: '#FBE9E4', gain: 0.45 },
    form: form(0.5, 2),
    owner: 'system',
  },
  // 헤어 틴트
  {
    id: 'sys:prod:hairTint:ash-brown',
    name: '애쉬 브라운',
    brandish: '원데이 헤어 틴트',
    family: 'hairTint',
    base: { color: '#8A7A6A', coverage: 0.5, response: 'soft' },
    form: form(0.4, 0),
    owner: 'system',
  },
  {
    id: 'sys:prod:hairTint:wine',
    name: '와인',
    brandish: '원데이 헤어 틴트',
    family: 'hairTint',
    base: { color: '#6E2A3A', coverage: 0.5, response: 'soft' },
    form: form(0.4, 0),
    owner: 'system',
  },
  // 파우더 — 무색 세팅/컬러 톤업/펄 피니싱(§5 "파우더도 색·마감·제형 전부").
  {
    id: 'sys:prod:powder:translucent',
    name: '트랜스루선트 세팅',
    brandish: '노세범 세팅 파우더',
    family: 'powder',
    base: { color: '#FFFFFF', coverage: 0.5, response: 'soft' }, // 흰색=무색 캐스트
    form: form(0.4, 1),
    owner: 'system',
  },
  {
    id: 'sys:prod:powder:pink-toneup',
    name: '핑크 톤업 파우더',
    brandish: '글로우 톤업 파우더',
    family: 'powder',
    base: { color: '#FBE8EC', coverage: 0.45, response: 'soft' },
    form: form(0.45, 0),
    owner: 'system',
  },
  {
    id: 'sys:prod:powder:pearl-finishing',
    name: '펄 피니싱 파우더',
    brandish: '샤이니 피니시 파우더',
    family: 'powder',
    base: { color: '#FAE9DC', coverage: 0.4, response: 'soft' },
    pearl: { color: '#F7ECD6', gain: 0.5 },
    form: form(0.35, 3, 0.5),
    owner: 'system',
  },
  // 아이라이너
  {
    id: 'sys:prod:eyeliner:ink-liquid',
    name: '잉크 리퀴드 라이너',
    brandish: '잉크 리퀴드 라이너',
    family: 'eyeliner',
    base: { color: '#1A1A1A', coverage: 0.65, response: 'hard' },
    form: form(0.5, 0),
    owner: 'system',
  },
  {
    id: 'sys:prod:eyeliner:soft-gel',
    name: '소프트 젤 라이너',
    brandish: '소프트 젤 라이너',
    family: 'eyeliner',
    base: { color: '#4A3526', coverage: 0.5, response: 'soft' },
    form: form(0.5, 0),
    texture: 1, // 젤 (EYELINER_TEXTURES — eyelinerUpper만 제형 축, lower는 무시됨)
    owner: 'system',
  },
  // 네온 페인트 (neon 채널 — 렌더 대기 A15)
  {
    id: 'sys:prod:neonPaint:neon-glow',
    name: '네온 글로우 페인트',
    brandish: '네온 글로우 페인트',
    family: 'neonPaint',
    base: { color: '#39FF14', coverage: 0.55, response: 'hard' },
    neon: { color: '#39FF14', gain: 0.85 },
    form: form(0.4, 0),
    owner: 'system',
  },
  {
    id: 'sys:prod:neonPaint:uv-magenta',
    name: 'UV 마젠타 페인트',
    brandish: 'UV 마젠타 페인트',
    family: 'neonPaint',
    base: { color: '#FF3B9A', coverage: 0.5, response: 'hard' },
    neon: { color: '#FF3B9A', gain: 0.8 },
    form: form(0.4, 0),
    owner: 'system',
  },
];

// ── 유틸 ─────────────────────────────────────────────────────────────────────

/** 이 부위에 적합한 제품 목록(제품군 템플릿 regions로 필터). extra=사용자 제품. */
export function productsForRegion(
  region: RegionKey,
  extra: ProductDef[] = [],
): ProductDef[] {
  return [...SYSTEM_PRODUCTS, ...extra].filter(p =>
    FAMILY_TEMPLATES[p.family].regions.includes(region),
  );
}

/**
 * 제품·부위 분리 — 제품군 단위 목록. 적합(제품군 regions에 이 부위 포함) 먼저,
 * 나머지 전 제품군은 멀티유즈 후보("섀도우를 하이라이터로"). translateProduct가
 * 부위 소유 필드만 반환하므로 어떤 제품이든 안전하다(제품=물감, 부위=어디에).
 * 색·농도 축이 없는 부위(데코·렌즈 세부 등)는 번역이 공집합이라 others를 숨긴다.
 */
export function familiesRankedForRegion(region: RegionKey): {
  fit: ProductFamily[];
  others: ProductFamily[];
} {
  const fit: ProductFamily[] = [];
  const others: ProductFamily[] = [];
  for (const f of Object.keys(FAMILY_TEMPLATES) as ProductFamily[]) {
    (FAMILY_TEMPLATES[f].regions.includes(region) ? fit : others).push(f);
  }
  const ck = categoryKeys(REGION_MAP[region]);
  const translatable = !!(ck.colorKey || ck.intensityKey);
  return { fit, others: translatable ? others : [] };
}

/** 제품군의 제품 목록(시스템+사용자) — 제품군 칩 선택 시 하위 스트립. */
export function productsOfFamily(
  family: ProductFamily,
  extra: ProductDef[] = [],
): ProductDef[] {
  return [...SYSTEM_PRODUCTS, ...extra].filter(p => p.family === family);
}

/** id로 제품 조회 — 내장 우선, 없으면 사용자 제품에서. */
export function findProduct(
  id: string,
  userProducts: ProductDef[] = [],
): ProductDef | undefined {
  return (
    SYSTEM_PRODUCTS.find(p => p.id === id) ?? userProducts.find(p => p.id === id)
  );
}

// ── 컴파일 통합(단일 적용점) — flattenTree 결과 → 제품 번역 얹은 사본 ─────────

import type { ComposerLayer } from './model';

/**
 * productId를 참조하는 잎에 제품 번역값을 깐다(§5 레이어 = 제품(참조) × 테크닉).
 * 병합 순서: 번역값(제품이 정하는 색·마감·농도) ← leaf.params(모양·핏 룰 등
 * 비제품 필드 + 사용자 오버라이드가 이긴다 — copy-on-write 전 단계에서도 안전).
 * 적용 순서 규약: applyProductsToLayers(제품=룩 값 확정) → applyFitToLayers(개인
 * 델타) → compileLayers. 참조 없는 잎/미발견 제품은 그대로(항등 — 메모 친화).
 */
export function applyProductsToLayers(
  layers: ComposerLayer[],
  userProducts: ProductDef[] = [],
): ComposerLayer[] {
  let changed = false;
  const out = layers.map(layer => {
    if (!layer.productId) return layer;
    const product = findProduct(layer.productId, userProducts);
    if (!product) return layer; // 삭제된 제품 참조 — 잎 자체 값으로 폴백(고아 무해)
    const translated = translateProduct(
      product,
      layer.technique ?? { strength: 1 },
      layer.region,
    );
    if (Object.keys(translated).length === 0) return layer;
    changed = true;
    return { ...layer, params: { ...translated, ...layer.params } };
  });
  return changed ? out : layers;
}
