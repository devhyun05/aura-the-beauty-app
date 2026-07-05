// Apple semantic matte 헤어라인(H) 판정 상수.
// docs/AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md 참조.

// hairlineConfidence >= FULL → apple H 채택 + full_success 가능 (문서 v0.2 §4.3.5)
export const APPLE_HAIRLINE_FULL_CONFIDENCE = 0.7;
// MIN <= confidence < FULL → apple H 사용하되 low-confidence warning + partial_success
// confidence < MIN → apple H 기각, idx-10 근사 폴백(현행 동작)
export const APPLE_HAIRLINE_MIN_CONFIDENCE = 0.45;

// quality gate / math / screen에서 공유하는 warning 문자열. 하드코딩 금지, 여기서 import.
export const HAIRLINE_WARNING = {
  appleMatte: 'hairline_apple_matte',
  appleMatteLowConfidence: 'hairline_apple_matte_low_confidence',
  approximated: 'hairline_approximated_mediapipe',
  approximatedUnusable: 'hairline_approximated_mediapipe_unusable',
  invalidOrder: 'hairline_invalid_order',
  unavailable: 'hairline_unavailable',
} as const;

export type HairlineWarning =
  (typeof HAIRLINE_WARNING)[keyof typeof HAIRLINE_WARNING];

// selectHairlineKeypoint가 반환하는 H 채택 등급. full_success는 'apple_full'이 quality gate를
// 통과한 경우에만 가능하다.
export type HairlineSelectionTier = 'apple_full' | 'apple_low' | 'approx' | 'none';

// 네이티브 스캔 상수 override. 키 이름은 ios/AURA/AURAFaceRatioHairline.m 상단의
// kHairline* 상수 이름(접두사 kHairline 제외, lowerCamelCase)과 1:1 대응해야 한다.
// 비워두면 네이티브 기본값 사용. 실기기 threshold 튜닝 시 리빌드 없이 여기서 조정한다.
export type FaceRatioHairlineTuning = Partial<{
  roiHalfWidthFraction: number; // 0.28
  roiTopOffsetFraction: number; // 0.35
  roiBottomMarginFraction: number; // 0.03
  hairAlphaThreshold: number; // 0.45
  skinAlphaThreshold: number; // 0.35
  gradientThreshold: number; // 0.25
  hairWindowFraction: number; // 0.005
  skinWindowFraction: number; // 0.010
  gradientOffsetFraction: number; // 0.004
  sampledColumnCount: number; // 48
  outlierMaxDeviationFraction: number; // 0.08
  minCandidateCount: number; // 8
  minSkinFraction: number; // 0.20
  minGapToGlabellaFraction: number; // 0.02
  weightBoundarySharpness: number; // 0.40
  weightCandidateConsistency: number; // 0.30
  weightForeheadSkinVisibility: number; // 0.20
  weightPoseQuality: number; // 0.10
  sharpnessNormGradient: number; // 0.60
  skinVisibilityNorm: number; // 0.60
  poseYawLimitDeg: number; // 8
  posePitchLimitDeg: number; // 8
  poseRollLimitDeg: number; // 5
}>;

export const HAIRLINE_TUNING: FaceRatioHairlineTuning = {};
