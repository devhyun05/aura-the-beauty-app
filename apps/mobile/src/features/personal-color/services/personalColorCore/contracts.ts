// AURA 온디바이스 퍼스널 컬러 엔진 — 데이터 계약(순수 타입, RN 의존 없음)
//
// 중요: 이 파이프라인은 카메라 AE/AWB lock 이후에 동작하므로 절대 Lab는
// colorimetric 측정이 아니라 device·scene-relative 값이다. 따라서 모든 축은
// within-frame 상대 신호(부위 간 관계)만 소비하며 절대 undertone을 단정하지 않는다.

export const PERSONAL_COLOR_SCHEMA_VERSION = 'aura-personal-color-v1' as const;

export type PersonalColorSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export type PersonalColor12Type =
  | 'spring_light'
  | 'spring_bright'
  | 'spring_true'
  | 'summer_light'
  | 'summer_true'
  | 'summer_muted'
  | 'autumn_muted'
  | 'autumn_true'
  | 'autumn_deep'
  | 'winter_bright'
  | 'winter_true'
  | 'winter_deep';

export type AxisName = 'temperature' | 'value' | 'chroma' | 'clarity' | 'contrast';

export type Rgb = { r: number; g: number; b: number };
export type Lab = { L: number; a: number; b: number };
export type Lch = { L: number; C: number; h: number };

export type ColorSpaceTag = 'srgb' | 'display-p3';

// ---- 네이티브 입력 (AURAPersonalColorAnalyzer.m 반환 스키마) ----

export type NativeRegionKey =
  | 'skinCheekLeft'
  | 'skinCheekRight'
  | 'skinForehead'
  | 'hair'
  | 'lip'
  // 흰자(sclera) — 축 계산에는 불참. 조명 캐스트 추정(illuminationCorrection) 전용.
  | 'scleraLeft'
  | 'scleraRight';

export type NativeRegionStats = {
  rgbMean: Rgb;
  rgbVariance: Rgb; // 채널별 분산 (8-bit² 단위)
  dominant: Rgb;
  sampleCount: number;
  areaRatio: number; // ROI 픽셀 / 이미지 픽셀
  matteCoverage: number; // 0..1, matte 게이트 통과 비율 (lip은 1)
  overexposedRatio: number;
  underexposedRatio: number;
  specularRejectedRatio: number;
  confidence: number; // 네이티브 raw q, 0..1
};

export type NativePersonalColorResult = {
  status: 'ok' | 'no_face' | 'unsupported' | 'error';
  faceCount: number;
  landmarkCount?: number;
  imageWidth?: number;
  imageHeight?: number;
  colorSpace?: ColorSpaceTag;
  matte?: {
    skinAvailable: boolean;
    hairAvailable: boolean;
    matteWidth: number;
    matteHeight: number;
  };
  regions?: Partial<Record<NativeRegionKey, NativeRegionStats>>;
  warnings?: string[];
  error?: string;
};

// ---- 엔진 산출 (JS) ----

export type RegionKey = 'skin' | 'hair' | 'lip';

export type AuraAxis = {
  value: number | null; // [-1,1] 또는 floor 미만이면 null
  confidence: number; // 0..1
  floored: boolean;
  basis: 'within-frame-relative';
};

export type AuraRegionMeasurement = {
  region: RegionKey;
  colorSpace: ColorSpaceTag;
  lab: Lab;
  lch: { C: number; h: number };
  qNative: number;
  qEff: number;
  areaRatio: number;
  overExposedRatio: number;
  underExposedRatio: number;
  warnings: string[];
};

export type PersonalColorStatus = 'definitive' | 'mixed' | 'provisional' | 'insufficient';

export type ToneResult = {
  top: PersonalColor12Type;
  secondary: PersonalColor12Type | null;
  isMixed: boolean;
  typeScore: number; // p_top
  gap: number; // p_top - p_second
  tau: number;
  probabilities: Record<PersonalColor12Type, number>;
  distances: Record<PersonalColor12Type, number>;
  season: PersonalColorSeason;
};

export type Undertone = 'warm' | 'cool' | 'neutral';
export type ValueBand = 'light' | 'mid' | 'deep';
export type ChromaBand = 'soft' | 'clear' | 'vivid';

export type ColorFamily = {
  id: string;
  undertone: Undertone;
  valueBand: ValueBand;
  chromaBand: ChromaBand;
  labelKo: string;
  exemplars: string[];
};

export type PaletteAxisReason = {
  axis: AxisName;
  direction: string;
  noteKo: string;
};

export type PaletteItem = {
  family: ColorFamily;
  reasons: PaletteAxisReason[];
  noteKo: string;
};

export type ReferencePointSnapshot = {
  neutralSource: 'population' | 'in-frame-neutral';
  fixedRefsVersion: string;
};

export type PersonalColorPrivacy = {
  localOnly: true;
  offDeviceUpload: false;
  longTermRawFrameStored: false;
};

export type AuraPersonalColorResult = {
  schemaVersion: typeof PERSONAL_COLOR_SCHEMA_VERSION;
  status: PersonalColorStatus;
  colorFrame: 'device-relative-awb-locked';
  calibrationApplied: boolean;
  preCalibrationHedge: boolean;
  regions: AuraRegionMeasurement[];
  deferredRegions: ['eye'];
  axes: Record<AxisName, AuraAxis>;
  relations: {
    dL_skinHair: number | null;
    dL_skinLip: number | null;
    dE00_skinHair: number | null;
    dE00_skinLip: number | null;
  };
  tone: ToneResult | null; // 'insufficient'면 null
  palette: {
    best: PaletteItem[];
    worst: PaletteItem[];
    colorFamilies: ColorFamily[];
  };
  measurementConfidence: number;
  warnings: string[];
  artifacts: {
    referencePoints: ReferencePointSnapshot;
    calibrationVersion: string | null;
    frameCount: number;
  };
  privacy: PersonalColorPrivacy;
};

export const PERSONAL_COLOR_PRIVACY: PersonalColorPrivacy = {
  localOnly: true,
  offDeviceUpload: false,
  longTermRawFrameStored: false,
};
