/**
 * AR 블러셔 공통 카탈로그.
 *
 * Stencil의 flat FilterParams, 레거시 AR 필터, FullFace 레시피가 같은 모양 값과
 * 표시 이름을 사용하도록 이 파일을 단일 출처로 둔다. shape value는 저장/브리지
 * 호환 계약이므로 순서를 바꾸거나 재사용하지 않는다.
 */

export const AR_BLUSH_MAX_INTENSITY = 1.2;

export type ArBlushUndertone = 'warm' | 'neutral' | 'cool';

export type ArBlushShape = {
  id: string;
  /** ARFilterScreen의 selectedShapeId. 기존 cheek-* ID는 저장 호환을 위해 유지한다. */
  arFilterShapeId: string;
  label: string;
  /** Unity FilterParams.blushShape의 stable value (0..7). */
  value: number;
  /** 모양을 바꿀 때 이전 룩의 배치값이 새 마스크를 밀지 않도록 함께 시드한다. */
  lift: number;
  spread: number;
};

export type ArBlushReferenceShape = ArBlushShape & {
  /** FullFace 후보 카드의 기존 저장 ID. */
  fullFaceCandidateOptionId: string;
  candidateId: string;
  maskTextureId: string;
};

export const AR_BLUSH_LEGACY_SHAPES = [
  {
    id: 'classic',
    arFilterShapeId: 'cheek-classic',
    label: '클래식',
    value: 0,
    lift: 0,
    spread: 0,
  },
  {
    id: 'igari',
    arFilterShapeId: 'cheek-igari',
    label: '이가리',
    value: 1,
    lift: 0,
    spread: 0,
  },
  {
    id: 'draping',
    arFilterShapeId: 'cheek-draping',
    label: '드레이핑',
    value: 2,
    lift: 0,
    spread: 0,
  },
] as const satisfies readonly ArBlushShape[];

export const AR_BLUSH_REFERENCE_SHAPES = [
  {
    id: 'daily',
    arFilterShapeId: 'cheek-daily',
    fullFaceCandidateOptionId: 'daily',
    label: '데일리',
    value: 3,
    lift: 0,
    spread: 0,
    candidateId: 'blush-session-1-v1',
    maskTextureId: 'cheek-session-mask-1-v1',
  },
  {
    id: 'lovely',
    arFilterShapeId: 'cheek-lovely',
    fullFaceCandidateOptionId: 'lovely',
    label: '러블리',
    value: 4,
    lift: 0,
    spread: 0,
    candidateId: 'blush-session-2-v1',
    maskTextureId: 'cheek-session-mask-2-v1',
  },
  {
    id: 'under-eye',
    arFilterShapeId: 'cheek-under',
    fullFaceCandidateOptionId: 'under-eye',
    label: '언더아이',
    value: 5,
    lift: 0,
    spread: 0,
    candidateId: 'blush-session-3-v1',
    maskTextureId: 'cheek-session-mask-3-v1',
  },
  {
    id: 'sun-kissed-soft',
    arFilterShapeId: 'cheek-sunkiss1',
    fullFaceCandidateOptionId: 'sun-1',
    label: '선키스드 소프트',
    value: 6,
    lift: 0,
    spread: 0,
    candidateId: 'blush-session-4-v1',
    maskTextureId: 'cheek-session-mask-4-v1',
  },
  {
    id: 'sun-kissed-band',
    arFilterShapeId: 'cheek-sunkiss2',
    fullFaceCandidateOptionId: 'sun-2',
    label: '선키스드 밴드',
    value: 7,
    lift: 0,
    spread: 0,
    candidateId: 'blush-session-5-v1',
    maskTextureId: 'cheek-session-mask-5-v1',
  },
] as const satisfies readonly ArBlushReferenceShape[];

export const AR_BLUSH_SHAPES: readonly ArBlushShape[] = [
  ...AR_BLUSH_LEGACY_SHAPES,
  ...AR_BLUSH_REFERENCE_SHAPES,
];

export type ArBlushColor = {
  id: string;
  label: string;
  hex: string;
  undertone: ArBlushUndertone;
  undertoneLabel: '웜' | '뉴트럴' | '쿨';
};

/**
 * 서로 육안 구분이 되는 8색. 화면에는 간결한 색 이름만 보이고, 웜/뉴트럴/쿨은
 * 추천·검증용 metadata로 분리한다.
 */
export const AR_BLUSH_COLORS = [
  {
    id: 'warm-apricot-coral',
    label: '살구 코랄',
    hex: '#E98A62',
    undertone: 'warm',
    undertoneLabel: '웜',
  },
  {
    id: 'warm-peach-beige',
    label: '피치 베이지',
    hex: '#E9A27F',
    undertone: 'warm',
    undertoneLabel: '웜',
  },
  {
    id: 'warm-terracotta',
    label: '테라코타',
    hex: '#C96A50',
    undertone: 'warm',
    undertoneLabel: '웜',
  },
  {
    id: 'neutral-rose',
    label: '로즈',
    hex: '#D77986',
    undertone: 'neutral',
    undertoneLabel: '뉴트럴',
  },
  {
    id: 'neutral-soft-red',
    label: '소프트 레드',
    hex: '#C85F66',
    undertone: 'neutral',
    undertoneLabel: '뉴트럴',
  },
  {
    id: 'cool-clear-pink',
    label: '클리어 핑크',
    hex: '#E06C91',
    undertone: 'cool',
    undertoneLabel: '쿨',
  },
  {
    id: 'cool-lilac-mauve',
    label: '라일락 모브',
    hex: '#B86F91',
    undertone: 'cool',
    undertoneLabel: '쿨',
  },
  {
    id: 'cool-berry',
    label: '베리',
    hex: '#A84E69',
    undertone: 'cool',
    undertoneLabel: '쿨',
  },
] as const satisfies readonly ArBlushColor[];

export const AR_BLUSH_DEFAULT_SHAPE = AR_BLUSH_SHAPES[0];
export const AR_BLUSH_DEFAULT_COLOR = AR_BLUSH_COLORS[3];

export function getArBlushShapeByValue(value: number | undefined): ArBlushShape | undefined {
  return AR_BLUSH_SHAPES.find(shape => shape.value === value);
}

export function getArBlushShapeByArFilterId(
  arFilterShapeId: string,
): ArBlushShape | undefined {
  return AR_BLUSH_SHAPES.find(shape => shape.arFilterShapeId === arFilterShapeId);
}

export function getArBlushReferenceShapeByArFilterId(
  arFilterShapeId: string,
): ArBlushReferenceShape | undefined {
  return AR_BLUSH_REFERENCE_SHAPES.find(
    shape => shape.arFilterShapeId === arFilterShapeId,
  );
}

export function getArBlushColorByHex(hex: string | undefined): ArBlushColor | undefined {
  if (!hex) return undefined;
  const normalized = hex.toUpperCase();
  return AR_BLUSH_COLORS.find(color => color.hex.toUpperCase() === normalized);
}

export function clampArBlushIntensity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(AR_BLUSH_MAX_INTENSITY, Math.max(0, value));
}

/** 실제 0..1.2 안료 강도 → 화면 0..1(0~100) 슬라이더 값. */
export function normalizeArBlushIntensity(value: number): number {
  return clampArBlushIntensity(value) / AR_BLUSH_MAX_INTENSITY;
}

/** 화면 0..1(0~100) 슬라이더 값 → 실제 0..1.2 안료 강도. */
export function arBlushIntensityFromSlider(value: number): number {
  const normalized = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return normalized * AR_BLUSH_MAX_INTENSITY;
}
