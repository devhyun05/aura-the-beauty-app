// Apple semantic matte 헤어라인(H) 판정 상수.
// docs/AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md 참조.

// hairlineConfidence >= FULL → apple H 채택 + full_success 가능 (문서 v0.2 §4.3.5)
export const APPLE_HAIRLINE_FULL_CONFIDENCE = 0.7;
// MIN <= confidence < FULL → 실제 H를 참고 데이터로만 보존하고 공식 계산에서는 제외.
// confidence < MIN → H 자체를 omitted 처리한다.
export const APPLE_HAIRLINE_MIN_CONFIDENCE = 0.45;

// quality gate / math / screen에서 공유하는 warning 문자열. 하드코딩 금지, 여기서 import.
export const HAIRLINE_WARNING = {
  appleMatte: 'hairline_apple_matte',
  appleMatteLowConfidence: 'hairline_apple_matte_low_confidence',
  approximated: 'hairline_approximated_mediapipe',
  approximatedUnusable: 'hairline_approximated_mediapipe_unusable',
  detected: 'hairline_detected',
  invalidOrder: 'hairline_invalid_order',
  lowConfidence: 'hairline_low_confidence',
  proxyRejected: 'hairline_proxy_rejected',
  unavailable: 'hairline_unavailable',
} as const;

export type HairlineWarning =
  (typeof HAIRLINE_WARNING)[keyof typeof HAIRLINE_WARNING];

// 과거 저장 결과 파싱 호환용 등급. 신규 공식 선택 경로는
// faceVerticalThirdsHairlineSelection의 provider 중립 outcome을 사용한다.
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

// ─────────────────────────────────────────────────────────────────────────
// 얼굴 길이비(세로 H→Me / 가로 볼 idx234↔454) 판정·게이지의 단일 정의처.
// 종전에는 기준값(화면 로컬 상수)·마커 스케일(1.28/1.56)·라벨 x좌표('28%/47%')·
// 판정 임계(±0.02)가 4벌로 흩어져 화면에서 서로 어긋났다
// (docs/superpowers/plans/2026-07-16-face-measurement-analysis-plan.md §0-2).

// 판정 버전. 아래 기준값·판정 규칙이 바뀌면 이 문자열을 올린다 — 결과에
// 스냅샷 저장되어(FaceVerticalThirdsResult.judgmentVersion) 상수 개정이
// 재렌더에서 과거 판정을 조용히 바꾸는 것을 감지·방지한다(계획 Phase 0-5).
export const FACE_RATIO_JUDGMENT_VERSION =
  'face-length-judgment/v2-provisional-20260717';

// 1차 출처 부재가 확인된 잠정값(계획 §5 D-1: 미용 얼굴형 휴리스틱 근사로
// 추정, 정확값의 문헌 완전일치 0건). 한국 여성 실측 앵커 ≈1.37(§5 D-2)
// 대비 average가 과대할 수 있어 판정은 단정 대신 동적 유보 구간
// (judgeFaceLength)을 거친다. Phase 4에서 자체 촬영셋 mean±SD로 교체.
export const FACE_LENGTH_REFERENCE = {
  wide: 1.351,
  average: 1.455,
  long: 1.506,
} as const;

// 게이지 스케일은 판정 경계(wide/long)에서 파생한다: 균등 3분할 색
// 세그먼트의 경계가 판정 경계와 정확히 일치하도록, 경계 간격만큼 양끝을
// 확장한다(min = wide−간격, max = long+간격 → 경계가 정확히 33.3%/66.7%).
const REFERENCE_BAND = FACE_LENGTH_REFERENCE.long - FACE_LENGTH_REFERENCE.wide;
export const FACE_LENGTH_GAUGE = {
  max: FACE_LENGTH_REFERENCE.long + REFERENCE_BAND,
  min: FACE_LENGTH_REFERENCE.wide - REFERENCE_BAND,
} as const;

export function getGaugeMarkerPercent(lengthRatio: number): number {
  const span = FACE_LENGTH_GAUGE.max - FACE_LENGTH_GAUGE.min;
  const raw = ((lengthRatio - FACE_LENGTH_GAUGE.min) / span) * 100;

  return Math.max(0, Math.min(100, raw));
}

export type FaceLengthVerdict =
  | 'wide'
  | 'borderline_wide'
  | 'average'
  | 'borderline_long'
  | 'long'
  // pose(pitch/yaw)를 확인하지 못한 입력 — 오차 구간을 계산할 수 없으므로
  // 정면으로 간주하지 않고(fail-closed) 판정을 보류한다.
  | 'indeterminate';

export type FaceLengthJudgment = {
  // 촬영 pose가 허용하는 참값 구간. band가 판정 경계를 걸치면 유보 verdict.
  band: {hi: number; lo: number};
  verdict: FaceLengthVerdict;
};

// 동적 유보 구간(계획 Phase 0-2). 오차는 대칭 노이즈가 아니라 방향성 편향:
// pitch는 세로를 cos(pitch)로 압축해 측정비를 낮추고(참값 상한 = m/cos(pitch)),
// yaw는 가로를 압축해 측정비를 높인다(참값 하한 = m×cos(yaw)).
// 게이트 최악(pitch 12°/yaw 8°)에서 구간 폭 −1.0%~+2.2%. 정면에 가까운
// 촬영은 구간이 좁아져 단정이 회복된다. 측정 로직 무변경 — 표현 계층 판정.
export function judgeFaceLength(
  lengthRatio: number,
  pitchDeg?: number,
  yawDeg?: number,
): FaceLengthJudgment {
  // pose 결측·비유한값을 0°로 간주하면 불확실성이 사라져 오히려 단정이
  // 복원된다(fail-open) — 판정 보류로 처리한다. 정상 경로는 품질 게이트가
  // 유효 pose를 보장하므로 이 분기는 게이트 밖 호출·구형 데이터 방어용.
  if (
    typeof pitchDeg !== 'number' ||
    !Number.isFinite(pitchDeg) ||
    typeof yawDeg !== 'number' ||
    !Number.isFinite(yawDeg)
  ) {
    return {band: {hi: lengthRatio, lo: lengthRatio}, verdict: 'indeterminate'};
  }

  const toRad = (deg: number) => (Math.abs(deg) * Math.PI) / 180;
  const lo = lengthRatio * Math.cos(toRad(yawDeg));
  const hi = lengthRatio / Math.cos(toRad(pitchDeg));
  const band = {hi, lo};

  if (hi <= FACE_LENGTH_REFERENCE.wide) {
    return {band, verdict: 'wide'};
  }
  if (lo >= FACE_LENGTH_REFERENCE.long) {
    return {band, verdict: 'long'};
  }
  if (lo < FACE_LENGTH_REFERENCE.wide) {
    return {band, verdict: 'borderline_wide'};
  }
  if (hi > FACE_LENGTH_REFERENCE.long) {
    return {band, verdict: 'borderline_long'};
  }

  return {band, verdict: 'average'};
}

// 판정형 제목. 문구 확정은 팀 검토 후(계획 Phase 0-3) — 유보 2종이 신설 축.
export function getFaceLengthTitle(verdict: FaceLengthVerdict): string {
  switch (verdict) {
    case 'wide':
      return '가로형 얼굴';
    case 'borderline_wide':
      return '가로형과 평균 사이';
    case 'average':
      return '평균에 가까운 얼굴';
    case 'borderline_long':
      return '평균과 세로형 사이';
    case 'long':
      return '세로로 긴 얼굴';
    case 'indeterminate':
      return '길이 비율 판정 보류';
  }
}
