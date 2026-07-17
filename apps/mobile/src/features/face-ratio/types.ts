export type FaceVerticalThirdsStatus =
  | 'full_success'
  | 'partial_success'
  | 'blocked'
  | 'failed';

export type VerticalThirdsKeypointProvider =
  | 'mediapipe'
  | 'mediapipe_forehead_approx'
  | 'mediapipe_hairline_boundary'
  | 'apple_semantic_matte'
  | 'face_parsing';

export type VerticalThirdsKeypoint = {
  confidence: number;
  method: string;
  provider: VerticalThirdsKeypointProvider;
  x: number;
  y: number;
};

export type VerticalThirdsKeypointMap = {
  G: VerticalThirdsKeypoint | null;
  H: VerticalThirdsKeypoint | null;
  Me: VerticalThirdsKeypoint | null;
  Sn: VerticalThirdsKeypoint | null;
};

export type VerticalThirdsDisplayRatio = {
  lower: number;
  middle: 1.0;
  upper: number | null;
};

export type VerticalThirdsRatio = {
  confidence: number;
  displayRatio: VerticalThirdsDisplayRatio;
  lowerNormalized: number | null;
  lowerPx: number;
  middleNormalized: number | null;
  middlePx: number;
  totalPx: number | null;
  upperNormalized: number | null;
  upperPx: number | null;
  warnings: string[];
};

export type FaceVerticalThirdsMeasurementMode =
  | 'full_vertical_thirds'
  | 'middle_lower_only';

export type FaceVerticalThirdsHairlineOutcome =
  | 'detected_high_confidence'
  | 'detected_low_confidence'
  | 'omitted';

export type FaceVerticalThirdsHairlineAnalysis = {
  analysisEligible: boolean;
  confidence: number | null;
  outcome: FaceVerticalThirdsHairlineOutcome;
  provider: VerticalThirdsKeypointProvider | null;
};

export type VerticalThirdsDominantPart =
  | 'upper'
  | 'middle'
  | 'lower'
  | 'balanced'
  | 'unknown';

export type FaceVerticalThirdsQuality = {
  pitch?: number;
  roll?: number;
  usable: boolean;
  warnings: string[];
  yaw?: number;
};

// 촬영 시 Apple semantic segmentation matte(hair/skin)가 사진에 임베드됐는지 여부.
// face-capture 쪽 RealtimeCameraCaptureResult.semanticMattes와 같은 구조(구조적 타이핑).
export type FaceVerticalThirdsSemanticMattes = {
  hair: boolean;
  requested: boolean;
  skin: boolean;
};

export type FaceRatioPhase1ReplayCondition = {
  distanceLabel: string;
  isReference: boolean;
  poseLabel: string;
  repeatGroup: string;
  repeatIndex: number;
};

export type FaceRatioPhase1ReplayAcquisition = {
  cameraFacing: 'front';
  captureImplementation: 'native';
  source: 'camera';
};

// Phase 1 paired replay 수집 전용 메타데이터. 플래그가 validation-only일 때만
// 사용하며 모든 ID는 실제 사용자 식별자와 분리된 가명 ID여야 한다.
export type FaceRatioPhase1ReplayValidation = {
  acquisition: FaceRatioPhase1ReplayAcquisition;
  captureId: string;
  cohortId: string;
  condition: FaceRatioPhase1ReplayCondition;
  retentionDays: number;
  sessionId: string;
  subjectId: string;
};

export type FaceVerticalThirdsInput = {
  captureId: string;
  capturedHairline?: {
    analysisEligible: boolean;
    confidence: number;
    method: string;
    normalizedPoint: {x: number; y: number};
    provider: VerticalThirdsKeypointProvider;
  };
  createdAt: string;
  debugArtifacts?: boolean;
  imageUri: string;
  semanticMattes?: FaceVerticalThirdsSemanticMattes;
  sessionId: string;
  validationReplay?: FaceRatioPhase1ReplayValidation;
};

// 촬영 후 roll 좌표 보정 결과 (기획 §5.2). 분석기 pose.rollDeg 기반, 이미지 중심 회전.
export type FaceVerticalThirdsPostCorrection = {
  applied: boolean;
  center: {x: number; y: number} | null;
  method:
    | 'mediapipe_facial_transformation_matrix'
    | 'mediapipe_pose_roll'
    | 'none';
  // Phase 1 validation-only 정면화 진단. raw 478점/행렬은 여기에 넣지 않는다.
  // 숫자 confidence로 임의 환산하지 않고 paired replay 관문 전까지
  // diagnostic_only_unvalidated 상태를 보존한다.
  poseNormalization?: {
    confidencePolicy: 'diagnostic_only_unvalidated';
    diagnostics: {
      correctionMaxPx: number | null;
      correctionRmsPx: number | null;
      landmarkCount: number;
      matrixOrthogonalityResidual: number | null;
      matrixRotationDeterminant: number | null;
      matrixScaleSpread: number | null;
      roundTripRmsPx: number | null;
      zSpanPx: number | null;
    };
    requested: boolean;
  };
  rollCorrectionDeg: number | null;
  skippedReason?:
    | 'disabled'
    | 'dimension_invalid'
    | 'landmark_count_invalid'
    | 'landmark_value_invalid'
    | 'matrix_missing'
    | 'matrix_non_affine'
    | 'matrix_non_orthogonal'
    | 'matrix_non_uniform_scale'
    | 'matrix_round_trip_invalid'
    | 'matrix_value_invalid'
    | 'matrix_singular'
    | 'matrix_reflection'
    | 'roll_unavailable'
    | 'roll_out_of_range';
};

// 얼굴 세로/가로 길이 비율. heightPx(헤어라인 H→턱끝 Me) / widthPx(양 볼 idx234↔454).
// 값이 클수록 세로로 긴 얼굴. H(헤어라인) 또는 얼굴 윤곽점이 없으면 undefined.
export type FaceVerticalThirdsLength = {
  heightPx: number;
  ratio: number;
  widthPx: number;
};

export type FaceVerticalThirdsResult = {
  artifacts: {
    appleHairMatteUri?: string;
    appleSkinMatteUri?: string;
    hairlineDebugUri?: string;
    logJsonlUri?: string;
    overlayImageUri?: string;
    poseNormalizationReplayUri?: string;
    resultJsonUri?: string;
    sourceImageUri?: string;
  };
  captureId: string;
  createdAt: string;
  hairlineAnalysis: FaceVerticalThirdsHairlineAnalysis;
  interpretation: {
    dominantPart?: VerticalThirdsDominantPart;
    summary: string;
    title: string;
  };
  // 판정 버전 스냅샷(계획 Phase 0-5). 판정 상수·규칙(FACE_RATIO_JUDGMENT_VERSION)
  // 개정 시 과거 저장 결과의 판정이 재렌더에서 조용히 바뀌는 것을 감지하기 위해
  // 결과 생성 시점의 버전을 저장한다. optional — 스키마 v1 유지(구 결과 부재 허용).
  judgmentVersion?: string;
  // 길이비 판정 스냅샷 — 측정 시점의 verdict·오차 구간을 그대로 저장한다.
  // 화면은 이 스냅샷을 렌더하고(재판정 금지), 스냅샷 없는 구 결과만
  // 현재 판정기로 폴백한다. 서버 derived 규칙도 이 값을 정본으로 소비한다.
  faceLengthJudgment?: {
    band: {hi: number; lo: number};
    verdict:
      | 'wide'
      | 'borderline_wide'
      | 'average'
      | 'borderline_long'
      | 'long'
      | 'indeterminate';
  };
  keypoints: VerticalThirdsKeypointMap;
  measurementMode: FaceVerticalThirdsMeasurementMode;
  // 얼굴 세로/가로 길이 비율 (상단 게이지용). 측정 불가 시 undefined.
  faceLength?: FaceVerticalThirdsLength;
  // 촬영 후 roll 좌표 보정 결과 (H/G/Sn/Me 계산 전 적용). optional — 스키마 v1 유지.
  postCorrection?: FaceVerticalThirdsPostCorrection;
  quality: FaceVerticalThirdsQuality;
  schemaVersion: 'aura-face-vertical-thirds-v1';
  sessionId: string;
  sourceImage: {
    height: number;
    uri: string;
    width: number;
  };
  status: FaceVerticalThirdsStatus;
  statusReason?: string;
  verticalThirds?: VerticalThirdsRatio;
};

export type NativeFaceRatioPoint = {
  x: number;
  y: number;
  z?: number;
};

export type NativeFaceRatioKeypointKey =
  | 'glabella'
  | 'subnasale'
  | 'menton';

export type NativeFaceRatioPose = {
  pitchDeg: number;
  poseSource: 'matrix' | 'unavailable';
  rollDeg: number;
  yawDeg: number;
};

// AURAFaceRatioHairline.m이 임베드된 matte에서 계산한 결과 (payload.matte).
export type NativeFaceRatioMatteInfo = {
  hairAvailable: boolean;
  matteHeight?: number;
  matteWidth?: number;
  skinAvailable: boolean;
};

// Apple hair/skin matte 경계 검출로 얻은 헤어라인 (payload.hairline).
// x/y는 EXIF-upright 기준 normalized(0..1) — 기존 toPixelKeypoint 경로로 px 변환.
export type NativeFaceRatioHairline = {
  boundaryStdPx: number;
  candidateCount: number;
  confidence: number;
  method: 'apple_hair_skin_boundary';
  skinFraction?: number;
  visible: boolean;
  x: number;
  y: number;
};

// options.hairline.debugArtifacts=true일 때 네이티브가 tmp에 쓴 디버그 PNG URI들.
// 서비스가 세션 아티팩트 디렉터리로 복사한다.
export type NativeFaceRatioHairlineDebugArtifacts = {
  hairMatteUri?: string;
  hairlineDebugUri?: string;
  skinMatteUri?: string;
};

export type NativeFaceRatioAnalyzeResult = {
  debugArtifacts?: NativeFaceRatioHairlineDebugArtifacts;
  matteArtifacts?: NativeFaceRatioHairlineDebugArtifacts;
  debugPoints?: Partial<Record<string, NativeFaceRatioPoint>>;
  error?: string;
  faceCount: number;
  hairline?: NativeFaceRatioHairline | null;
  // hairline 부재 시 원인: 'not_implemented' | 'image_unreadable' | 'no_aux_data'
  // | 'roi_invalid' | 'no_candidates' (AURAFaceRatioHairline.h 계약 참조)
  hairlineFailureReason?: string;
  imageHeight?: number;
  imageWidth?: number;
  keypoints?: Partial<Record<NativeFaceRatioKeypointKey, NativeFaceRatioPoint>>;
  landmarkCount?: number;
  // homuler(JS) 랜드마크 프레임과 네이티브 upright 이미지의 종횡비 불일치 플래그.
  // true 면 키포인트/비율이 어긋난 프레임에서 계산됐을 수 있다(계측·디버깅용).
  landmarkFrameMismatch?: boolean;
  matte?: NativeFaceRatioMatteInfo;
  pose?: NativeFaceRatioPose;
  status: 'ok' | 'no_face' | 'unsupported';
};
