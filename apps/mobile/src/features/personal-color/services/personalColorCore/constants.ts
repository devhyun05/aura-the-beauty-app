// 5축·12톤 상수 — 전부 INSTRUMENTED / calibration target.
// Phase 2 재현성 캡처 전까지 게이트로 승격 금지. 값 변경은 Xcode 리빌드 불필요(JS).

import type { AxisName, PersonalColor12Type, PersonalColorSeason } from './contracts';

export const FIXED_REFS_VERSION = 'aura-pc-refs-v0.1' as const;

// 고정 population reference (calibration target)
export const REFS = {
  // Value: D = 1 - L*/100
  dRefSkin: 0.45,
  dScaleSkin: 0.22,
  dRefHair: 0.75,
  dScaleHair: 0.2,
  dRefLip: 0.55,
  dScaleLip: 0.18,
  // Chroma: C* = sqrt(a*²+b*²)
  cRefSkin: 20,
  cScaleSkin: 12,
  cRefLip: 45,
  cScaleLip: 25,
  // Undertone: U = b* - a*
  uRefSkin: 6,
  uScaleSkin: 8,
  uRefLip: -17,
  uScaleLip: 15,
  uRefHair: 3,
  uScaleHair: 6,
  // Variance: σ(8-bit)
  sigmaRef: 18,
} as const;

// 부위 유효 confidence 계산용. areaRatio는 matte-gated coverage 비율(0..1, scale-free).
// 네이티브가 ROI별 (gated 픽셀 / 샘플 픽셀)로 보고하는 값과 동일 의미.
export const AREA_MIN = { skin: 0.3, hair: 0.2, lip: 0.35 } as const;
export const EXPOSURE_TOLERANCE = 0.1; // over/under 이 값 초과분에 페널티

// q 재정규화 floor (aggregate)
export const AXIS_Q_FLOOR = 0.35;

// 부위 가중치 (Σ=1 per axis; hair는 Chroma에서 제외)
export const AXIS_WEIGHTS = {
  temperature: { skin: 0.6, hair: 0.1, lip: 0.3 },
  value: { skin: 0.55, hair: 0.35, lip: 0.1 },
  chroma: { skin: 0.45, hair: 0.0, lip: 0.55 },
} as const;

// Contrast 관계식 스케일
export const CONTRAST = {
  vcWeightSkinHair: 0.7,
  vcWeightSkinLip: 0.3,
  ccWeightSkinHair: 0.6,
  ccWeightSkinLip: 0.4,
  vcScale: 35, // L* 단위
  ccScale: 30, // ΔE00 단위
  scoreWeightVc: 0.65,
  scoreWeightCc: 0.35,
  centerScore: 0.5,
  scale: 0.35,
} as const;

// 12톤 프로토타입 좌표 [Temp, Value, Chroma, Clarity, Contrast]
// 전부 교육적 시작값 = Phase 2 calibration target(prior).
export const PROTOTYPE_ORDER: AxisName[] = [
  'temperature',
  'value',
  'chroma',
  'clarity',
  'contrast',
];

export const PROTOTYPES: Record<PersonalColor12Type, [number, number, number, number, number]> = {
  spring_light: [0.55, -0.75, 0.25, 0.3, -0.35],
  spring_bright: [0.45, -0.3, 0.85, 0.85, 0.45],
  spring_true: [0.85, -0.35, 0.6, 0.55, 0.1],
  summer_light: [-0.5, -0.7, -0.25, -0.25, -0.55],
  summer_true: [-0.85, -0.3, -0.35, -0.35, -0.25],
  summer_muted: [-0.55, -0.1, -0.7, -0.8, -0.6],
  autumn_muted: [0.55, 0.35, -0.55, -0.7, -0.2],
  autumn_true: [0.9, 0.45, 0.2, -0.35, 0.15],
  autumn_deep: [0.65, 0.85, 0.3, -0.05, 0.55],
  winter_bright: [-0.55, 0.35, 0.85, 0.9, 0.85],
  winter_true: [-0.9, 0.45, 0.55, 0.7, 0.7],
  winter_deep: [-0.6, 0.9, 0.5, 0.55, 0.9],
};

export const TYPE_TO_SEASON: Record<PersonalColor12Type, PersonalColorSeason> = {
  spring_light: 'spring',
  spring_bright: 'spring',
  spring_true: 'spring',
  summer_light: 'summer',
  summer_true: 'summer',
  summer_muted: 'summer',
  autumn_muted: 'autumn',
  autumn_true: 'autumn',
  autumn_deep: 'autumn',
  winter_bright: 'winter',
  winter_true: 'winter',
  winter_deep: 'winter',
};

export const ALL_12_TYPES = Object.keys(PROTOTYPES) as PersonalColor12Type[];

// 축별 신뢰도 가중치 (chroma가 AWB-lock 후 최저 신뢰)
export const AXIS_RELIABILITY: Record<AxisName, number> = {
  temperature: 1.0,
  value: 1.0,
  chroma: 0.6,
  clarity: 0.8,
  contrast: 0.9,
};

// softmax + 앵커 임계값 (확률공간, 스케일 안정) — calibration target
export const CLASSIFIER = {
  tau0: 0.3,
  mixedGap: 0.12,
  secondaryMin: 0.2,
  neutralMin: 0.28,
} as const;

// measurementConfidence 게이팅 임계값
export const MC_GATE = {
  definitive: 0.7,
  usable: 0.45,
} as const;

// 한국어 타입 표시명
export const TYPE_LABEL_KO: Record<PersonalColor12Type, string> = {
  spring_light: '봄 라이트',
  spring_bright: '봄 브라이트',
  spring_true: '봄 웜(트루)',
  summer_light: '여름 라이트',
  summer_true: '여름 쿨(트루)',
  summer_muted: '여름 뮤트',
  autumn_muted: '가을 뮤트',
  autumn_true: '가을 웜(트루)',
  autumn_deep: '가을 딥',
  winter_bright: '겨울 브라이트',
  winter_true: '겨울 쿨(트루)',
  winter_deep: '겨울 딥',
};
