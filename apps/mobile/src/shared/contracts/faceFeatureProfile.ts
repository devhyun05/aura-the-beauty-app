// 1층 — 부위별 구조화 속성 프로파일(FaceFeatureProfile).
//
// 이 파일은 "측정치를 어떻게 밴드로 나누는가"의 계약(타입)만 정의한다. 실제
// 결정론적 판정은 features/face-analysis/services/faceFeatureProfileDerive.ts,
// 사진 판정(VLM enum)은 백엔드 분석 호출에서 채운다.
//
// 설계 원칙(docs/faceData_WEI/AURA_FACE_FEATURE_PROFILE_PLAN_KO_v0.1.md):
// - 자기참조: 모집단 절대강도('큰 눈')를 만들지 않는다. 방향(수평 0° 대비)·자기
//   부위 간 비율만 밴드로 쓴다. 아직 population 기준선이 필요한 밴드는 calibration
//   에 'provisional-population'으로 표시해 정직하게 구분한다.
// - 판정 보류: 지표/사진 근거가 없으면 band=null(0으로 치지 않음). AR맞춤핏 계약
//   §6-3의 provenance 오염 방지와 같은 사상.
// - RN·토큰 무의존(계약 러너가 plain node로 실행) — 이 파일에 런타임 import 금지.

export const FACE_FEATURE_PROFILE_SCHEMA_VERSION =
  'aura-face-feature-profile.v0' as const;

// 밴드 경계값(임계값)의 버전. 자체 분포(mean±SD) 확정 시 증가. schemaVersion
// (그릇)과 분리 — 임계값 튜닝은 이 버전만 올린다(AR맞춤핏 계약 §8과 동일 사상).
export const FACE_FEATURE_BAND_MAPPING_VERSION = 'bands-v0-provisional' as const;

// ── 밴드 enum ─────────────────────────────────────────────────────────────

// 수평(0°) 기준 방향, 또는 자기 부위 간 비율의 3구간.
export type DirectionBand = 'down' | 'level' | 'up';
// 눈 사이 거리(눈 가로폭 대비) — 자기참조.
export type SpacingBand = 'close' | 'balanced' | 'wide';
// 일반 3구간(작음/균형/큼). 축별 의미는 소비처에서 라벨링.
export type MagnitudeBand = 'low' | 'balanced' | 'high';
// 눈썹 산(봉우리) 위치 — 자기 눈썹 위 0=앞머리..1=꼬리.
export type BrowApexBand = 'inner' | 'center' | 'outer';
// 윗입술↔아랫입술 두께 균형 — 자기 두 부위 비교.
export type LipBalanceBand = 'upperFuller' | 'balanced' | 'lowerFuller';
// 좌우 비대칭 — 어느 쪽이 더 낮은가(피사체 기준 좌/우). 자기 좌우 비교.
export type AsymmetryBand = 'leftLower' | 'even' | 'rightLower';
// 세로 3분할 우세 부위.
export type VerticalDominantBand = 'upper' | 'middle' | 'lower' | 'balanced';

// 밴드가 순수 자기참조인지, 아직 population 기준선에 의존하는 잠정 밴드인지.
export type BandCalibration = 'self-referential' | 'provisional-population';

// 결정론적 측정 밴드 슬롯. band=null = 판정 보류(지표 없음/퇴화).
export type MeasuredBand<B extends string> = {
  band: B | null;
  // 판정에 쓴 자기참조 원값(디버그·재현). band=null이면 null.
  value: number | null;
  // provenance — 어떤 지표에서 나왔나(재산출·감사용).
  metricKeys: readonly string[];
  calibration: BandCalibration;
};

// ── 사진 판정 enum(VLM) ────────────────────────────────────────────────────

export type DoubleEyelidType = 'monolid' | 'inner' | 'outer' | 'hooded';
export type SaggingBand = 'none' | 'mild' | 'pronounced';
export type PresenceBand = 'present' | 'absent';
export type ContrastBand = 'low' | 'medium' | 'high';
export type DensityBand = 'sparse' | 'medium' | 'dense';
// 입술 볼륨(자기 얼굴 대비) — 리서치 L-1(얇은 입술→국소 오버립) 입력.
export type FullnessBand = 'thin' | 'medium' | 'full';
export type CheekHeightBand = 'low' | 'mid' | 'high';
export type CheekVolumeBand = 'flat' | 'medium' | 'full';

// VLM 관찰 슬롯. null = 사진 판정 부재/저confidence로 보류(생략). 채워질 때는
// confidence + evidence(한 줄 근거)가 필수 — 판정을 재현·감사할 수 있게 한다.
export type VlmObservation<B extends string> = {
  value: B;
  confidence: number;
  evidence: string;
} | null;

// 백엔드 featureObservations 원본(슬롯 승격 전). value는 정해진 enum 또는 'unclear'
// 등 임의 문자열일 수 있어 string으로 받는다 — enum 유효성·생략은 빌더가 판정한다.
// (faceAnalysis.ts가 이 타입을 재수출해 보고서 필드로 노출한다 — RN 무의존 유지 목적.)
export type FaceFeatureObservationRaw = {
  value: string;
  confidence: number;
  evidence: string;
};

export type FaceFeatureObservationKey =
  | 'eyelidType'
  | 'upperLidHooding'
  | 'lowerLidSagging'
  | 'aegyoSal'
  | 'browDensity'
  | 'cheekboneHeight'
  | 'cheekVolume'
  | 'eyeContrast'
  | 'cheekContrast'
  | 'lipColorContrast'
  | 'lipFullness';

export type FaceFeatureObservations = Partial<
  Record<FaceFeatureObservationKey, FaceFeatureObservationRaw>
>;

// ── 프로파일 ───────────────────────────────────────────────────────────────

export type FaceFeatureEyeProfile = {
  // 눈꼬리 방향(canthalTilt) — 자기참조(수평 대비).
  canthalTilt: MeasuredBand<DirectionBand>;
  // 눈 개방(세로:가로 aspect) — 둥근(high)↔가는(low). population 잠정.
  openness: MeasuredBand<MagnitudeBand>;
  // 눈 사이 거리 — eyeWidth/interCanthal 자기참조.
  spacing: MeasuredBand<SpacingBand>;
  // VLM
  doubleEyelid: VlmObservation<DoubleEyelidType>;
  upperLidHooding: VlmObservation<SaggingBand>;
  lowerLidSagging: VlmObservation<SaggingBand>;
  aegyoSal: VlmObservation<PresenceBand>;
  // 눈매 대비 — 2층 시각 무게 지도 입력.
  contrast: VlmObservation<ContrastBand>;
};

export type FaceFeatureBrowProfile = {
  // 눈썹 기울기 — 자기참조(수평 대비).
  slope: MeasuredBand<DirectionBand>;
  // 눈썹 산 위치 — 자기 눈썹 위 위치, 자기참조.
  apex: MeasuredBand<BrowApexBand>;
  // 눈썹-눈 거리(gap/eyeWidth) — 좁음↔넓음. population 잠정.
  eyeGap: MeasuredBand<MagnitudeBand>;
  // VLM
  density: VlmObservation<DensityBand>;
};

export type FaceFeatureLipProfile = {
  // 윗:아랫 두께 균형 — 자기 두 부위 비교, 자기참조.
  thicknessBalance: MeasuredBand<LipBalanceBand>;
  // 입 폭(mouth/faceWidth) — 좁음↔넓음. population 잠정.
  width: MeasuredBand<MagnitudeBand>;
  // 입꼬리 좌우 비대칭 — mouthCornerAsymmetry. ⚠ '전체 처짐/올라감'이 아니라
  // 좌우 높이차다(전체 입꼬리 방향 지표는 부재 — L-2 gap).
  cornerAsymmetry: MeasuredBand<AsymmetryBand>;
  // VLM
  colorContrast: VlmObservation<ContrastBand>;
  // 입술 볼륨(자기 얼굴 대비 얇음/도톰) — 오버립 규칙 입력.
  fullness: VlmObservation<FullnessBand>;
};

export type FaceFeatureCheekProfile = {
  // 볼은 결정론 지표가 없어 전부 VLM.
  cheekboneHeight: VlmObservation<CheekHeightBand>;
  volume: VlmObservation<CheekVolumeBand>;
  // 볼 대비 — 2층 시각 무게 지도 입력.
  contrast: VlmObservation<ContrastBand>;
};

export type FaceFeatureContourProfile = {
  // 하악 폭(jaw/faceWidth) — 좁음↔넓음. population 잠정.
  jawWidth: MeasuredBand<MagnitudeBand>;
  // 세로 3분할 우세 — 자기 세 부위 비교, 자기참조.
  verticalBalance: MeasuredBand<VerticalDominantBand>;
  // 얼굴형 — faceAnalysisV2.derived.faceShape 라벨 재사용(없으면 null).
  faceShape: string | null;
};

export type FaceFeatureProfile = {
  schemaVersion: typeof FACE_FEATURE_PROFILE_SCHEMA_VERSION;
  bandMappingVersion: string;
  // 어느 분석에서 파생됐나(측정 스냅샷 추적). 세션 파생 시 없을 수 있음.
  sourceReportId?: string;
  measuredAt: string;
  eye: FaceFeatureEyeProfile;
  brow: FaceFeatureBrowProfile;
  lip: FaceFeatureLipProfile;
  cheek: FaceFeatureCheekProfile;
  contour: FaceFeatureContourProfile;
};
