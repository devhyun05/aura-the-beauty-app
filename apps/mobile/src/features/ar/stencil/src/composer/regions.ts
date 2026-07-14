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

/** 워프/핏·배치 조작 색 (설계 색 규약: 제품=로즈, 워프·배치=골드) */
export const GOLD = '#C9A15E';

// 마감(finish) — 부위 공통. value는 셰이더 분기값과 1:1(0=새틴이 기본=현재 룩).
// 버튼은 광택 사다리 순서(매트→새틴→글로시→시머)로 보이고 value는 순서와 무관하다.
export const FINISHES = [
  { value: 1, label: '매트' },
  { value: 0, label: '새틴' },
  { value: 2, label: '글로시' },
  { value: 3, label: '시머' },
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
export const EYELINER_TEXTURES = [
  { value: 0, label: '리퀴드' },
  { value: 1, label: '젤' },
  { value: 2, label: '펜슬' },
];

// 아이라이너 마감 — 매트/새틴/글로시 + 펄(#19b, 셀 스파클 미세 입자).
// value는 Eyeliner.shader _EyelinerFinish 분기와 1:1 (0=새틴 기본, 3=펄).
export const EYELINER_FINISHES = [
  { value: 1, label: '매트' },
  { value: 0, label: '새틴' },
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

// 아이섀도 모양 (#19b) — Iris/Eyeshadow 밴드 세로·가로 프로파일 분기
export const EYESHADOW_SHAPES = [
  { value: 0, label: '리드 전체' },
  { value: 1, label: '크리스 집중' },
  { value: 2, label: '스모키' },
  { value: 3, label: '꼬리 포인트' },
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

// 파운데이션 마감 — 셰이더 분기값과 1:1 (0=새틴 기본, 1=매트, 2=듀이). 시머 없음.
export const FOUNDATION_FINISHES = [
  { value: 0, label: '새틴' },
  { value: 1, label: '매트' },
  { value: 2, label: '듀이' },
];

// 제형 텍스처(§5 테크닉) — 커버리지 곡선·엣지 하드니스를 갈아끼운다(마감=빛반응과 별개).
// value 0=기본(하위호환 바이트 동일). 부위 축 감사 (b) 해소 v1: 파운데·립만.
export const FOUNDATION_TEXTURES = [
  { value: 0, label: '리퀴드' },
  { value: 1, label: '쿠션' },
  { value: 2, label: '스킨틴트' },
];
export const LIP_TEXTURES = [
  { value: 0, label: '립스틱' },
  { value: 1, label: '벨벳틴트' },
  { value: 2, label: '워터틴트' },
];

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
  | 'eyeshadowLower'
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

export type ComposerControl =
  /** min..max 선형 매핑 슬라이더. 생략 시 0..1, 값 없으면 fallback(기본 0) */
  | {
      type: 'slider';
      label: string;
      key: keyof FilterParams;
      min?: number;
      max?: number;
      fallback?: number;
      gold?: boolean;
    }
  | { type: 'swatches'; label?: string; key: keyof FilterParams; palette: string[] }
  | {
      type: 'segments';
      key: keyof FilterParams;
      options: { value: number; label: string }[];
    }
  /** 마감 4버튼 + (시머 선택 시) 게인 슬라이더 + (detail 있으면) 제형 스튜디오.
   *  detail 생략 = 스튜디오 없음(파운데·아이라이너 등 enum만). detail 있으면 그 다섯
   *  세부 필드가 이 부위 소유(regionOwnKeys)라 시드 왕복에서 보존된다. */
  | {
      type: 'finish';
      finishKey: keyof FilterParams;
      shimmerKey: keyof FilterParams;
      detail?: FinishDetailKeys;
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
  /** 공유 필드 등 사용자 안내 한 줄 */
  note?: string;
}

export interface RegionGroup {
  title: string;
  /** 이 그룹의 부위들이 속하는 슬롯 (SLOT_OF_REGION 유도의 단일 출처) */
  slot: SlotKey;
  regions: RegionDef[];
}

// ── 눈썹 슬롯 공통 축 (카탈로그: 모양·핏은 어느 눈썹 세부에서 조정해도 전체 반영) ──
// 값은 공유 브리지 필드(browShape·browThickness·browArch)라 어느 눈썹 잎에서
// 편집해도 컴파일 병합에서 같은 필드를 쓴다(제품 동조 — MakeupController 참조).
const BROW_SHAPE_AXIS: ComposerControl[] = [
  { type: 'segments', key: 'browShape', options: BROW_SHAPES },
];
const BROW_FIT_AXIS: ComposerControl[] = [
  { type: 'slider', label: '눈썹 두께', key: 'browThickness', min: 0.5, max: 1.8, fallback: 1, gold: true },
  { type: 'slider', label: '눈썹 아치', key: 'browArch', min: 0, max: 0.7, gold: true },
];
const BROW_NOTE = '모양·핏은 눈썹 전체 공통 — 어느 눈썹 부위에서 조정해도 함께 반영돼요';

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
        productName: '톤업크림',
        onKeys: ['skinBrightening'],
        defaults: { skinBrightening: 0.4 },
        axes: {
          color: [
            { type: 'swatches', key: 'toneBaseColor', palette: TONE_BASE_COLORS },
          ],
          opacity: [{ type: 'slider', label: '톤업', key: 'skinBrightening' }],
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
        defaults: { foundationIntensity: 0.4, matteGrain: 0 },
        note: '세그 face-skin 채널로 이마·목까지 — 세그 폴백 시 얼굴 메시만',
        axes: {
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
          color: [
            { type: 'swatches', key: 'concealerColor', palette: CONCEALER_COLORS },
          ],
          opacity: [
            { type: 'slider', label: '컨실러', key: 'concealerIntensity' },
          ],
        },
      },
      {
        key: 'powder',
        label: '피니시',
        emoji: '🧂',
        productName: '세팅 파우더',
        onKeys: ['powderIntensity'],
        defaults: { powderIntensity: 0.5 },
        axes: {
          // 존(#19b) — 전체 / T존 / 볼 제외 (캐노니컬 존 마스크)
          shape: [
            { type: 'segments', key: 'powderShape', options: POWDER_SHAPES },
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
            {
              type: 'import',
              label: '볼 그림',
              action: 'blush',
              intensityKey: 'blushStyleIntensity',
            },
          ],
          color: [{ type: 'swatches', key: 'blushColor', palette: BLUSH_COLORS }],
          finish: [
            {
              type: 'finish',
              finishKey: 'blushFinish',
              shimmerKey: 'blushShimmer',
              detail: blushFinishDetail,
            },
            {
              type: 'textureMap',
              label: '질감 맵 (광 지도)',
              region: 'blush',
              appliedKey: 'blushFinishMapImported',
            },
            // 재질 아키타입 — 없음/벨벳/메탈/홀로 + 강도(0=없음일 때 무영향).
            { type: 'segments', key: 'blushMaterial', options: MATERIAL_OPTIONS },
            { type: 'slider', label: '재질 강도', key: 'blushMaterialStrength' },
            // 입자 레이어(글리터) 8축 — 밀도 0 = 끔. feather=부드러움(펄쪽)↔또렷(글리터).
            { type: 'swatches', label: '글리터 색', key: 'blushParticleColor', palette: HIGHLIGHT_COLORS },
            { type: 'slider', label: '글리터 밀도', key: 'blushParticleDensity' },
            { type: 'slider', label: '글리터 크기', key: 'blushParticleSize' },
            { type: 'slider', label: '글리터 밝기', key: 'blushParticleBrightness' },
            { type: 'slider', label: '글리터 부드러움', key: 'blushParticleFeather' },
            { type: 'slider', label: '글리터 명멸', key: 'blushParticleTwinkle' },
            { type: 'slider', label: '글리터 모양(별)', key: 'blushParticleShape' },
            { type: 'slider', label: '글리터 시차', key: 'blushParticleParallax' },
            { type: 'slider', label: '글리터 컨페티(다색)', key: 'blushParticleConfetti' },
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
        defaults: { contourIntensity: 0.4 },
        axes: {
          shape: [
            {
              type: 'maskImport',
              label: '섀딩 존 마스크',
              region: 'contour',
              appliedKey: 'contourMaskImported',
            },
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
        // '아이섀도 하'와 짝 — 상안검 밴드임을 이름에 명시(구 '아이섀도').
        label: '아이섀도 상',
        emoji: '👁️',
        productName: '파우더 섀도',
        onKeys: ['eyeshadowIntensity'],
        defaults: {
          eyeshadowIntensity: 0.5,
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
          // 모양(#19b) — 리드 전체 / 크리스 집중 / 스모키 / 꼬리 포인트
          shape: [
            { type: 'segments', key: 'eyeshadowShape', options: EYESHADOW_SHAPES },
            {
              type: 'maskImport',
              label: '섀도 존 마스크',
              region: 'eyeshadow',
              appliedKey: 'eyeshadowMaskImported',
            },
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
            },
            {
              type: 'textureMap',
              label: '질감 맵 (광 지도)',
              region: 'eyeshadow',
              appliedKey: 'eyeshadowFinishMapImported',
            },
            // 재질 + 입자(글리터) — 블러셔와 동일.
            { type: 'segments', key: 'eyeshadowMaterial', options: MATERIAL_OPTIONS },
            { type: 'slider', label: '재질 강도', key: 'eyeshadowMaterialStrength' },
            { type: 'swatches', label: '글리터 색', key: 'eyeshadowParticleColor', palette: HIGHLIGHT_COLORS },
            { type: 'slider', label: '글리터 밀도', key: 'eyeshadowParticleDensity' },
            { type: 'slider', label: '글리터 크기', key: 'eyeshadowParticleSize' },
            { type: 'slider', label: '글리터 밝기', key: 'eyeshadowParticleBrightness' },
            { type: 'slider', label: '글리터 부드러움', key: 'eyeshadowParticleFeather' },
            { type: 'slider', label: '글리터 명멸', key: 'eyeshadowParticleTwinkle' },
            { type: 'slider', label: '글리터 모양(별)', key: 'eyeshadowParticleShape' },
            { type: 'slider', label: '글리터 시차', key: 'eyeshadowParticleParallax' },
            { type: 'slider', label: '글리터 컨페티(다색)', key: 'eyeshadowParticleConfetti' },
          ],
          opacity: [
            { type: 'slider', label: '아이섀도', key: 'eyeshadowIntensity' },
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
        // 아이섀도 하(A3, §3 ★신설 — 07-11 사용자 재확인) — 하안검 아래 섀도 밴드.
        // 언더 스모키/그늘 연출. 상 밴드와 별개 세부부위(상/하 쌍=세부부위 분리 선례).
        key: 'eyeshadowLower',
        label: '아이섀도 하',
        emoji: '🌘',
        productName: '파우더 섀도',
        onKeys: ['eyeshadowLowerIntensity'],
        defaults: { eyeshadowLowerIntensity: 0.3 },
        note: '하안검 아래 섀도(곱 블렌드) — 언더 스모키·그늘. 애교살 아래 깔림',
        axes: {
          color: [
            {
              type: 'swatches',
              key: 'eyeshadowLowerColor',
              palette: EYESHADOW_COLORS,
            },
          ],
          // 마감 — 블러셔와 동일 enum(LowerLid.shader ApplyFinish). 0=새틴=기존 출력.
          finish: [
            {
              type: 'finish',
              finishKey: 'eyeshadowLowerFinish',
              shimmerKey: 'eyeshadowLowerShimmer',
            },
          ],
          opacity: [
            { type: 'slider', label: '아이섀도 하', key: 'eyeshadowLowerIntensity' },
          ],
        },
      },
      {
        key: 'eyelinerUpper',
        label: '아이라인 상',
        emoji: '〰️',
        productName: '리퀴드 라이너',
        onKeys: ['eyelinerIntensity', 'eyelinerStyleIntensity'],
        defaults: { eyelinerIntensity: 0.6 },
        axes: {
          shape: [
            { type: 'segments', key: 'eyelinerStyle', options: EYELINER_STYLES },
            { type: 'segments', key: 'eyelinerSegment', options: EYELINER_SEGMENTS },
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
        defaults: { eyelinerLowerIntensity: 0.4 },
        note: '색은 아이라인 상과 공용 — 여기서 바꾸면 함께 반영',
        axes: {
          // 공유색 재노출(눈썹 BROW_SHAPE_AXIS 선례) — 하 부위에서도 색을 만질 수 있게.
          color: [
            { type: 'swatches', key: 'eyelinerColor', palette: EYELINER_COLORS },
          ],
          opacity: [
            { type: 'slider', label: '라인 (아래)', key: 'eyelinerLowerIntensity' },
          ],
        },
      },
      {
        key: 'aegyo',
        label: '애교살',
        emoji: '🥺',
        productName: '펄 스틱',
        onKeys: ['aegyoIntensity', 'aegyoStyleIntensity'],
        defaults: { aegyoIntensity: 0.5 },
        axes: {
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
            },
          ],
          texture: [
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
        defaults: { triangleZoneIntensity: 0.4 },
        note: '눈꼬리 바로 아래 좁은 삼각 음영 — 눈매 깊게, 눈꼬리 리프트 자동 추종',
        axes: {
          color: [
            { type: 'swatches', key: 'triangleZoneColor', palette: TRIANGLE_COLORS },
          ],
          opacity: [
            { type: 'slider', label: '음영 강도', key: 'triangleZoneIntensity' },
          ],
        },
      },
      {
        key: 'mascara',
        label: '속눈썹 상',
        emoji: '🪮',
        productName: '마스카라',
        onKeys: ['mascaraIntensity'],
        defaults: { mascaraIntensity: 0.5 },
        axes: {
          shape: [
            { type: 'segments', key: 'mascaraStyle', options: MASCARA_STYLES_UPPER },
          ],
          color: [
            { type: 'swatches', key: 'mascaraColor', palette: EYELINER_COLORS },
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
        defaults: { doubleLidIntensity: 0.35 },
        note: '접힘선 중심 위 또렷·아래 소프트 음영 (색은 자연 음영 고정)',
        axes: {
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
        defaults: { browConcealIntensity: 0.6 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
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
        defaults: { browIntensity: 0.5 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          color: [{ type: 'swatches', key: 'browColor', palette: BROW_COLORS }],
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
        defaults: { browPowderIntensity: 0.4 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          // 제형 — 채움 물성(파우더=소프트/포마드=꽉·또렷/젤=중간·매끈). BrowPowder.shader 분기.
          texture: [
            {
              type: 'segments',
              key: 'browPowderTexture',
              options: [
                { value: 0, label: '파우더' },
                { value: 1, label: '포마드' },
                { value: 2, label: '젤' },
              ],
            },
          ],
          color: [{ type: 'swatches', key: 'browPowderColor', palette: BROW_COLORS }],
          // 마감 — 블러셔와 동일 enum(시머=펄 브로우). 0=새틴=기존 출력.
          finish: [
            {
              type: 'finish',
              finishKey: 'browPowderFinish',
              shimmerKey: 'browPowderShimmer',
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
        defaults: { browPencilIntensity: 0.5 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
          color: [{ type: 'swatches', key: 'browPencilColor', palette: BROW_COLORS }],
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
        defaults: { browLightenerIntensity: 0.5 },
        note: BROW_NOTE,
        axes: {
          shape: BROW_SHAPE_AXIS,
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
        defaults: { browStyleIntensity: 0.5 },
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
          color: [{ type: 'swatches', key: 'lipBaseColor', palette: LIP_BASE_COLORS }],
          opacity: [{ type: 'slider', label: '커버', key: 'lipBaseIntensity' }],
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
          texture: [
            { type: 'segments', key: 'lipTexture', options: LIP_TEXTURES },
            {
              type: 'import',
              label: '립 그림',
              action: 'lip',
              intensityKey: 'lipStyleIntensity',
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
            },
            {
              type: 'textureMap',
              label: '질감 맵 (광 지도)',
              region: 'lip',
              appliedKey: 'lipFinishMapImported',
            },
            // 재질 + 입자(글리터) — 블러셔와 동일.
            { type: 'segments', key: 'lipMaterial', options: MATERIAL_OPTIONS },
            { type: 'slider', label: '재질 강도', key: 'lipMaterialStrength' },
            { type: 'swatches', label: '글리터 색', key: 'lipParticleColor', palette: HIGHLIGHT_COLORS },
            { type: 'slider', label: '글리터 밀도', key: 'lipParticleDensity' },
            { type: 'slider', label: '글리터 크기', key: 'lipParticleSize' },
            { type: 'slider', label: '글리터 밝기', key: 'lipParticleBrightness' },
            { type: 'slider', label: '글리터 부드러움', key: 'lipParticleFeather' },
            { type: 'slider', label: '글리터 명멸', key: 'lipParticleTwinkle' },
            { type: 'slider', label: '글리터 모양(별)', key: 'lipParticleShape' },
            { type: 'slider', label: '글리터 시차', key: 'lipParticleParallax' },
            { type: 'slider', label: '글리터 컨페티(다색)', key: 'lipParticleConfetti' },
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
        defaults: { lipLinerIntensity: 0.4 },
        note: '외곽 링(매트) — 립보다 한 톤 딥하게 윤곽',
        axes: {
          color: [
            { type: 'swatches', key: 'lipLinerColor', palette: LIP_COLORS },
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
        defaults: { lipGlossIntensity: 0.5 },
        note: '독립 광 톱코트 — 매트 위에도 얹힘 (색은 기본 투명)',
        axes: {
          color: [{ type: 'swatches', key: 'lipGlossColor', palette: LIP_GLOSS_COLORS }],
          opacity: [{ type: 'slider', label: '광량', key: 'lipGlossIntensity' }],
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
          color: [{ type: 'swatches', key: 'hairTintColor', palette: HAIR_COLORS }],
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

export const REGION_DEFS: RegionDef[] = REGION_GROUPS.flatMap(g => g.regions);

export const REGION_MAP: Record<RegionKey, RegionDef> = Object.fromEntries(
  REGION_DEFS.map(d => [d.key, d]),
) as Record<RegionKey, RegionDef>;

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
      } else {
        keys.add(c.key);
      }
    }
  }
  return [...keys];
}
