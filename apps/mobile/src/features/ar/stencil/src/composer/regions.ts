/**
 * 컴포저 부위 카탈로그 (메이크업-분류체계-정의.html 확정 구조) — 슬롯 8 × 세부 36 ×
 * 축 6종의 코드 매핑. 각 부위(RegionDef)가 자기 소유 브리지 필드와 축 편집기
 * (모양·텍스처·색·마감·농도·핏) 탭별 컨트롤을 선언하고, ComposerSheet는 이 정의만
 * 보고 UI를 렌더한다.
 *
 * 슬롯(REGION_GROUP.slot): 피부·컨투어·렌즈·눈·눈썹·립·헤어·데코 (+FIT는 별도 레인).
 * SLOT_OF_REGION(lookTree.ts)은 이 그룹 선언에서 슬롯을 유도한다(드리프트 방지).
 */
import type { FilterParams, LensLayer } from '../bridge/types';
import {
  BLUSH_COLORS,
  BROW_COLORS,
  CONCEALER_COLORS,
  CONTOUR_COLORS,
  EYELINER_COLORS,
  AEGYO_COLORS,
  EYESHADOW_COLORS,
  FOUNDATION_COLORS,
  HAIR_COLORS,
  HIGHLIGHT_COLORS,
  LIP_BASE_COLORS,
  LIP_COLORS,
  LIP_GLOSS_COLORS,
  POWDER_COLORS,
  TONE_BASE_COLORS,
  TRIANGLE_COLORS,
} from '../presets';
import type { SlotKey } from './lookTree';

/** 워프/핏·배치 조작 색 (설계 색 규약: 워프·배치=골드). 정본은 theme.ts. */
export { GOLD } from '../theme';

// 마감(finish) — 부위 공통. value는 셰이더 분기값과 1:1(0=새틴이 기본=현재 룩).
// 버튼은 광택 사다리 순서(매트→새틴→글로시→시머)로 보이고 value는 순서와 무관하다.
export const FINISHES = [
  { value: 1, label: '매트' },
  { value: 0, label: '새틴' },
  { value: 2, label: '글로시' },
  { value: 3, label: '시머' },
];

export interface DomainOption {
  value: number;
  label: string;
  /** 선택과 함께 적용할 제품 물성 기본값. 모양·핏·테크닉 값은 넣지 않는다. */
  patch?: ProductPropertyPatch;
}

/** 제품 선택이 함께 시드할 수 있는 물성 필드. 공간·모양·테크닉 필드는 의도적으로 제외한다. */
export const PRODUCT_PROPERTY_KEYS = [
  'foundationFinish',
  'powderShimmer',
  'browPowderShimmer',
  'highlightGlossLo',
  'highlightGlossGain',
  'highlightShimmerSize',
  'highlightShimmerDensity',
  'contourGlossLo',
  'contourMatte',
  'triangleZoneShimmer',
  'eyeshadowFinish',
  'eyeshadowGlossLo',
  'eyeshadowGlossGain',
  'eyeshadowShimmerSize',
  'eyeshadowShimmerDensity',
  'eyeshadowParticleSize',
  'eyeshadowParticleDensity',
  'aegyoFinish',
  'aegyoShimmer',
  'eyelinerLowerFinish',
  'eyelinerLowerShimmer',
  'lipGlossLo',
  'lipGlossGain',
] as const satisfies readonly (keyof FilterParams)[];

export type ProductPropertyKey = typeof PRODUCT_PROPERTY_KEYS[number];

export type ProductPropertyPatch = Partial<Pick<FilterParams, ProductPropertyKey>>;

// 부위별 마감 어휘. 내부 value는 기존 셰이더 규약(0=새틴 baseline)을 보존한다.
export const CONCEALER_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' }, { value: 0, label: '내추럴' },
];
export const POWDER_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' },
  { value: 3, label: '약펄', patch: { powderShimmer: 0.25 } },
];
export const BROW_POWDER_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' },
  { value: 3, label: '약펄', patch: { browPowderShimmer: 0.25 } },
];
export const BLUSH_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' }, { value: 0, label: '새틴' }, { value: 3, label: '시머' },
];
export const HIGHLIGHT_FINISHES: DomainOption[] = [
  {
    value: 0,
    label: '새틴 글로우',
    patch: { highlightGlossLo: 0.3, highlightGlossGain: 0.5 },
  },
  {
    value: 3,
    label: '펄',
    patch: {
      highlightGlossLo: 0.35,
      highlightGlossGain: 0.6,
      highlightShimmerSize: 0.3,
      highlightShimmerDensity: 0.5,
    },
  },
];
export const CONTOUR_FINISHES: DomainOption[] = [
  {
    value: 1,
    label: '매트',
    patch: { contourGlossLo: 0.351, contourMatte: 0.38 },
  },
];
export const TRIANGLE_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' },
  { value: 3, label: '시머', patch: { triangleZoneShimmer: 0.4 } },
];
export const EYESHADOW_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' }, { value: 0, label: '새틴' },
  { value: 3, label: '시머' },
  {
    value: 4,
    label: '글리터',
    patch: {
      eyeshadowGlossLo: 0.4,
      eyeshadowGlossGain: 0.7,
      eyeshadowShimmerSize: 0.6,
      eyeshadowShimmerDensity: 0.7,
      eyeshadowParticleSize: 0.6,
      eyeshadowParticleDensity: 0.5,
    },
  },
];
export const AEGYO_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' }, { value: 3, label: '시머' },
];
export const EYELINER_LOWER_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' }, { value: 2, label: '글로시' }, { value: 3, label: '시머' },
];
export const BROW_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' }, { value: 2, label: '왁스광' },
];
export const LIP_BASE_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' }, { value: 0, label: '새틴' },
];
export const LIP_FINISHES: DomainOption[] = [
  { value: 0, label: '새틴' }, { value: 1, label: '매트' },
  { value: 2, label: '글로시' }, { value: 3, label: '시머' },
];
export const LIP_LINER_FINISHES: DomainOption[] = [{ value: 1, label: '매트' }];
export const LIP_GLOSS_FINISHES: DomainOption[] = [
  { value: 2, label: '클리어광' }, { value: 3, label: '펄' },
];
export const MATTE_FINISHES: DomainOption[] = [{ value: 1, label: '매트' }];
export const SATIN_FINISHES: DomainOption[] = [{ value: 0, label: '새틴' }];
export const MASCARA_FINISHES: DomainOption[] = [
  { value: 0, label: '내추럴' }, { value: 1, label: '매트' }, { value: 2, label: '글로시 코팅' },
];

// ── 제형 스튜디오(#21) — 마감 세부 파라미터 축 ──────────────────────────────
// enum(FINISHES)의 내부 빛 반응을 슬라이더로 열어 커스텀 제형을 만든다. 다섯 축은
// 부위 무관 0..1 값(FinishBundle)이고, 부위별 브리지 필드(FinishDetailKeys)로 번역된다.
// 전부 0 = 미지정 = enum 기존 동작(Unity Finish.cginc가 레거시 경로로 분기 — 하위호환).
export type FinishAxis =
  | 'glossLo'
  | 'glossGain'
  | 'shimmerSize'
  | 'shimmerDensity'
  | 'matte'
  | 'sheen';

/** 부위별 마감 세부 브리지 필드 매핑 (finish 컨트롤이 소유 — regionOwnKeys가 유도). */
export type FinishDetailKeys = Record<FinishAxis, keyof FilterParams>;

/** 부위 무관 마감 세부 번들 (제형 프리셋 저장 단위). 0..1. */
export type FinishBundle = Record<FinishAxis, number>;

/** 제형 스튜디오 슬라이더 (표시 순서·라벨). */
export const FINISH_STUDIO_SLIDERS: { axis: FinishAxis; label: string }[] = [
  { axis: 'glossLo', label: '광 임계' },
  { axis: 'glossGain', label: '광 게인' },
  { axis: 'shimmerSize', label: '입자 크기' },
  { axis: 'shimmerDensity', label: '입자 밀도' },
  { axis: 'matte', label: '광 억제' },
  { axis: 'sheen', label: '벨벳 시' },
];

const lipFinishDetail: FinishDetailKeys = {
  glossLo: 'lipGlossLo',
  glossGain: 'lipGlossGain',
  shimmerSize: 'lipShimmerSize',
  shimmerDensity: 'lipShimmerDensity',
  matte: 'lipMatte',
  sheen: 'lipSheen',
};
const eyeshadowFinishDetail: FinishDetailKeys = {
  glossLo: 'eyeshadowGlossLo',
  glossGain: 'eyeshadowGlossGain',
  shimmerSize: 'eyeshadowShimmerSize',
  shimmerDensity: 'eyeshadowShimmerDensity',
  matte: 'eyeshadowMatte',
  sheen: 'eyeshadowSheen',
};
const blushFinishDetail: FinishDetailKeys = {
  glossLo: 'blushGlossLo',
  glossGain: 'blushGlossGain',
  shimmerSize: 'blushShimmerSize',
  shimmerDensity: 'blushShimmerDensity',
  matte: 'blushMatte',
  sheen: 'blushSheen',
};
const highlightFinishDetail: FinishDetailKeys = {
  glossLo: 'highlightGlossLo',
  glossGain: 'highlightGlossGain',
  shimmerSize: 'highlightShimmerSize',
  shimmerDensity: 'highlightShimmerDensity',
  matte: 'highlightMatte',
  sheen: 'highlightSheen',
};
const contourFinishDetail: FinishDetailKeys = {
  glossLo: 'contourGlossLo',
  glossGain: 'contourGlossGain',
  shimmerSize: 'contourShimmerSize',
  shimmerDensity: 'contourShimmerDensity',
  matte: 'contourMatte',
  sheen: 'contourSheen',
};

/** enum(FINISHES) → 제형 스튜디오 세부 시드값. 스튜디오 진입 시 슬라이더 출발점
 *  (= "enum은 세부값 프리셋으로 재해석"). 이 시드는 스튜디오를 열어 첫 편집할 때만
 *  커밋되고, 마감 4버튼(세부 0)은 여전히 enum 레거시 경로로 돈다.
 *
 *  ★ 첫 편집 점프 제거(적대 리뷰 confirmed): 시드를 Finish.cginc 커스텀 경로에 넣었을
 *  때 그 enum의 레거시 렌더와 (거의) 동일한 결과가 나오도록 커스텀 공식을 역산해 맞춘다.
 *  진입 전 화면은 레거시 렌더인데 첫 슬라이더 터치에 시드가 통째 커밋되므로, 시드 렌더
 *  = 레거시 렌더여야 겉모습 점프가 없다. 셰이더 무변경(하위호환 세부합≤1e-5=레거시
 *  바이트동일 유지). 커스텀 경로: lo=lerp(0.35,0.92,glossLo), spec=smoothstep(lo,1,luma),
 *  c = pigment·(1−matte·spec) + glossGain·spec + (시머 항). 레거시 spec₀=smoothstep(0.55,1,luma).
 *   - 새틴(0): 레거시=pigment(무변). 커스텀도 matte·gain 0이면 pigment로 수렴하므로 all-0
 *     시드 — 진입 무변, 첫 슬라이더가 0에서 자연 상승(점프 없음). (구 시드 gain 0.12=사기 광.)
 *   - 매트(1): 레거시 pigment·(1−0.38·spec₀). matte=0.38·glossLo=0.351(⇒lo≈0.55) → 정확 일치.
 *     (구 시드 matte 0.6 = 레거시보다 과하게 매트 → 점프.)
 *   - 글로시(2): 레거시 pigment·0.9+(0.5·spec₀+0.35·hot). glossGain 0.85·glossLo 0.45(⇒lo≈0.61)로
 *     젖은 하이라이트 가산을 근사(단색 0.9배 감광은 커스텀에 없어 미드톤 ~10% 근사 오차).
 *   - 시머(3): 레거시 pigment+sparkle(≈19% 셀, 임계 0.55, sh=0.5). shimmerSize 0.25(⇒cellScale≈250
 *     =레거시 주파수)·shimmerDensity 0.6(⇒≈19% 셀)·glossLo 0.351(⇒spec 임계 0.55)로 반짝 밀도·임계
 *     근사(입자 밝기·해시 패턴은 공식 차로 근사 — 고주파 노이즈라 시각적으로 무해).
 *  실기기 튜닝 대상. */
// ★ sheen은 모든 enum 시드에서 0 — enum 레거시 렌더에는 벨벳 시가 없으므로(과거
//   FINISH_ENUM_SEED 점프 결함 재발 방지: 시드 렌더=레거시 렌더 유지). sheen도 셰이더
//   마감 세부 합 게이트(customAmt)에 포함되지만(sheen만 켜도 커스텀 경로), sheen 항이
//   sheen에 선형이라 시드=0에서 바이트 동일.
export const FINISH_ENUM_SEED: Record<number, FinishBundle> = {
  0: { glossLo: 0, glossGain: 0, shimmerSize: 0, shimmerDensity: 0, matte: 0, sheen: 0 },        // 새틴 = 무변(레거시 유지)
  1: { glossLo: 0.351, glossGain: 0, shimmerSize: 0, shimmerDensity: 0, matte: 0.38, sheen: 0 }, // 매트 = 레거시 정확 일치
  2: { glossLo: 0.45, glossGain: 0.85, shimmerSize: 0, shimmerDensity: 0, matte: 0, sheen: 0 },  // 글로시 = 젖은 광 근사
  3: { glossLo: 0.351, glossGain: 0, shimmerSize: 0.25, shimmerDensity: 0.6, matte: 0, sheen: 0 }, // 시머 = 반짝 근사
};

/** 잎 params에서 마감 세부값을 읽는다(미지정=0). */
export function readFinishBundle(
  params: Partial<FilterParams>,
  detail: FinishDetailKeys,
): FinishBundle {
  return {
    glossLo: (params[detail.glossLo] as number) ?? 0,
    glossGain: (params[detail.glossGain] as number) ?? 0,
    shimmerSize: (params[detail.shimmerSize] as number) ?? 0,
    shimmerDensity: (params[detail.shimmerDensity] as number) ?? 0,
    matte: (params[detail.matte] as number) ?? 0,
    sheen: (params[detail.sheen] as number) ?? 0,
  };
}

/** 번들 → 부위별 브리지 필드 patch. */
export function finishBundleToPatch(
  bundle: FinishBundle,
  detail: FinishDetailKeys,
): Partial<FilterParams> {
  const patch: Partial<FilterParams> = {};
  for (const { axis } of FINISH_STUDIO_SLIDERS) {
    (patch as Record<string, number>)[detail[axis]] = bundle[axis];
  }
  return patch;
}

/** 마감 세부가 하나라도 켜졌는가 (켜졌으면 커스텀 제형 경로 — enum 무시). */
export function isCustomFinish(bundle: FinishBundle): boolean {
  return FINISH_STUDIO_SLIDERS.some(s => bundle[s.axis] > 0);
}

export const EYELINER_STYLES = [
  { value: 0, label: '윙업' },
  { value: 1, label: '퍼피' },
  { value: 2, label: '롱' },
];

// 아이라이너 부분 모양 — 리본의 눈꺼풀 구간 마스크 (Eyeliner.shader SEG_* 동기)
export const EYELINER_SEGMENTS = [
  { value: 0, label: '전체' },
  { value: 1, label: '꼬리만' },
  { value: 2, label: '앞+꼬리' },
  { value: 3, label: '눈동자 위' },
];

// 아이라이너 질감 — 제품 제형 (0=리퀴드가 기존 룩 그대로)
export const EYELINER_TEXTURES: DomainOption[] = [
  { value: 0, label: '리퀴드' },
  { value: 1, label: '젤' },
  { value: 2, label: '펜슬' },
  { value: 3, label: '붓펜' },
];

// 아이라이너 마감 — 매트/새틴/글로시 + 펄(#19b, 셀 스파클 미세 입자).
// value는 Eyeliner.shader _EyelinerFinish 분기와 1:1 (0=새틴 기본, 3=펄).
export const EYELINER_FINISHES: DomainOption[] = [
  { value: 1, label: '매트' },
  { value: 2, label: '글로시' },
  { value: 3, label: '펄' },
];

// 블러셔 모양 프리셋 (AXIS 02) — 이가리=코걸침 한 장, 드레이핑=관자 스윕
export const BLUSH_SHAPES = [
  { value: 0, label: '클래식' },
  { value: 1, label: '이가리' },
  { value: 2, label: '드레이핑' },
];

// 재질 아키타입 — 마감(벨벳시언=sheen 축)과 중복 제거: 벨벳은 마감에 두고, 재질은
// "마감으로 안 되는 것"(각도 기반 메탈·홀로그램)만. 값은 셰이더 매핑 유지(2·3).
// (현재 화면-luma 근사, 추후 MatCap 대체 — 선택 UI는 그대로 재사용.)
export const MATERIAL_OPTIONS = [
  { value: 0, label: '없음' },
  { value: 2, label: '메탈' },
  { value: 3, label: '홀로그램' },
  { value: 4, label: '멀티크롬' },
];

// 아이섀도 모양 12종 — Iris/Eyeshadow 밴드 해부학적 가로·세로 프로파일.
// 베이스·메인·포인트 프로파일은 레이어 role tag가 아닌 모양 ID다.
export const EYESHADOW_SHAPES = [
  { value: 0, label: '리드 전체' },
  { value: 1, label: '크리스 집중' },
  { value: 2, label: '스모키' },
  { value: 3, label: '꼬리 포인트' },
  { value: 4, label: '안쪽 집중' },
  { value: 5, label: '중앙 집중' },
  { value: 6, label: '바깥 집중' },
  { value: 7, label: '베이스 프로파일' },
  { value: 8, label: '메인 프로파일' },
  { value: 9, label: '포인트 프로파일' },
  { value: 10, label: '와이드' },
  { value: 11, label: '테일 익스텐드' },
];

export const EYESHADOW_SURFACES = [
  { value: 0, label: '위' },
  { value: 1, label: '아래' },
  { value: 2, label: '위+아래' },
];

export const EYELINER_THICKNESS_PROFILES = [
  { value: 0, label: '내추럴' }, { value: 1, label: '극슬림' },
  { value: 2, label: '슬림' }, { value: 3, label: '볼드' },
  { value: 4, label: '바깥 볼드' }, { value: 5, label: '중앙 볼드' },
];
export const EYELINER_TAIL_PROFILES = [
  { value: 0, label: '윙업' }, { value: 1, label: '다운턴' },
  { value: 2, label: '가로 롱' }, { value: 3, label: '롱 스트레이트' },
  { value: 4, label: '롱 업' }, { value: 5, label: '롱 다운' },
];

// 눈썹 모양 (#19b, 슬롯 공통) — BrowWarp 밴드 형태 분기(일자화 파라미터)
export const BROW_SHAPES = [
  { value: 0, label: '내추럴' },
  { value: 1, label: '일자' },
  { value: 2, label: '아치' },
  { value: 3, label: '각진' },
  { value: 4, label: '상승' },
  { value: 5, label: '반달' },
];

// 굵기와 가로 분포는 모양(룩 소유), 실제 털 경계에 맞춘 상·하 확장은 핏(개인 델타).
// 0은 구 저장물의 기존 대칭 밴드를 유지하는 하위호환 모드다.
export const BROW_THICKNESS_PROFILES = [
  { value: 0, label: '레거시' },
  { value: 1, label: '슬림' },
  { value: 2, label: '기본' },
  { value: 3, label: '도톰' },
  { value: 4, label: '두꺼움' },
  { value: 5, label: '앞머리 도톰' },
  { value: 6, label: '바디 도톰' },
];

// 속눈썹 모양 — LashRenderer 길이·스윕 프로파일 변조 (시술 용어 대응)
export const MASCARA_STYLES = [
  { value: 0, label: '내추럴' },
  { value: 1, label: '돌리' },
  { value: 2, label: '캣아이' },
  { value: 3, label: '오픈아이' },
  { value: 4, label: '위스피' },
];

// 위 속눈썹 전용 — 처짐(내리깐 속눈썹, 법선 반전)은 아래 속눈썹에선 눈 침범이라 제외.
export const MASCARA_STYLES_UPPER = [
  ...MASCARA_STYLES,
  { value: 5, label: '처짐' },
];

// 부분 커버 모양 (#19b) — 붉은기 자동은 FaceMakeup 붉은기 게이트(치아 미백 역방향)
export const CONCEALER_SHAPES = [
  { value: 0, label: '눈밑 존' },
  { value: 1, label: '붉은기 자동' },
];

// 파우더 존 (#19b) — 캐노니컬 존 마스크(T존/볼 제외)
export const POWDER_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: 'T존' },
  { value: 2, label: '볼 제외' },
];

// ── 모양 축 W1+W2 (하안검 밴드 4부위 + 쌍꺼풀) — value 0 = 현행 프로파일과 픽셀 동일 ──
// 아이섀도 하(하안검 아래 섀도) 실루엣 — LowerLid.shader esBand 가로·세로 프로파일 분기.
export const EYESHADOW_LOWER_SHAPES = [
  { value: 0, label: '기본밴드' },
  { value: 1, label: '넓게' },
  { value: 2, label: '꼬리집중' },
];
// 하안검 라이너 구간 — LowerLid.shader lnAmt along 구간 게이트. 라벨은 상라이너
// EYELINER_SEGMENTS와 일관(전체/꼬리만/앞+꼬리) — 하안검엔 '눈동자 위' 구간 없음.
export const LOWER_EYELINER_SEGMENTS = [
  { value: 0, label: '전체' },
  { value: 1, label: '꼬리만' },
  { value: 2, label: '앞+꼬리' },
];
// 애교살 실루엣 — LowerLid.shader pigHi 밴드 thick 프로파일 분기.
export const AEGYO_SHAPES = [
  { value: 0, label: '초승달' },
  { value: 1, label: '일자' },
  { value: 2, label: '중앙도톰' },
];
// 삼각존 모양 — LowerLid.shader triV 폭 분기.
export const TRIANGLE_ZONE_SHAPES = [
  { value: 0, label: '기본' },
  { value: 1, label: '좁게' },
  { value: 2, label: '넓게' },
];
// 쌍꺼풀 라인 (§3 ★A7) — DoubleLid.shader 크리스 라인 프로파일 분기.
export const DOUBLE_LID_SHAPES = [
  { value: 0, label: '인라인' },
  { value: 1, label: '아웃라인' },
  { value: 2, label: '세미' },
];

// ── 모양 축 W3 피부 존 (FaceMakeup.shader 존 게이트, powderShape 선례) — value 0 = 현행 픽셀 동일 ──
// 언더톤 적용 존 — _ToneShape로 _Brightening(톤업+캐스트)을 존만큼 곱한다.
export const TONE_ZONE_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: 'T존' },
  { value: 2, label: '얼굴 중앙' }, // 방사 중앙 집중(코 주변)
];
// 피부결 존 — _SkinShape로 _Smoothing을 존만큼 곱한다. 파우더 캐노니컬 존 어휘 재사용.
export const SKIN_ZONE_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: 'T존' },
  { value: 2, label: '볼 제외' },
];
// 파운데 존 — _FoundationShape로 커버(fCov·fChroma)를 존만큼 곱한다. T존 집중=중앙 세로 스트립,
// 외곽 페더=방사 외곽 감쇠(경계 자연 페이드).
export const FOUNDATION_ZONE_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: 'T존 집중' },
  { value: 2, label: '외곽 페더' },
];

// ── 모양 축 W4 립 (Lip.shader 존/실루엣, 링 메시 uv.y=중앙도·uv2.y=윗입술도) — value 0 = 현행 픽셀 동일 ──
// 베이스립 실루엣 — 핏 lipBaseOverline(연속 오프셋)과 별개인 이산 존. 중앙 그라데=중앙 집중,
// 외곽 정리=반경 외곽(입술선) 안쪽으로 정리.
export const LIP_BASE_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: '중앙 그라데' },
  { value: 2, label: '외곽 정리' },
];
// 메인립 실루엣 — 색축 lipGradient(반경 색스톱 혼합)와 직교한 알파 실루엣. 그라데립=중앙→코너
// 알파 페이드, 꼬리 뾰족=코너 강조.
export const LIP_SHAPES = [
  { value: 0, label: '풀립' },
  { value: 1, label: '그라데립' },
  { value: 2, label: '꼬리 뾰족' },
];
// 립라이너 구간 — 라이너 인스턴스(_LipLinerShape). 윗입술만=upperness, 입꼬리 집중=코너.
export const LIP_LINER_SHAPES = [
  { value: 0, label: '전체 링' },
  { value: 1, label: '윗입술만' },
  { value: 2, label: '입꼬리 집중' },
];
// 립글로스 존 — 립 메시(_LipGlossShape). 중앙 도트=중앙 집중(쥬시), 아랫입술만=lowerness.
export const LIP_GLOSS_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: '중앙 도트' },
  { value: 2, label: '아랫입술만' },
];

// ── 모양 축 W6 치아·헤어 — value 0 = 현행 픽셀 동일 ──
// 치아 존 — TeethWhiten 스트립 uv.y(가로 코너→코너) 중앙 가중.
export const TEETH_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: '앞니 집중' },
];
// 헤어 존 — CameraFeed hair 세그. 세그 단일채널이라 v1은 화면공간 세로 그라데 근사(옴브레·끝만).
export const HAIR_SHAPES = [
  { value: 0, label: '전체' },
  { value: 1, label: '옴브레' },
  { value: 2, label: '끝만' },
];

// 파운데이션 마감 — 셰이더 분기값과 1:1 (0=새틴 baseline, 1=매트, 2=듀이).
export const FOUNDATION_FINISHES: DomainOption[] = [
  { value: 0, label: '세미매트' },
  { value: 1, label: '매트' },
  { value: 2, label: '글로우' },
];

// 제형 텍스처(§5 테크닉) — 커버리지 곡선·엣지 하드니스를 갈아끼운다(마감=빛반응과 별개).
// 필드 부재는 레거시 동작을 보존하고, 명시 value 0은 각 도메인의 첫 제품 제형을 적용한다.
export const FOUNDATION_TEXTURES: DomainOption[] = [
  { value: 0, label: '리퀴드' },
  { value: 1, label: '쿠션' },
  { value: 2, label: '스틱' },
  { value: 3, label: '트윈케익', patch: { foundationFinish: 1 } },
  { value: 4, label: '스킨틴트' },
];
export const LIP_TEXTURES: DomainOption[] = [
  { value: 0, label: '크림 립스틱' },
  { value: 1, label: '벨벳' },
  { value: 2, label: '워터틴트' },
  { value: 3, label: '새틴 립스틱' },
  { value: 4, label: '오일' },
];

export const CONCEALER_TEXTURES: DomainOption[] = [
  { value: 0, label: '리퀴드' }, { value: 1, label: '크림' }, { value: 2, label: '스틱' },
];
export const POWDER_TEXTURES: DomainOption[] = [
  { value: 0, label: '루스' }, { value: 1, label: '프레스드' }, { value: 2, label: '수분' },
];
export const BLUSH_TEXTURES: DomainOption[] = [
  { value: 0, label: '파우더' }, { value: 1, label: '크림' },
  { value: 2, label: '리퀴드' }, { value: 3, label: '틴트' },
];
export const HIGHLIGHT_TEXTURES: DomainOption[] = [
  { value: 0, label: '파우더' }, { value: 1, label: '크림' }, { value: 2, label: '리퀴드' },
];
export const CONTOUR_TEXTURES: DomainOption[] = [
  { value: 0, label: '파우더' }, { value: 1, label: '크림' }, { value: 2, label: '스틱' },
];
export const TRIANGLE_TEXTURES: DomainOption[] = [
  { value: 0, label: '파우더' }, { value: 1, label: '크림' },
];
export const EYESHADOW_TEXTURES: DomainOption[] = [
  { value: 0, label: '파우더' },
  { value: 1, label: '크림' },
  {
    value: 2,
    label: '리퀴드 글리터',
    patch: {
      eyeshadowFinish: 3,
      eyeshadowGlossLo: 0.4,
      eyeshadowGlossGain: 0.7,
      eyeshadowShimmerSize: 0.6,
      eyeshadowShimmerDensity: 0.7,
      eyeshadowParticleSize: 0.6,
      eyeshadowParticleDensity: 0.5,
    },
  },
];
export const AEGYO_TEXTURES: DomainOption[] = [
  { value: 0, label: '펜슬' },
  { value: 1, label: '파우더' },
  { value: 2, label: '글리터 스틱', patch: { aegyoFinish: 3, aegyoShimmer: 0.7 } },
];
export const EYELINER_LOWER_TEXTURES: DomainOption[] = [
  { value: 0, label: '펜슬' },
  { value: 1, label: '스머지 파우더' },
  {
    value: 2,
    label: '글리터 리퀴드',
    patch: { eyelinerLowerFinish: 3, eyelinerLowerShimmer: 0.6 },
  },
];
export const BROW_TEXTURES: DomainOption[] = [
  { value: 0, label: '마스카라' }, { value: 1, label: '틴트' },
];
export const BROW_POWDER_TEXTURES: DomainOption[] = [
  { value: 0, label: '파우더' }, { value: 1, label: '포마드' }, { value: 2, label: '젤' },
];
export const BROW_PENCIL_TEXTURES: DomainOption[] = [
  { value: 0, label: '샤프 펜슬' }, { value: 1, label: '크레용' }, { value: 2, label: '틴트펜' },
];
export const LIP_BASE_TEXTURES: DomainOption[] = [
  { value: 0, label: '크림' }, { value: 1, label: '스틱' },
];
export const LIP_LINER_TEXTURES: DomainOption[] = [
  { value: 0, label: '펜슬' }, { value: 1, label: '크레용' },
];
export const LIP_GLOSS_TEXTURES: DomainOption[] = [
  { value: 0, label: '글로스' }, { value: 1, label: '오일' }, { value: 2, label: '플럼퍼' },
];

// ── 제형(텍스처) 공통 어휘(W1) — 부위군 템플릿 enum이 TextureBundle 시드로 번역된다 ──
// 마감(빛 반응)과 별개 축: 엣지 하드니스·입자감(그레인)·커버리지 곡선·발색 body를
// 갈아끼운다. 필드 부재만 레거시 무변조이며, 명시 enum 0은 표의 첫 제품 시드다.
// 필드 구조: 부위당 enum 1필드(`<region>Texture`)만 브리지에 보내고, enum→번들 시드는
// 셰이더가 TexBundleFromEnum(Finish.cginc)으로 미러링해 적용한다 — 기존 텍스처 축
// 선례(foundationTexture·lipTexture·eyelinerTexture·browPowderTexture: 전부 enum 1필드 +
// Unity 파생) 및 마감 enum 버튼(ApplyFinish 레거시 경로)과 정합. 세부 번들은 RN이 설계
// 정본(TEXTURE_ENUM_SEED)으로 소유하고, W2(제형 스튜디오 세부 슬라이더)는 마감 세부
// (FinishBundle)와 동일하게 부위별 오버라이드 필드를 뒤에 얹어 연다(필드 폭증 회피).
export type TextureAxis = 'edgeSoft' | 'grain' | 'coverage' | 'body';
export type TextureBundle = Record<TextureAxis, number>;

const TEX_ZERO: TextureBundle = { edgeSoft: 0, grain: 0, coverage: 0, body: 0 };

/** 부위별 텍스처 템플릿 id — 셰이더 TexBundleFromEnum templateId와 1:1. */
export type TextureTemplateId =
  | 'tone' | 'skin' | 'concealer' | 'powder' | 'blush' | 'highlighter'
  | 'contour' | 'triangleZone' | 'eyeshadow' | 'eyeshadowLower' | 'aegyo'
  | 'eyelinerLower' | 'brow' | 'browPencil' | 'browConceal' | 'browLightener'
  | 'lipBase' | 'lipLiner' | 'lipGloss' | 'teeth';
export const TEXTURE_TEMPLATE_INDEX: Record<TextureTemplateId, number> = {
  tone: 0, skin: 1, concealer: 2, powder: 3, blush: 4, highlighter: 5,
  contour: 6, triangleZone: 7, eyeshadow: 8, eyeshadowLower: 9, aegyo: 10,
  eyelinerLower: 11, brow: 12, browPencil: 13, browConceal: 14,
  browLightener: 15, lipBase: 16, lipLiner: 17, lipGloss: 18, teeth: 19,
};

// UI 세그먼트(라벨 "제형"). 필드 부재는 레거시 무변조이고, 명시 enum은 표의 물성을 적용한다.
// 언더톤 축소판 — grain 축만 의미(매끈/파우더리).
export const TONE_TEXTURES: DomainOption[] = [
  { value: 0, label: '매끈' },
  { value: 1, label: '파우더리' },
];
// 치아(퇴화) — 젤 단일. 세그먼트가 1개면 선택지가 없어 UI 노출을 생략한다(teeth 부위엔
// 제형 컨트롤을 달지 않음). 템플릿은 장래 미백/글로시 스마일 등 확장 대비 정의만 유지.
export const TEETH_TEXTURES: DomainOption[] = [{ value: 0, label: '젤' }];
export const CREAM_TEXTURES: DomainOption[] = [{ value: 0, label: '크림' }];

/** enum value → TextureBundle 시드(부위군 템플릿). 셰이더 TexBundleFromEnum의 RN 정본
 *  미러(마감의 FINISH_ENUM_SEED↔ApplyFinish 레거시 경로 선례). 필드 부재=레거시 ZERO,
 *  명시 0=각 도메인의 첫 제품(일부 템플릿만 우연히 ZERO). */
export const TEXTURE_ENUM_SEED: Record<
  TextureTemplateId,
  Record<number, TextureBundle>
> = {
  tone: {
    0: TEX_ZERO, // 매끈 = 무변조
    1: { edgeSoft: 0, grain: 0.4, coverage: 0, body: 0 }, // 파우더리(grain 축만)
  },
  skin: {
    0: TEX_ZERO,
    1: { edgeSoft: 0, grain: 0.4, coverage: 0, body: 0 },
  },
  concealer: {
    0: { edgeSoft: 0.3, grain: 0, coverage: -0.1, body: 0 },
    1: TEX_ZERO,
    2: { edgeSoft: -0.1, grain: 0.1, coverage: 0.15, body: 0.25 },
  },
  powder: {
    0: { edgeSoft: 0.25, grain: 0.45, coverage: -0.1, body: -0.1 },
    1: { edgeSoft: 0.1, grain: 0.25, coverage: 0.15, body: 0 },
    2: { edgeSoft: 0.2, grain: 0, coverage: -0.15, body: -0.15 },
  },
  blush: {
    0: { edgeSoft: 0.2, grain: 0.4, coverage: 0, body: -0.1 },
    1: { edgeSoft: 0.1, grain: 0, coverage: 0, body: 0.1 },
    2: { edgeSoft: 0.3, grain: 0, coverage: -0.1, body: 0 },
    3: { edgeSoft: 0.35, grain: 0, coverage: -0.2, body: -0.15 },
  },
  highlighter: {
    0: { edgeSoft: 0.2, grain: 0.35, coverage: 0, body: -0.1 },
    1: { edgeSoft: 0.1, grain: 0, coverage: 0.1, body: 0 },
    2: { edgeSoft: 0.25, grain: 0, coverage: -0.1, body: -0.1 },
  },
  contour: {
    0: { edgeSoft: 0.2, grain: 0.4, coverage: 0, body: -0.1 },
    1: { edgeSoft: 0.15, grain: 0, coverage: 0, body: 0.1 },
    2: { edgeSoft: -0.05, grain: 0, coverage: 0.1, body: 0.2 },
  },
  triangleZone: {
    0: { edgeSoft: 0.2, grain: 0.4, coverage: 0, body: -0.1 },
    1: { edgeSoft: 0.15, grain: 0, coverage: 0, body: 0.1 },
  },
  eyeshadow: {
    0: { edgeSoft: 0.2, grain: 0.4, coverage: 0, body: -0.1 },
    1: { edgeSoft: 0.1, grain: 0, coverage: 0.1, body: 0.15 },
    2: { edgeSoft: 0.3, grain: 0, coverage: -0.15, body: 0 },
  },
  // LowerLid.shader가 소비하는 legacy template id 9. UI region은 단일 eyeshadow이며
  // 신규 lower surface는 겹별 eyeshadowTexture를 쓰지만, 구 scalar wire의 물성은 보존한다.
  eyeshadowLower: {
    0: { edgeSoft: 0.2, grain: 0.4, coverage: 0, body: -0.1 },
    1: { edgeSoft: 0.1, grain: 0, coverage: 0.1, body: 0.15 },
    2: { edgeSoft: 0.3, grain: 0, coverage: -0.15, body: 0 },
  },
  aegyo: {
    0: { edgeSoft: -0.2, grain: 0.5, coverage: 0, body: 0.3 },
    1: { edgeSoft: 0.2, grain: 0.4, coverage: 0, body: -0.1 },
    2: { edgeSoft: 0.1, grain: 0.2, coverage: 0, body: 0 },
  },
  eyelinerLower: {
    0: { edgeSoft: -0.2, grain: 0.5, coverage: 0, body: 0.3 },
    1: { edgeSoft: 0.35, grain: 0.3, coverage: -0.1, body: 0 },
    2: { edgeSoft: 0.1, grain: 0.15, coverage: -0.1, body: 0 },
  },
  brow: {
    0: TEX_ZERO,
    1: { edgeSoft: 0.1, grain: 0, coverage: -0.15, body: -0.1 },
  },
  browPencil: {
    0: { edgeSoft: -0.2, grain: 0.5, coverage: 0, body: 0.3 },
    1: { edgeSoft: 0, grain: 0.3, coverage: 0, body: 0.1 },
    2: { edgeSoft: 0.2, grain: 0, coverage: -0.1, body: -0.1 },
  },
  browConceal: { 0: TEX_ZERO },
  browLightener: { 0: TEX_ZERO },
  lipBase: {
    0: TEX_ZERO,
    1: { edgeSoft: -0.05, grain: 0, coverage: 0.15, body: 0.2 },
  },
  lipLiner: {
    0: { edgeSoft: -0.2, grain: 0.5, coverage: 0, body: 0.3 },
    1: { edgeSoft: 0, grain: 0.2, coverage: 0, body: 0.1 },
  },
  lipGloss: {
    0: TEX_ZERO,
    1: { edgeSoft: 0.2, grain: 0, coverage: -0.15, body: -0.15 },
    2: { edgeSoft: 0.15, grain: 0, coverage: 0.1, body: 0 },
  },
  teeth: {
    0: TEX_ZERO, // 젤 = 무변조
  },
};

/** 부위 제형 enum → TextureBundle(미지정=ZERO). W2 세부 오버라이드의 시드 진입점
 *  (마감 readFinishBundle 선례). */
export function readTextureBundle(
  templateId: TextureTemplateId,
  texEnum: number | undefined,
): TextureBundle {
  if (texEnum === undefined) return TEX_ZERO;
  return TEXTURE_ENUM_SEED[templateId][texEnum] ?? TEX_ZERO;
}

// ── 렌즈 레이어드(#25) ── 3세부(베이스/내부/림)를 payload(LensLayer)로 캐리(deco 선례).
// FilterParams 무소유라 axes는 비우고, ComposerSheet의 LensControls가 payload를 직접 편집.
export type LensPartKey = 'lensBase' | 'lensDetail' | 'lensRim';
export const LENS_REGION_KEYS: LensPartKey[] = ['lensBase', 'lensDetail', 'lensRim'];

/** 렌즈 세부 부위 판별 — payload(LensLayer) 캐리 부위 (deco와 함께 FilterParams 무소유) */
export function isLensRegion(k: RegionKey): k is LensPartKey {
  return (LENS_REGION_KEYS as string[]).includes(k);
}

// 데코 세부부위(중분류) — 자유 배치 데칼의 5종. 'deco'=점(legacy 호환 기본), 나머지 4종.
// 전부 OverlayLayer payload 캐리(FilterParams 무소유). OverlayLayer.kind로 왕복 보존.
export type DecoRegionKey =
  | 'deco'
  | 'decoTattoo'
  | 'decoGem'
  | 'decoPaint'
  | 'decoEtc';
export const DECO_REGION_KEYS: DecoRegionKey[] = [
  'deco',
  'decoTattoo',
  'decoGem',
  'decoPaint',
  'decoEtc',
];

/** 데코 세부부위 판별 — 자유 배치 오버레이 캐리 부위(FilterParams 무소유) */
export function isDecoRegion(k: RegionKey): k is DecoRegionKey {
  return (DECO_REGION_KEYS as string[]).includes(k);
}

/** 오버레이 kind 문자열 → 유효한 데코 RegionKey (미상·legacy는 '점'=deco로) */
export function decoRegionFromKind(kind: string | undefined): DecoRegionKey {
  return kind && (DECO_REGION_KEYS as string[]).includes(kind)
    ? (kind as DecoRegionKey)
    : 'deco';
}

/** 렌즈 블렌드 10종 — Iris.shader LensBlend 분기·LensLayer.blendMode(0~9)와 1:1.
 *  Unity IrisRenderer가 [0,9]로 클램프. 기존 저장물(0~3)은 값 무변으로 무손상. */
export const LENS_BLEND_MODES = [
  { value: 0, label: '노말' },
  { value: 1, label: '멀티플라이' },
  { value: 2, label: '스크린' },
  { value: 3, label: '오버레이' },
  { value: 4, label: '소프트라이트' },
  { value: 5, label: '컬러닷지' },
  { value: 6, label: '컬러번' },
  { value: 7, label: '라이튼' },
  { value: 8, label: '다큰' },
  { value: 9, label: '하드라이트' },
];

/** 세부별 기본 렌즈 레이어(LensLayer 초기값). diameter/thickness = 방사 UV 구간:
 *  베이스=전체 홍채(0~1), 내부 디테일=동공 주변(0~innerDiameter), 림=외곽 링(1−두께~1). */
export const LENS_DEFAULTS: Record<LensPartKey, LensLayer> = {
  lensBase: { part: 0, color: '#5B7B8C', blendMode: 1, intensity: 0.45, inner: 0, outer: 1 },
  lensDetail: { part: 1, color: '#7A6A9E', blendMode: 3, intensity: 0.4, inner: 0, outer: 0.45 },
  lensRim: { part: 2, color: '#3A3A3A', blendMode: 1, intensity: 0.5, inner: 0.82, outer: 1 },
};

export type RegionKey =
  // 피부
  | 'tone'
  | 'skin'
  | 'foundation'
  | 'concealer'
  | 'powder'
  // 컨투어
  | 'blush'
  | 'highlighter'
  | 'contour'
  // 눈
  | 'eyeshadow'
  | 'eyelinerUpper'
  | 'eyelinerLower'
  | 'aegyo'
  | 'mascara'
  | 'lowerMascara'
  | 'triangleZone'
  // 렌즈 레이어드(#25) 3세부 — payload(LensLayer)로 캐리(deco 선례), FilterParams 무소유.
  // (legacy 단색 'iris' 리전은 폐지 — 레이어드 베이스가 대체)
  | 'lensBase'
  | 'lensDetail'
  | 'lensRim'
  | 'doubleLid'
  // 눈썹 (제품 종류 = 세부 부위)
  | 'browConceal'
  | 'brow'
  | 'browPowder'
  | 'browPencil'
  | 'browLightener'
  | 'browStyle'
  // 립
  | 'lipBase'
  | 'lip'
  | 'lipLiner'
  | 'lipGloss'
  | 'teeth'
  // 헤어
  | 'hair'
  // 데코 — 자유 배치 데칼 5종(중분류). 'deco'=점(legacy 호환), 나머지 4종.
  | 'deco'
  | 'decoTattoo'
  | 'decoGem'
  | 'decoPaint'
  | 'decoEtc';

/** 텍스처 임포트 대상 — App의 기존 pick*Style 콜백과 1:1 */
export type TextureAction = 'brow' | 'eyeliner' | 'lip' | 'blush' | 'aegyo';

/** 디자이너 마스크 임포트 대상(모양 축, §16) — 부위 "존"을 흑백/알파 스텐실로 교체.
 *  텍스처 축의 컬러 아트(TextureAction, "무엇을")와 구분: 마스크는 "어디에"(색은 앱이).
 *  대상 = FaceMakeup 캐노니컬 UV 존 마스크(블러셔·하이라이터·컨투어) + 아이섀도(밴드 로컬
 *  UV, Unity가 setRegionMask region=="eyeshadow"를 IrisRenderer로 특수분기). App의
 *  setRegionMask region 값과 1:1. */
export type MaskRegion = 'blush' | 'highlighter' | 'contour' | 'eyeshadow';

/** 질감 맵 임포트 대상(#22, 에셋 3층의 ③) — 픽셀별 "빛 반응 지도"로 부위 마감(광)을
 *  변조. 컬러 아트(TextureAction="무엇을")·존 마스크(MaskRegion="어디에")와 구분되는
 *  "어떻게 빛나는지". 대상 = 마감 세부(#21)를 여는 3부위(립·아이섀도·블러셔). App의
 *  setTextureMap region 값과 1:1. (파운데·아이라이너는 enum만이라 제외.) */
export type TextureMapRegion = 'lip' | 'eyeshadow' | 'blush';

export type AxisKey = 'shape' | 'texture' | 'color' | 'finish' | 'opacity' | 'fit';
export type AxisPresentation = 'segment' | 'toggle' | 'badge' | 'hidden';

export const AXIS_LABELS: Record<AxisKey, string> = {
  shape: '모양',
  texture: '텍스처',
  color: '색',
  finish: '마감',
  opacity: '농도',
  fit: '핏',
};

/** 축 탭 표시 순서 (목업 AXIS 01~06 + 핏은 골드 별도 탭) */
export const AXIS_ORDER: AxisKey[] = [
  'shape',
  'texture',
  'color',
  'finish',
  'opacity',
  'fit',
];

export type ComposerControl = (
  /** min..max 선형 매핑 슬라이더. 생략 시 0..1, 값 없으면 fallback(기본 0) */
  | {
      type: 'slider';
      label: string;
      key: keyof FilterParams;
      min?: number;
      max?: number;
      step?: number;
      fallback?: number;
      gold?: boolean;
    }
  | { type: 'swatches'; label?: string; key: keyof FilterParams; palette: string[] }
  | {
      type: 'caption';
      label: string;
      value: string;
      presentation?: AxisPresentation;
    }
  | {
      type: 'segments';
      label?: string;
      key: keyof FilterParams;
      options: DomainOption[];
      /** REGION_DEFS 생성 시 부위 axisPresentation에서 주입된다. */
      presentation?: AxisPresentation;
    }
  /** 마감 4버튼 + (시머 선택 시) 게인 슬라이더 + (detail 있으면) 제형 스튜디오.
   *  detail 생략 = 스튜디오 없음(파운데·아이라이너 등 enum만). detail 있으면 그 다섯
   *  세부 필드가 이 부위 소유(regionOwnKeys)라 시드 왕복에서 보존된다. */
  | {
      type: 'finish';
      finishKey: keyof FilterParams;
      shimmerKey: keyof FilterParams;
      detail?: FinishDetailKeys;
      /** 부위별 도메인 subset. 생략 시 공통 FINISHES. */
      options?: DomainOption[];
      /** REGION_DEFS 생성 시 부위 axisPresentation에서 주입된다. */
      presentation?: AxisPresentation;
    }
  /** 임포트 텍스처: 강도 슬라이더 + 갤러리 버튼 */
  | {
      type: 'import';
      label: string;
      action: TextureAction;
      intensityKey: keyof FilterParams;
    }
  /** 디자이너 마스크 임포트(모양 축, §16) — 부위 "존"을 흑백/알파 스텐실로 교체.
   *  텍스처 축 컬러 아트("무엇을")와 구분되는 "어디에"(스텐실, 색은 앱이 칠함). 강도
   *  슬라이더 없음(부위 자체 농도 축이 세기 담당). appliedKey = 세션 적용 마커(0/1) —
   *  픽셀은 setRegionMask 브리지로 스왑, 파일은 저장 스냅샷 미포함(regions 주석·types.ts). */
  | {
      type: 'maskImport';
      label: string;
      region: MaskRegion;
      appliedKey: keyof FilterParams;
    }
  /** 질감 맵 임포트(#22, 에셋 3층의 ③) — 픽셀별 광 지도(R 광게인·G 시머밀도)로 부위
   *  마감을 변조. 컬러 아트("무엇을")·마스크("어디에")와 구분되는 "어떻게 빛나는지"(광 지도).
   *  강도 슬라이더 없음 — 마감 세부(#21)가 세기 담당, 맵은 그 위 공간 변조. appliedKey =
   *  세션 적용 마커(0/1). 픽셀은 setTextureMap 브리지로 스왑, 파일은 저장 스냅샷 미포함. */
  | {
      type: 'textureMap';
      label: string;
      region: TextureMapRegion;
      appliedKey: keyof FilterParams;
    }
) & {
  /** 같은 축 탭 안에서 연속된 동일 group 컨트롤을 소제목으로 묶어 렌더(ComposerSheet). 미지정 = 그룹 없음(현행). */
  group?: string;
};

export interface RegionDef {
  key: RegionKey;
  label: string;
  emoji: string;
  /** 기본 제형명 — 잎(제품 적용) 표시용. region/sub 라벨 반복("피부보정→…")을
   *  피하려고 newRegionNode가 잎 라벨에 쓴다. 생략 시 label 사용. */
  productName?: string;
  /** 이 부위 강도 필드들 — 하나라도 >0이면 현재 룩에 이 레이어가 있다고 본다(시드) */
  onKeys: (keyof FilterParams)[];
  /** ＋레이어 추가 시 시작값 (색은 BARE 기본값을 그대로 물려받는다) */
  defaults: Partial<FilterParams>;
  axes: Partial<Record<AxisKey, ComposerControl[]>>;
  /** 공통 핏 4어휘의 실제 저장 백엔드. 위치는 x/y 두 컨트롤이며 미지정 슬롯은 숨긴다. */
  fitTraits?: FitTraits;
  /** 제형·마감 축의 정본 표시 상태. REGION_DEFS/REGION_MAP에서는 항상 명시된다. */
  axisPresentation?: Record<'texture' | 'finish', AxisPresentation>;
  /** 공유 필드 등 사용자 안내 한 줄 */
  note?: string;
}

export type FitTraitBackend =
  | keyof FilterParams
  | 'affine.dx'
  | 'affine.dy'
  | 'affine.sx'
  | 'affine.sy'
  | 'affine.rot';

export interface FitTraits {
  positionX?: FitTraitBackend;
  positionY?: FitTraitBackend;
  size?: FitTraitBackend;
  angle?: FitTraitBackend;
  width?: FitTraitBackend;
}

export interface RegionGroup {
  title: string;
  /** 이 그룹의 부위들이 속하는 슬롯 (SLOT_OF_REGION 유도의 단일 출처) */
  slot: SlotKey;
  regions: RegionDef[];
}

// ── 눈썹 슬롯 공통 축 (카탈로그: 모양·핏은 어느 눈썹 세부에서 조정해도 전체 반영) ──
// 값은 공유 브리지 필드라 어느 눈썹 잎에서
// 편집해도 컴파일 병합에서 같은 필드를 쓴다(제품 동조 — MakeupController 참조).
const BROW_SHAPE_AXIS: ComposerControl[] = [
  { type: 'segments', key: 'browShape', options: BROW_SHAPES },
  {
    type: 'segments',
    label: '굵기 스타일',
    key: 'browThicknessProfile',
    options: BROW_THICKNESS_PROFILES,
  },
  {
    type: 'slider',
    label: '전체 굵기',
    key: 'browThickness',
    min: 0.75,
    max: 1.6,
    fallback: 1,
  },
];
const BROW_FIT_AXIS: ComposerControl[] = [
  { type: 'slider', label: '내 눈썹 아래 덮기', key: 'browExpandLower', min: -0.25, max: 0.75, step: 0.05, fallback: 0, gold: true },
  { type: 'slider', label: '내 눈썹 위 덮기', key: 'browExpandUpper', min: -0.25, max: 0.75, step: 0.05, fallback: 0, gold: true },
  { type: 'slider', label: '눈썹 아치', key: 'browArch', min: 0, max: 0.7, gold: true },
];
const BROW_NOTE = '모양·굵기는 룩, 위·아래 덮기는 내 핏 — 눈썹 전체에 함께 반영돼요';

export const REGION_GROUPS: RegionGroup[] = [
  {
    title: '피부·베이스',
    slot: '피부',
    // 카탈로그 스택 순서(아래→위): 톤 → 질감 → 파운데이션 → 부분 커버 → 파우더.
    regions: [
      {
        key: 'tone',
        label: '언더톤',
        emoji: '🌤️',
        // 정본 §3: 언더톤 = 색 캐스트 보정(메이크업 베이스/컬러 코렉터).
        // '톤업크림'은 브라이트닝 제품이라 정체성이 어긋나 정정(분류체계 정합).
        productName: '메이크업 베이스',
        onKeys: ['skinBrightening'],
        defaults: { skinBrightening: 0.4 },
        axes: {
          // 존(W3) — 전체 / T존 / 얼굴 중앙 (FaceMakeup _ToneShape가 톤 적용 존 곱)
          shape: [
            { type: 'segments', key: 'toneShape', options: TONE_ZONE_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'toneTexture', options: TONE_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'toneBaseColor', palette: TONE_BASE_COLORS },
          ],
          opacity: [{ type: 'slider', label: '보정 강도', key: 'skinBrightening' }],
        },
      },
      {
        key: 'skin',
        label: '피부결',
        emoji: '✨',
        productName: '모공 프라이머',
        onKeys: ['skinSmoothing', 'skinSmoothingExtended'],
        defaults: { skinSmoothing: 0.5 },
        axes: {
          // 존(W3) — 전체 / T존 / 볼 제외 (FaceMakeup _SkinShape가 결 보정 존 곱)
          shape: [
            { type: 'segments', key: 'skinShape', options: SKIN_ZONE_SHAPES },
          ],
          // 피부결은 스무딩 프리미티브(마스크·색소 없음)라 셰이더가 grain 축만 소비한다.
          // GENERIC(크림/파우더/리퀴드/젤/펜슬)를 두면 리퀴드·젤(엣지·커버 시드)이 렌더에
          // 반영 안 돼 '가짜 컨트롤'이 되므로, grain만 갖는 TONE(매끈/파우더리)로 정정
          // (FaceMakeup.shader가 skinTexture를 TONE 템플릿으로 미러링).
          texture: [
            { type: 'segments', key: 'skinTexture', options: TONE_TEXTURES },
          ],
          opacity: [
            { type: 'slider', label: '결 보정', key: 'skinSmoothing' },
            { type: 'slider', label: '이마·목 확장 (세그)', key: 'skinSmoothingExtended' },
          ],
          finish: [{ type: 'slider', label: '윤광', key: 'skinGlow' }],
        },
      },
      {
        key: 'foundation',
        label: '피부톤',
        emoji: '🫙',
        productName: '쿠션 파운데이션',
        onKeys: ['foundationIntensity'],
        // 제형=쿠션(1) — 제품 정체성('쿠션 파운데이션')과 세그 일치(신규 잎 기본).
        defaults: { foundationIntensity: 0.4, matteGrain: 0, foundationTexture: 1 },
        note: '세그 face-skin 채널로 이마·목까지 — 세그 폴백 시 얼굴 메시만',
        axes: {
          // 존(W3) — 전체 / T존 집중 / 외곽 페더 (FaceMakeup _FoundationShape, 얼굴 메시 커버 존 곱)
          shape: [
            { type: 'segments', key: 'foundationShape', options: FOUNDATION_ZONE_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'foundationTexture', options: FOUNDATION_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'foundationColor', palette: FOUNDATION_COLORS },
          ],
          finish: [
            { type: 'segments', key: 'foundationFinish', options: FOUNDATION_FINISHES },
            // 매트 그레인(전역 파우더 입자감) — 전 부위 마감 공유.
            { type: 'slider', label: '매트 그레인', key: 'matteGrain' },
          ],
          opacity: [
            { type: 'slider', label: '커버리지', key: 'foundationIntensity' },
          ],
        },
      },
      {
        key: 'concealer',
        label: '부분 커버',
        emoji: '🩹',
        productName: '컨실러',
        onKeys: ['concealerIntensity'],
        defaults: { concealerIntensity: 0.5 },
        note: '붉은기 자동 = 피드에서 붉은 픽셀만 골라 커버(홍조·트러블·콧볼)',
        axes: {
          // 모양(#19b) — 눈밑 존 / 붉은기 자동 (FaceMakeup 붉은기 게이트)
          shape: [
            { type: 'segments', key: 'concealerShape', options: CONCEALER_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'concealerTexture', options: CONCEALER_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'concealerColor', palette: CONCEALER_COLORS },
          ],
          finish: [
            { type: 'segments', key: 'concealerFinish', options: CONCEALER_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '컨실러', key: 'concealerIntensity' },
            // 잡티 지우기(밀어내기) — 색을 얹지 않고 국소 이상치만 이웃 색으로 되민다
            // (FaceMakeup 피부 경로, 스무딩 선례). 임계·반경은 셰이더 v1 상수, 슬라이더는 강도만.
            { type: 'slider', label: '잡티 지우기', key: 'blemishRemoval' },
          ],
        },
      },
      {
        key: 'powder',
        label: '피니시',
        emoji: '🧂',
        productName: '세팅 파우더',
        onKeys: ['powderIntensity'],
        // 명시 enum 0=루스(첫 제품). 필드 부재만 레거시 제형을 뜻한다.
        defaults: { powderIntensity: 0.5, powderTexture: 0, powderFinish: 1 },
        axes: {
          // 존(#19b) — 전체 / T존 / 볼 제외 (캐노니컬 존 마스크)
          shape: [
            { type: 'segments', key: 'powderShape', options: POWDER_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'powderTexture', options: POWDER_TEXTURES },
          ],
          // 컬러 파우더 — 무색(트랜스루선트)=기존, 핑크 톤업·라벤더·그린 등 옅은 캐스트.
          color: [
            { type: 'swatches', key: 'powderColor', palette: POWDER_COLORS },
          ],
          // 펄 파우더 — 마감 enum + 시머 게인. 0=새틴=기존 출력.
          finish: [
            {
              type: 'finish',
              finishKey: 'powderFinish',
              shimmerKey: 'powderShimmer',
              options: POWDER_FINISHES,
            },
          ],
          opacity: [
            { type: 'slider', label: '매트화 (유분광 억제)', key: 'powderIntensity' },
          ],
        },
      },
    ],
  },
  {
    title: '윤곽',
    slot: '컨투어', // 내부 키는 '컨투어' 유지(저장 데이터 호환) — 표시는 SLOT_LABEL이 '윤곽'으로.
    // 입체·혈색 배치: 블러셔·하이라이터·섀딩 (구 '볼' 슬롯 흡수 + 피부에서 이동).
    regions: [
      {
        key: 'blush',
        label: '블러셔',
        emoji: '🌸',
        productName: '크림 블러셔',
        onKeys: ['blushIntensity', 'blushStyleIntensity'],
        // 입자 레이어(8축)를 부위 소유로 선언 — regionOwnKeys가 defaults 키를 소유로 유도하므로
        // 프리셋이 blushParticle*를 실으면 seedLayers→compileLayers 왕복에 보존된다(BARE 우회 불필요).
        // density 0 = 기본 off. (UI 슬라이더 노출은 후속.)
        defaults: {
          blushIntensity: 0.5,
          blushMaterial: 0,
          blushMaterialStrength: 0.85,
          blushParticleSize: 0.4,
          blushParticleDensity: 0,
          blushParticleBrightness: 0.7,
          blushParticleColor: '#FFF2D9',
          blushParticleTwinkle: 1,
          blushParticleShape: 0,
          blushParticleFeather: 0,
          blushParticleParallax: 0.4,
          blushParticleConfetti: 0,
        },
        axes: {
          shape: [
            { type: 'segments', key: 'blushShape', options: BLUSH_SHAPES },
            {
              type: 'maskImport',
              label: '볼 존 마스크',
              region: 'blush',
              appliedKey: 'blushMaskImported',
            },
          ],
          texture: [
            { type: 'segments', key: 'blushTexture', options: BLUSH_TEXTURES },
            {
              type: 'import',
              label: '볼 그림',
              action: 'blush',
              intensityKey: 'blushStyleIntensity',
            },
            {
              type: 'slider',
              label: '스파클 명멸',
              key: 'blushStyleSparkle',
              min: 0,
              max: 1,
              fallback: 0,
            },
          ],
          color: [{ type: 'swatches', key: 'blushColor', palette: BLUSH_COLORS }],
          finish: [
            {
              type: 'finish',
              finishKey: 'blushFinish',
              shimmerKey: 'blushShimmer',
              detail: blushFinishDetail,
              options: BLUSH_FINISHES,
              group: '기본',
            },
            {
              type: 'textureMap',
              label: '질감 맵 (광 지도)',
              region: 'blush',
              appliedKey: 'blushFinishMapImported',
              group: '제형 스튜디오',
            },
            // 재질 아키타입 — 없음/벨벳/메탈/홀로 + 강도(0=없음일 때 무영향).
            { type: 'segments', key: 'blushMaterial', options: MATERIAL_OPTIONS, group: '재질' },
            { type: 'slider', label: '재질 강도', key: 'blushMaterialStrength', group: '재질' },
            // 입자 레이어(글리터) 8축 — 밀도 0 = 끔. feather=부드러움(펄쪽)↔또렷(글리터).
            { type: 'swatches', label: '글리터 색', key: 'blushParticleColor', palette: HIGHLIGHT_COLORS, group: '글리터' },
            { type: 'slider', label: '글리터 밀도', key: 'blushParticleDensity', group: '글리터' },
            { type: 'slider', label: '글리터 크기', key: 'blushParticleSize', group: '글리터' },
            { type: 'slider', label: '글리터 밝기', key: 'blushParticleBrightness', group: '글리터' },
            { type: 'slider', label: '글리터 부드러움', key: 'blushParticleFeather', group: '글리터' },
            { type: 'slider', label: '글리터 명멸', key: 'blushParticleTwinkle', group: '글리터' },
            { type: 'slider', label: '글리터 모양(별)', key: 'blushParticleShape', group: '글리터' },
            { type: 'slider', label: '글리터 시차', key: 'blushParticleParallax', group: '글리터' },
            { type: 'slider', label: '글리터 컨페티(다색)', key: 'blushParticleConfetti', group: '글리터' },
          ],
          opacity: [{ type: 'slider', label: '블러셔', key: 'blushIntensity' }],
          fit: [
            {
              type: 'slider',
              label: '블러셔 높이',
              key: 'blushLift',
              min: -0.08,
              max: 0.08,
              gold: true,
            },
            {
              type: 'slider',
              label: '블러셔 퍼짐',
              key: 'blushSpread',
              min: -0.08,
              max: 0.08,
              gold: true,
            },
            // 가장자리 부드러움(A14 재베이크) — 테크닉의 가장자리 프로파일. +=흐림.
            {
              type: 'slider',
              label: '가장자리 흐림',
              key: 'blushEdgeSoftness',
              min: 0,
              max: 1,
            },
          ],
        },
      },
      {
        key: 'highlighter',
        label: '하이라이터',
        emoji: '💫',
        productName: '스틱 하이라이터',
        onKeys: ['highlightIntensity'],
        defaults: { highlightIntensity: 0.5 },
        axes: {
          shape: [
            {
              type: 'maskImport',
              label: '광채 존 마스크',
              region: 'highlighter',
              appliedKey: 'highlightMaskImported',
            },
          ],
          texture: [
            { type: 'segments', key: 'highlightTexture', options: HIGHLIGHT_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'highlightColor', palette: HIGHLIGHT_COLORS },
          ],
          // 마감 — 블러셔와 동일 enum(새틴/매트/글로시/시머 + 시머 게인) + 제형
          // 스튜디오 세부(#21: 광·펄 입자 크기/밀도·매트·시). 0=새틴=기존 출력.
          finish: [
            {
              type: 'finish',
              finishKey: 'highlightFinish',
              shimmerKey: 'highlightShimmer',
              detail: highlightFinishDetail,
              options: HIGHLIGHT_FINISHES,
            },
          ],
          opacity: [
            { type: 'slider', label: '하이라이터', key: 'highlightIntensity' },
          ],
          fit: [
            // 마스크 부위 핏 아핀(A17 확장) — 블러셔 lift/spread 일반화.
            {
              type: 'slider',
              label: '광채 높이',
              key: 'highlightLift',
              min: -0.08,
              max: 0.08,
              gold: true,
            },
            {
              type: 'slider',
              label: '광채 퍼짐',
              key: 'highlightSpread',
              min: -0.08,
              max: 0.08,
              gold: true,
            },
            {
              type: 'slider',
              label: '가장자리 흐림',
              key: 'highlightEdgeSoftness',
              min: 0,
              max: 1,
            },
          ],
        },
      },
      {
        key: 'contour',
        label: '섀딩',
        emoji: '🖌️',
        productName: '섀딩 파우더',
        onKeys: ['contourIntensity'],
        // 명시 enum 0=파우더(첫 제품). 필드 부재만 레거시 제형을 뜻한다.
        defaults: { contourIntensity: 0.4, contourTexture: 0, contourFinish: 1 },
        axes: {
          shape: [
            {
              type: 'maskImport',
              label: '섀딩 존 마스크',
              region: 'contour',
              appliedKey: 'contourMaskImported',
            },
          ],
          texture: [
            { type: 'segments', key: 'contourTexture', options: CONTOUR_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'contourColor', palette: CONTOUR_COLORS },
          ],
          // 마감 — 하이라이터와 동일(enum + 제형 스튜디오 세부). 0=새틴=기존 출력.
          finish: [
            {
              type: 'finish',
              finishKey: 'contourFinish',
              shimmerKey: 'contourShimmer',
              detail: contourFinishDetail,
              options: CONTOUR_FINISHES,
            },
          ],
          opacity: [
            { type: 'slider', label: '섀딩', key: 'contourIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '섀딩 높이',
              key: 'contourLift',
              min: -0.08,
              max: 0.08,
              gold: true,
            },
            {
              type: 'slider',
              label: '섀딩 퍼짐',
              key: 'contourSpread',
              min: -0.08,
              max: 0.08,
              gold: true,
            },
            {
              type: 'slider',
              label: '가장자리 흐림',
              key: 'contourEdgeSoftness',
              min: 0,
              max: 1,
            },
          ],
        },
      },
    ],
  },
  {
    title: '눈',
    slot: '눈',
    regions: [
      {
        key: 'eyeshadow',
        label: '아이섀도',
        emoji: '👁️',
        productName: '파우더 섀도',
        onKeys: ['eyeshadowIntensity'],
        defaults: {
          eyeshadowIntensity: 0.5,
          eyeshadowSurface: 2,
          // 명시 enum 0=파우더(첫 제품). 필드 부재만 레거시 제형을 뜻한다.
          eyeshadowTexture: 0,
          eyeshadowMaterial: 0,
          eyeshadowMaterialStrength: 0.85,
          eyeshadowParticleSize: 0.4,
          eyeshadowParticleDensity: 0,
          eyeshadowParticleBrightness: 0.7,
          eyeshadowParticleColor: '#FFF2D9',
          eyeshadowParticleTwinkle: 1,
          eyeshadowParticleShape: 0,
          eyeshadowParticleFeather: 0,
          eyeshadowParticleParallax: 0,
          eyeshadowParticleConfetti: 0,
        },
        axes: {
          // 모양 12종 — 기존 4종 + 해부학 위치 3종 + 프로파일 3종 + 와이드·테일.
          shape: [
            { type: 'segments', label: '적용 위치', key: 'eyeshadowSurface', options: EYESHADOW_SURFACES },
            { type: 'segments', label: '모양', key: 'eyeshadowShape', options: EYESHADOW_SHAPES },
            {
              type: 'maskImport',
              label: '섀도 존 마스크',
              region: 'eyeshadow',
              appliedKey: 'eyeshadowMaskImported',
            },
          ],
          texture: [
            { type: 'segments', key: 'eyeshadowTexture', options: EYESHADOW_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'eyeshadowColor', palette: EYESHADOW_COLORS },
            {
              type: 'swatches',
              label: '그라데 리드 색',
              key: 'eyeshadowColor2',
              palette: EYESHADOW_COLORS,
            },
            { type: 'slider', label: '그라데이션', key: 'eyeshadowGradient' },
          ],
          finish: [
            {
              type: 'finish',
              finishKey: 'eyeshadowFinish',
              shimmerKey: 'eyeshadowShimmer',
              detail: eyeshadowFinishDetail,
              options: EYESHADOW_FINISHES,
              group: '기본',
            },
            {
              type: 'textureMap',
              label: '질감 맵 (광 지도)',
              region: 'eyeshadow',
              appliedKey: 'eyeshadowFinishMapImported',
              group: '제형 스튜디오',
            },
            // 재질 + 입자(글리터) — 블러셔와 동일.
            { type: 'segments', key: 'eyeshadowMaterial', options: MATERIAL_OPTIONS, group: '재질' },
            { type: 'slider', label: '재질 강도', key: 'eyeshadowMaterialStrength', group: '재질' },
            { type: 'swatches', label: '글리터 색', key: 'eyeshadowParticleColor', palette: HIGHLIGHT_COLORS, group: '글리터' },
            { type: 'slider', label: '글리터 밀도', key: 'eyeshadowParticleDensity', group: '글리터' },
            { type: 'slider', label: '글리터 크기', key: 'eyeshadowParticleSize', group: '글리터' },
            { type: 'slider', label: '글리터 밝기', key: 'eyeshadowParticleBrightness', group: '글리터' },
            { type: 'slider', label: '글리터 부드러움', key: 'eyeshadowParticleFeather', group: '글리터' },
            { type: 'slider', label: '글리터 명멸', key: 'eyeshadowParticleTwinkle', group: '글리터' },
            { type: 'slider', label: '글리터 모양(별)', key: 'eyeshadowParticleShape', group: '글리터' },
            { type: 'slider', label: '글리터 시차', key: 'eyeshadowParticleParallax', group: '글리터' },
            { type: 'slider', label: '글리터 컨페티(다색)', key: 'eyeshadowParticleConfetti', group: '글리터' },
          ],
          opacity: [
            { type: 'slider', label: '아이섀도', key: 'eyeshadowIntensity', max: 1.5, step: 0.05 },
          ],
          fit: [
            {
              type: 'slider',
              label: '섀도 높이',
              key: 'eyeshadowHeight',
              min: 0.4,
              max: 1.6,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'eyelinerUpper',
        label: '아이라인 상',
        emoji: '〰️',
        productName: '리퀴드 라이너',
        onKeys: ['eyelinerIntensity', 'eyelinerStyleIntensity'],
        defaults: { eyelinerIntensity: 0.6, eyelinerFinish: 1, eyelinerHasGeometryProfiles: 0 },
        axes: {
          shape: [
            { type: 'segments', key: 'eyelinerStyle', options: EYELINER_STYLES },
            { type: 'segments', key: 'eyelinerSegment', options: EYELINER_SEGMENTS },
            { type: 'segments', label: '두께 프로파일', key: 'eyelinerThicknessProfile', options: EYELINER_THICKNESS_PROFILES },
            { type: 'segments', label: '꼬리 프로파일', key: 'eyelinerTailProfile', options: EYELINER_TAIL_PROFILES },
          ],
          texture: [
            { type: 'segments', key: 'eyelinerTexture', options: EYELINER_TEXTURES },
            {
              type: 'import',
              label: '아이라인 그림',
              action: 'eyeliner',
              intensityKey: 'eyelinerStyleIntensity',
            },
          ],
          color: [
            { type: 'swatches', key: 'eyelinerColor', palette: EYELINER_COLORS },
          ],
          finish: [
            // 매트/새틴/글로시 + 펄(#19b) — Eyeliner.shader 4분기
            { type: 'segments', key: 'eyelinerFinish', options: EYELINER_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '아이라이너', key: 'eyelinerIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '라이너 두께',
              key: 'eyelinerThickness',
              min: 0.4,
              max: 2,
              fallback: 1,
              gold: true,
            },
            {
              type: 'slider',
              label: '윙 길이',
              key: 'eyelinerWingLength',
              min: 0.2,
              max: 2,
              fallback: 1,
              gold: true,
            },
            {
              type: 'slider',
              label: '눈꼬리 (워프)',
              key: 'eyeCornerLift',
              gold: true,
            },
            // (임시 디버그) 앞머리 끝 리프트 실시간 튜닝 — 값 확정되면 Unity 상수
            // InnerCornerLiftImg에 굳히고 이 슬라이더·브리지 필드는 제거.
            {
              type: 'slider',
              label: '앞머리 리프트 (디버그)',
              key: 'eyelinerInnerLift',
              min: 0,
              max: 0.12,
              fallback: 0.055,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'eyelinerLower',
        label: '아이라인 하',
        emoji: '﹏',
        productName: '펜슬 라이너',
        onKeys: ['eyelinerLowerIntensity'],
        defaults: { eyelinerLowerIntensity: 0.4, eyelinerLowerFinish: 1, eyelinerLowerColor: '#3A241E' },
        axes: {
          // 구간(W1) — 전체 / 꼬리만 / 앞+꼬리(중앙 비움). lnAmt along 게이트(상라이너 관례).
          shape: [
            { type: 'segments', key: 'eyelinerLowerSegment', options: LOWER_EYELINER_SEGMENTS },
          ],
          // 필드 부재는 레거시 무변조. 사용자가 고른 뒤에만 0/1/2를 명시한다.
          texture: [
            { type: 'segments', key: 'eyelinerLowerTexture', options: EYELINER_LOWER_TEXTURES },
          ],
          // 공유색 재노출(눈썹 BROW_SHAPE_AXIS 선례) — 하 부위에서도 색을 만질 수 있게.
          color: [
            { type: 'swatches', key: 'eyelinerLowerColor', palette: EYELINER_COLORS },
          ],
          finish: [
            {
              type: 'finish',
              finishKey: 'eyelinerLowerFinish',
              shimmerKey: 'eyelinerLowerShimmer',
              options: EYELINER_LOWER_FINISHES,
            },
          ],
          opacity: [
            { type: 'slider', label: '라인 (아래)', key: 'eyelinerLowerIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '라이너 두께',
              key: 'eyelinerLowerThickness',
              min: 0.3,
              max: 2.5,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'aegyo',
        label: '애교살',
        emoji: '🥺',
        productName: '펄 스틱',
        onKeys: ['aegyoIntensity', 'aegyoStyleIntensity'],
        defaults: { aegyoIntensity: 0.5, aegyoFinish: 1 },
        axes: {
          // 모양(W1) — 초승달(현행) / 일자 / 중앙도톰 (pigHi thick 프로파일 분기)
          shape: [
            { type: 'segments', key: 'aegyoShape', options: AEGYO_SHAPES },
          ],
          // 색(07-11 aegyoColor 신설 — 부위 축 감사의 (b) 해소): 하이라이트 펄 톤,
          // 섀도는 Unity가 파생. 빈 값=기본 톤이라 스와치 선택 전 룩은 불변.
          color: [
            { type: 'swatches', key: 'aegyoColor', palette: AEGYO_COLORS },
          ],
          // 마감 — 하이라이트 밴드에 적용(시머=펄 애교살). 0=새틴=기존 출력.
          finish: [
            {
              type: 'finish',
              finishKey: 'aegyoFinish',
              shimmerKey: 'aegyoShimmer',
              options: AEGYO_FINISHES,
            },
          ],
          texture: [
            { type: 'segments', key: 'aegyoTexture', options: AEGYO_TEXTURES },
            {
              type: 'import',
              label: '애교살 그림',
              action: 'aegyo',
              intensityKey: 'aegyoStyleIntensity',
            },
          ],
          opacity: [{ type: 'slider', label: '애교살', key: 'aegyoIntensity' }],
          fit: [
            {
              type: 'slider',
              label: '애교살 두께',
              key: 'aegyoHeight',
              min: 0.3,
              max: 1.4,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'triangleZone',
        label: '삼각존',
        emoji: '🔺',
        productName: '파우더 섀도',
        onKeys: ['triangleZoneIntensity'],
        // 명시 enum 0=파우더(첫 제품). 필드 부재만 레거시 제형을 뜻한다.
        defaults: { triangleZoneIntensity: 0.4, triangleZoneTexture: 0, triangleZoneFinish: 1 },
        note: '눈꼬리 바로 아래 좁은 삼각 음영 — 눈매 깊게, 눈꼬리 리프트 자동 추종',
        axes: {
          // 모양(W1) — 기본 / 좁게 / 넓게 (triV 세로 폭 분기)
          shape: [
            { type: 'segments', key: 'triangleZoneShape', options: TRIANGLE_ZONE_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'triangleZoneTexture', options: TRIANGLE_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'triangleZoneColor', palette: TRIANGLE_COLORS },
          ],
          finish: [
            {
              type: 'finish',
              finishKey: 'triangleZoneFinish',
              shimmerKey: 'triangleZoneShimmer',
              options: TRIANGLE_FINISHES,
            },
          ],
          opacity: [
            { type: 'slider', label: '음영 강도', key: 'triangleZoneIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '삼각존 높이',
              key: 'triangleZoneHeight',
              min: 0.3,
              max: 2,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'mascara',
        label: '속눈썹 상',
        emoji: '🪮',
        productName: '마스카라',
        onKeys: ['mascaraIntensity'],
        // mascaraTexStyle: 0=절차 스트로크(기본) 1=텍스처 내추럴 2=텍스처 볼륨.
        // defaults에 넣어 부위 소유 등록(텍스처 룩이 이 필드를 담을 수 있게).
        defaults: { mascaraIntensity: 0.5, mascaraTexStyle: 0 },
        axes: {
          shape: [
            { type: 'segments', key: 'mascaraStyle', options: MASCARA_STYLES_UPPER },
          ],
          color: [
            { type: 'swatches', key: 'mascaraColor', palette: EYELINER_COLORS },
          ],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'mascaraFinish', options: MASCARA_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '마스카라', key: 'mascaraIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '속눈썹 길이',
              key: 'mascaraLength',
              min: 0.5,
              max: 1.8,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'lowerMascara',
        label: '속눈썹 하',
        emoji: '🪶',
        productName: '마스카라',
        onKeys: ['lowerLashIntensity'],
        defaults: { lowerLashIntensity: 0.35 },
        note: '색은 속눈썹 상과 공용 (mascaraColor) — 여기서 바꾸면 함께 반영',
        axes: {
          shape: [
            // 위와 같은 5종 프로파일, 값은 독립(lowerLashStyle).
            { type: 'segments', key: 'lowerLashStyle', options: MASCARA_STYLES },
          ],
          // 공유색 재노출(눈썹 선례) — 하 부위에서도 색을 만질 수 있게.
          color: [
            { type: 'swatches', key: 'mascaraColor', palette: EYELINER_COLORS },
          ],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'lowerMascaraFinish', options: MASCARA_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '아래 속눈썹', key: 'lowerLashIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '아래 속눈썹 길이',
              key: 'lowerLashLength',
              min: 0.5,
              max: 1.8,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'doubleLid',
        label: '쌍꺼풀',
        emoji: '➰',
        productName: '크리스 라인',
        onKeys: ['doubleLidIntensity'],
        defaults: { doubleLidIntensity: 0.35, doubleLidFinish: 1 },
        note: '접힘선 중심 위 또렷·아래 소프트 음영 (색은 자연 음영 고정)',
        axes: {
          // 모양(W2, §3 ★A7) — 인라인(현행) / 아웃라인 / 세미 (크리스 라인 프로파일 분기)
          shape: [
            { type: 'segments', key: 'doubleLidShape', options: DOUBLE_LID_SHAPES },
          ],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'doubleLidFinish', options: MATTE_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '라인 진하기', key: 'doubleLidIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '크리스 높이',
              key: 'doubleLidHeight',
              min: 0.3,
              max: 2,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
    ],
  },
  {
    // 렌즈 슬롯 승격(분류체계 정의 §3 A2) — 색소가 아닌 홍채 교체라 눈에서 분리.
    // 렌더 순서는 SLOT_ORDER상 눈보다 먼저(라인·속눈썹이 렌즈 위에 오도록).
    title: '렌즈',
    slot: '렌즈',
    regions: [
      // 렌즈 레이어드(#25) 3세부 — payload(LensLayer)를 LensControls가 편집(deco 선례).
      // onKeys/defaults/axes 비움 = FilterParams 무소유, ComposerSheet 특수 처리.
      // 모양=방사 존(직경/두께): 베이스·내부=직경(outer), 림=두께(1−inner).
      // (legacy 단색 iris 리전은 폐지 — 레이어드 베이스가 대체. irisColor/irisIntensity
      //  필드는 하위호환 위해 FilterParams에 남지만 카탈로그엔 없음.)
      {
        key: 'lensBase',
        label: '베이스',
        emoji: '🫧',
        productName: '베이스 컬러',
        onKeys: [],
        defaults: {},
        note: '전체 홍채(동공~외곽) — 색·블렌드·농도·직경·디자인. ＋겹으로 여러 장',
        axes: {},
      },
      {
        key: 'lensDetail',
        label: '내부',
        emoji: '🌀',
        productName: '내부 디테일',
        onKeys: [],
        defaults: {},
        note: '동공 주변(0~내부직경) — 헤이즐 그라데·무늬 등. ＋겹 가능',
        axes: {},
      },
      {
        key: 'lensRim',
        label: '림',
        emoji: '⭕',
        productName: '테두리 림',
        onKeys: [],
        defaults: {},
        note: '외곽 링(두께만큼) — 서클렌즈 테. ＋겹 가능',
        axes: {},
      },
    ],
  },
  {
    title: '눈썹',
    slot: '눈썹',
    // 제품 종류 = 세부 부위. 카탈로그 스택 순서: 지우개 → 결 → 채움 → 한올 →
    // 라이트너 → 스타일. 모양(browShape)·핏(두께/아치)은 슬롯 공통 축.
    regions: [
      {
        key: 'browConceal',
        label: '지우개',
        emoji: '🧽',
        productName: '스킨톤 컨실',
        onKeys: ['browConcealIntensity'],
        defaults: { browConcealIntensity: 0.6, browThicknessProfile: 2 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          texture: [
            { type: 'segments', key: 'browConcealTexture', options: CREAM_TEXTURES },
          ],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'browConcealFinish', options: SATIN_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '지우기 (컨실)', key: 'browConcealIntensity' },
          ],
          fit: BROW_FIT_AXIS,
        },
      },
      {
        key: 'brow',
        label: '결',
        emoji: '✏️',
        productName: '브로우 마스카라',
        onKeys: ['browIntensity'],
        defaults: { browIntensity: 0.5, browFinish: 1, browThicknessProfile: 2 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          texture: [
            { type: 'segments', key: 'browTexture', options: BROW_TEXTURES },
          ],
          color: [{ type: 'swatches', key: 'browColor', palette: BROW_COLORS }],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'browFinish', options: BROW_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '결 (틴트)', key: 'browIntensity' },
          ],
          fit: BROW_FIT_AXIS,
        },
      },
      {
        key: 'browPowder',
        label: '채움',
        emoji: '🟤',
        productName: '브로우 파우더',
        onKeys: ['browPowderIntensity'],
        defaults: { browPowderIntensity: 0.4, browPowderFinish: 1, browThicknessProfile: 2 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          // 제형 — 채움 물성(파우더=소프트/포마드=꽉·또렷/젤=중간·매끈). BrowPowder.shader 분기.
          texture: [
            {
              type: 'segments',
              key: 'browPowderTexture',
              options: BROW_POWDER_TEXTURES,
            },
          ],
          color: [{ type: 'swatches', key: 'browPowderColor', palette: BROW_COLORS }],
          // 마감 — 브로우 파우더 전용 시머 필드를 시드한다. 0=새틴=기존 출력.
          finish: [
            {
              type: 'finish',
              finishKey: 'browPowderFinish',
              shimmerKey: 'browPowderShimmer',
              options: BROW_POWDER_FINISHES,
            },
          ],
          opacity: [
            { type: 'slider', label: '채움 강도', key: 'browPowderIntensity' },
          ],
          fit: BROW_FIT_AXIS,
        },
      },
      {
        key: 'browPencil',
        label: '한올',
        emoji: '🖊️',
        productName: '브로우 펜슬',
        onKeys: ['browPencilIntensity'],
        // 명시 enum 0=샤프 펜슬(첫 제품). 필드 부재만 레거시 제형을 뜻한다.
        defaults: { browPencilIntensity: 0.5, browPencilTexture: 0, browPencilFinish: 1, browThicknessProfile: 2 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          texture: [
            { type: 'segments', key: 'browPencilTexture', options: BROW_PENCIL_TEXTURES },
          ],
          color: [{ type: 'swatches', key: 'browPencilColor', palette: BROW_COLORS }],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'browPencilFinish', options: MATTE_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '한올한올', key: 'browPencilIntensity' },
          ],
          fit: BROW_FIT_AXIS,
        },
      },
      {
        key: 'browLightener',
        label: '라이트너',
        emoji: '💡',
        productName: '브로우 라이트너',
        onKeys: ['browLightenerIntensity'],
        defaults: { browLightenerIntensity: 0.5, browThicknessProfile: 2 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          texture: [
            { type: 'segments', key: 'browLightenerTexture', options: CREAM_TEXTURES },
          ],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'browLightenerFinish', options: SATIN_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '옅게 (라이트너)', key: 'browLightenerIntensity' },
          ],
          fit: BROW_FIT_AXIS,
        },
      },
      {
        key: 'browStyle',
        label: '스타일',
        emoji: '🎨',
        productName: '브로우 스타일',
        onKeys: ['browStyleIntensity'],
        defaults: { browStyleIntensity: 0.5, browThicknessProfile: 2 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          texture: [
            {
              type: 'import',
              label: '눈썹 스타일',
              action: 'brow',
              intensityKey: 'browStyleIntensity',
            },
            { type: 'swatches', label: '스타일 색', key: 'browStyleColor', palette: BROW_COLORS },
          ],
          opacity: [
            { type: 'slider', label: '스타일 강도', key: 'browStyleIntensity' },
          ],
          fit: BROW_FIT_AXIS,
        },
      },
    ],
  },
  {
    title: '립',
    slot: '립',
    // 스택 순서: 베이스립 → 메인립 → 립라이너 → 립글로스. 치아 미백은 립 슬롯.
    regions: [
      {
        key: 'lipBase',
        label: '베이스립',
        emoji: '💗',
        productName: '립 컨실러',
        onKeys: ['lipBaseIntensity'],
        defaults: { lipBaseIntensity: 0.5 },
        note: '본래 입술색을 누드로 정리 — 발색 준비 (색과 독립으로 켜짐)',
        axes: {
          // 실루엣(W4) — 전체 / 중앙 그라데 / 외곽 정리. 핏 오버립(연속 오프셋)과 별개 이산.
          shape: [
            { type: 'segments', key: 'lipBaseShape', options: LIP_BASE_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'lipBaseTexture', options: LIP_BASE_TEXTURES },
          ],
          color: [{ type: 'swatches', key: 'lipBaseColor', palette: LIP_BASE_COLORS }],
          finish: [
            { type: 'segments', key: 'lipBaseFinish', options: LIP_BASE_FINISHES },
          ],
          opacity: [{ type: 'slider', label: '커버', key: 'lipBaseIntensity' }],
          fit: [
            {
              type: 'slider',
              label: '오버립 (워프)',
              key: 'lipBaseOverline',
              min: -0.15,
              max: 0.15,
              fallback: 0,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'lip',
        label: '메인립',
        emoji: '💋',
        productName: '립스틱',
        onKeys: ['lipIntensity', 'lipStyleIntensity'],
        defaults: {
          lipIntensity: 0.6,
          lipMaterial: 0,
          lipMaterialStrength: 0.85,
          lipParticleSize: 0.4,
          lipParticleDensity: 0,
          lipParticleBrightness: 0.7,
          lipParticleColor: '#FFF2D9',
          lipParticleTwinkle: 1,
          lipParticleShape: 0,
          lipParticleFeather: 0,
          lipParticleParallax: 0,
          lipParticleConfetti: 0,
        },
        axes: {
          // 실루엣(W4) — 풀립 / 그라데립(중앙 집중) / 꼬리 뾰족(입꼬리 강조). 색축
          // 그라데이션(lipGradient, 반경 색스톱 혼합)과 직교한 알파 실루엣.
          shape: [
            { type: 'segments', key: 'lipShape', options: LIP_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'lipTexture', options: LIP_TEXTURES },
            {
              type: 'import',
              label: '립 그림',
              action: 'lip',
              intensityKey: 'lipStyleIntensity',
            },
            {
              type: 'slider',
              label: '스파클 명멸',
              key: 'lipStyleSparkle',
              min: 0,
              max: 1,
              fallback: 0,
            },
          ],
          color: [
            { type: 'swatches', key: 'lipColor', palette: LIP_COLORS },
            { type: 'swatches', label: '그라데 안쪽 색', key: 'lipColor2', palette: LIP_COLORS },
            { type: 'slider', label: '그라데이션', key: 'lipGradient' },
          ],
          finish: [
            {
              type: 'finish',
              finishKey: 'lipFinish',
              shimmerKey: 'lipShimmer',
              detail: lipFinishDetail,
              options: LIP_FINISHES,
              group: '기본',
            },
            {
              type: 'textureMap',
              label: '질감 맵 (광 지도)',
              region: 'lip',
              appliedKey: 'lipFinishMapImported',
              group: '제형 스튜디오',
            },
            // 재질 + 입자(글리터) — 블러셔와 동일.
            { type: 'segments', key: 'lipMaterial', options: MATERIAL_OPTIONS, group: '재질' },
            { type: 'slider', label: '재질 강도', key: 'lipMaterialStrength', group: '재질' },
            { type: 'swatches', label: '글리터 색', key: 'lipParticleColor', palette: HIGHLIGHT_COLORS, group: '글리터' },
            { type: 'slider', label: '글리터 밀도', key: 'lipParticleDensity', group: '글리터' },
            { type: 'slider', label: '글리터 크기', key: 'lipParticleSize', group: '글리터' },
            { type: 'slider', label: '글리터 밝기', key: 'lipParticleBrightness', group: '글리터' },
            { type: 'slider', label: '글리터 부드러움', key: 'lipParticleFeather', group: '글리터' },
            { type: 'slider', label: '글리터 명멸', key: 'lipParticleTwinkle', group: '글리터' },
            { type: 'slider', label: '글리터 모양(별)', key: 'lipParticleShape', group: '글리터' },
            { type: 'slider', label: '글리터 시차', key: 'lipParticleParallax', group: '글리터' },
            { type: 'slider', label: '글리터 컨페티(다색)', key: 'lipParticleConfetti', group: '글리터' },
          ],
          opacity: [
            { type: 'slider', label: '립', key: 'lipIntensity' },
          ],
          fit: [
            { type: 'slider', label: '오버립 (워프)', key: 'lipOverline', gold: true },
          ],
        },
      },
      {
        key: 'lipLiner',
        label: '립라이너',
        emoji: '🖍️',
        productName: '립 펜슬',
        onKeys: ['lipLinerIntensity'],
        defaults: {
          lipLinerIntensity: 0.4,
          // 현행 렌더와 Unity 기본값이 매트(1)라, 0이면 기존 룩의 연필 질감이 바뀐다.
          lipLinerFinish: 1,
          // 명시 enum 0=펜슬(첫 제품). 필드 부재만 레거시 제형을 뜻한다.
          lipLinerTexture: 0,
        },
        note: '외곽 링(매트) — 립보다 한 톤 딥하게 윤곽',
        axes: {
          // 구간(W4) — 전체 링 / 윗입술만 / 입꼬리 집중 (라이너 인스턴스 _LipLinerShape)
          shape: [
            { type: 'segments', key: 'lipLinerShape', options: LIP_LINER_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'lipLinerTexture', options: LIP_LINER_TEXTURES },
          ],
          color: [
            { type: 'swatches', key: 'lipLinerColor', palette: LIP_COLORS },
          ],
          finish: [
            { type: 'segments', key: 'lipLinerFinish', options: LIP_LINER_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '라이너 진하기', key: 'lipLinerIntensity' },
          ],
          fit: [
            {
              type: 'slider',
              label: '라이너 폭',
              key: 'lipLinerWidth',
              min: 0.4,
              max: 2,
              fallback: 1,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'lipGloss',
        label: '립글로스',
        emoji: '✨',
        productName: '클리어 글로스',
        onKeys: ['lipGlossIntensity'],
        defaults: { lipGlossIntensity: 0.5, lipGlossFinish: 2 },
        note: '독립 광 톱코트 — 매트 위에도 얹힘 (색은 기본 투명)',
        axes: {
          // 존(W4) — 전체 / 중앙 도트(쥬시) / 아랫입술만 (립 메시 _LipGlossShape)
          shape: [
            { type: 'segments', key: 'lipGlossShape', options: LIP_GLOSS_SHAPES },
          ],
          texture: [
            { type: 'segments', key: 'lipGlossTexture', options: LIP_GLOSS_TEXTURES },
          ],
          color: [{ type: 'swatches', key: 'lipGlossColor', palette: LIP_GLOSS_COLORS }],
          finish: [
            { type: 'segments', key: 'lipGlossFinish', options: LIP_GLOSS_FINISHES },
          ],
          opacity: [{ type: 'slider', label: '광량', key: 'lipGlossIntensity' }],
          fit: [
            {
              type: 'slider',
              label: '오버립 (워프)',
              key: 'lipGlossOverline',
              min: -0.15,
              max: 0.15,
              fallback: 0,
              gold: true,
            },
          ],
        },
      },
      {
        key: 'teeth',
        label: '치아',
        emoji: '🦷',
        productName: '미백 젤',
        onKeys: ['teethWhitenIntensity'],
        defaults: { teethWhitenIntensity: 0.5 },
        note: '입을 벌려야 보여요 — 밝은 치아 픽셀만 미백',
        axes: {
          // 존(W6) — 전체 / 앞니 집중 (TeethWhiten 스트립 가로 중앙 가중)
          shape: [
            { type: 'segments', key: 'teethShape', options: TEETH_SHAPES },
          ],
          texture: [
            { type: 'caption', label: '제형', value: TEETH_TEXTURES[0].label },
          ],
          // 마감 — FOUNDATION_FINISHES(새틴/매트/듀이=글로시 스마일). 0=새틴=기존 출력(하위호환).
          finish: [
            { type: 'segments', key: 'teethFinish', options: FOUNDATION_FINISHES },
          ],
          opacity: [
            { type: 'slider', label: '미백', key: 'teethWhitenIntensity' },
          ],
        },
      },
    ],
  },
  {
    title: '헤어',
    slot: '헤어',
    regions: [
      {
        key: 'hair',
        label: '헤어 컬러',
        emoji: '💇',
        productName: '컬러 틴트',
        onKeys: ['hairTintIntensity'],
        defaults: { hairTintIntensity: 0.5 },
        note: '세그멘테이션 모델 필요 — 없으면 표시되지 않아요',
        axes: {
          // 존(W6) — 전체 / 옴브레 / 끝만 (헤어 세그 단일채널이라 v1은 화면공간 세로 근사)
          shape: [
            { type: 'segments', key: 'hairShape', options: HAIR_SHAPES },
          ],
          color: [{ type: 'swatches', key: 'hairTintColor', palette: HAIR_COLORS }],
          finish: [
            { type: 'segments', key: 'hairFinish', options: FOUNDATION_FINISHES },
          ],
          opacity: [{ type: 'slider', label: '염색 농도', key: 'hairTintIntensity' }],
        },
      },
    ],
  },
  {
    title: '자유 배치 (R1)',
    slot: '데코',
    // 데코 세부부위(중분류) 5종 — 전부 FilterParams가 아니라 OverlayLayer 한 장(자유 배치
    // 데칼). ComposerSheet가 isDecoRegion으로 특수 처리(오버레이 편집기). onKeys/axes 비움.
    // 렌더는 공통 오버레이 엔진, 세부부위 구분은 데칼 종류(overlay.kind).
    regions: [
      {
        key: 'deco', // 점 — 색소 틴트 점(legacy 호환 기본 kind)
        label: '점',
        emoji: '⚫',
        onKeys: [],
        defaults: {},
        axes: {},
      },
      {
        key: 'decoTattoo',
        label: '타투',
        emoji: '🖋️',
        onKeys: [],
        defaults: {},
        axes: {},
      },
      {
        key: 'decoGem',
        label: '젬',
        emoji: '💎',
        onKeys: [],
        defaults: {},
        axes: {},
      },
      {
        key: 'decoPaint',
        label: '페인팅',
        emoji: '🎨',
        onKeys: [],
        defaults: {},
        axes: {},
      },
      {
        key: 'decoEtc',
        label: '기타',
        emoji: '🎀',
        onKeys: [],
        defaults: {},
        axes: {},
      },
    ],
  },
];

/** 제형·마감 축 표시 상태의 단일 출처. 컨트롤이 없는 축도 hidden으로 명시한다. */
export const REGION_AXIS_PRESENTATION: Record<
  RegionKey,
  Record<'texture' | 'finish', AxisPresentation>
> = {
  tone: { texture: 'toggle', finish: 'hidden' },
  skin: { texture: 'toggle', finish: 'segment' },
  foundation: { texture: 'segment', finish: 'segment' },
  concealer: { texture: 'segment', finish: 'segment' },
  powder: { texture: 'segment', finish: 'segment' },
  blush: { texture: 'segment', finish: 'segment' },
  highlighter: { texture: 'segment', finish: 'segment' },
  contour: { texture: 'segment', finish: 'badge' },
  eyeshadow: { texture: 'segment', finish: 'segment' },
  eyelinerUpper: { texture: 'segment', finish: 'segment' },
  eyelinerLower: { texture: 'segment', finish: 'segment' },
  aegyo: { texture: 'segment', finish: 'segment' },
  triangleZone: { texture: 'segment', finish: 'toggle' },
  mascara: { texture: 'hidden', finish: 'segment' },
  lowerMascara: { texture: 'hidden', finish: 'segment' },
  doubleLid: { texture: 'hidden', finish: 'badge' },
  lensBase: { texture: 'hidden', finish: 'hidden' },
  lensDetail: { texture: 'hidden', finish: 'hidden' },
  lensRim: { texture: 'hidden', finish: 'hidden' },
  browConceal: { texture: 'badge', finish: 'badge' },
  brow: { texture: 'segment', finish: 'segment' },
  browPowder: { texture: 'segment', finish: 'segment' },
  browPencil: { texture: 'segment', finish: 'badge' },
  browLightener: { texture: 'badge', finish: 'badge' },
  browStyle: { texture: 'segment', finish: 'hidden' },
  lipBase: { texture: 'segment', finish: 'segment' },
  lip: { texture: 'segment', finish: 'segment' },
  lipLiner: { texture: 'segment', finish: 'badge' },
  lipGloss: { texture: 'segment', finish: 'segment' },
  teeth: { texture: 'badge', finish: 'segment' },
  hair: { texture: 'hidden', finish: 'segment' },
  deco: { texture: 'hidden', finish: 'hidden' },
  decoTattoo: { texture: 'hidden', finish: 'hidden' },
  decoGem: { texture: 'hidden', finish: 'hidden' },
  decoPaint: { texture: 'hidden', finish: 'hidden' },
  decoEtc: { texture: 'hidden', finish: 'hidden' },
};

/** 공통 핏 표면의 단일 매핑. 렌더 소비자가 없는 슬롯은 선언하지 않아 UI에서 숨긴다. */
export const REGION_FIT_TRAITS: Partial<Record<RegionKey, FitTraits>> = {
  blush: {
    positionX: 'affine.dx', positionY: 'blushLift', size: 'affine.sx',
    angle: 'affine.rot', width: 'blushSpread',
  },
  highlighter: {
    positionX: 'affine.dx', positionY: 'highlightLift', size: 'affine.sx',
    angle: 'affine.rot', width: 'highlightSpread',
  },
  contour: {
    positionX: 'affine.dx', positionY: 'contourLift', size: 'affine.sx',
    angle: 'affine.rot', width: 'contourSpread',
  },
  eyeshadow: {size: 'eyeshadowHeight'},
  eyelinerUpper: {
    size: 'eyelinerWingLength', angle: 'eyeCornerLift', width: 'eyelinerThickness',
  },
  eyelinerLower: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sy',
    angle: 'affine.rot', width: 'eyelinerLowerThickness',
  },
  aegyo: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sx',
    angle: 'affine.rot', width: 'aegyoHeight',
  },
  triangleZone: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sx',
    angle: 'affine.rot', width: 'triangleZoneHeight',
  },
  mascara: {size: 'mascaraLength'},
  doubleLid: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'doubleLidHeight',
    angle: 'affine.rot', width: 'affine.sx',
  },
  browConceal: {size: 'browExpandLower', angle: 'browArch', width: 'browExpandUpper'},
  brow: {size: 'browExpandLower', angle: 'browArch', width: 'browExpandUpper'},
  browPowder: {size: 'browExpandLower', angle: 'browArch', width: 'browExpandUpper'},
  browPencil: {size: 'browExpandLower', angle: 'browArch', width: 'browExpandUpper'},
  browLightener: {size: 'browExpandLower', angle: 'browArch', width: 'browExpandUpper'},
  browStyle: {size: 'browExpandLower', angle: 'browArch', width: 'browExpandUpper'},
  lipBase: {size: 'lipBaseOverline'},
  lip: {size: 'lipOverline'},
  lipLiner: {width: 'lipLinerWidth'},
  lipGloss: {size: 'lipGlossOverline'},
  deco: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sx', angle: 'affine.rot',
  },
  decoTattoo: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sx', angle: 'affine.rot',
  },
  decoGem: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sx', angle: 'affine.rot',
  },
  decoPaint: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sx', angle: 'affine.rot',
  },
  decoEtc: {
    positionX: 'affine.dx', positionY: 'affine.dy', size: 'affine.sx', angle: 'affine.rot',
  },
};

for (const def of REGION_GROUPS.flatMap(g => g.regions)) {
  const presentation = REGION_AXIS_PRESENTATION[def.key];
  def.axisPresentation = presentation;
  def.fitTraits = REGION_FIT_TRAITS[def.key];
  for (const axis of ['texture', 'finish'] as const) {
    for (const control of def.axes[axis] ?? []) {
      if (
        control.type === 'segments'
        || control.type === 'finish'
        || control.type === 'caption'
      ) {
        control.presentation = presentation[axis];
      }
    }
  }
}

export type ResolvedRegionDef = RegionDef & {
  axisPresentation: Record<'texture' | 'finish', AxisPresentation>;
};

export const REGION_DEFS: ResolvedRegionDef[] = REGION_GROUPS.flatMap(
  g => g.regions as ResolvedRegionDef[],
);

export const REGION_MAP: Record<RegionKey, ResolvedRegionDef> = Object.fromEntries(
  REGION_DEFS.map(d => [d.key, d]),
) as Record<RegionKey, ResolvedRegionDef>;

/** 부위가 소유한 FilterParams 필드 전부 — 축 컨트롤 선언에서 유도한다(드리프트 방지) */
export function regionOwnKeys(def: RegionDef): (keyof FilterParams)[] {
  const keys = new Set<keyof FilterParams>(
    Object.keys(def.defaults) as (keyof FilterParams)[],
  );
  for (const controls of Object.values(def.axes)) {
    for (const c of controls) {
      if (c.type === 'finish') {
        keys.add(c.finishKey);
        keys.add(c.shimmerKey);
        // 제형 스튜디오 세부 5종도 이 부위 소유 — 시드 왕복(seedLayers) 보존.
        if (c.detail) {
          for (const { axis } of FINISH_STUDIO_SLIDERS) keys.add(c.detail[axis]);
        }
      } else if (c.type === 'import') {
        keys.add(c.intensityKey);
      } else if (c.type === 'maskImport') {
        keys.add(c.appliedKey);
      } else if (c.type === 'textureMap') {
        keys.add(c.appliedKey);
      } else if (c.type === 'caption') {
        // 정적 도메인 정보는 브리지 값을 소유하지 않는다.
      } else {
        keys.add(c.key);
      }
    }
  }
  return [...keys];
}
