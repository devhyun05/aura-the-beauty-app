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
};

// 촬영 후 roll 좌표 보정 결과 (기획 §5.2). 분석기 pose.rollDeg 기반, 이미지 중심 회전.
export type FaceVerticalThirdsPostCorrection = {
  applied: boolean;
  center: {x: number; y: number} | null;
  method: 'mediapipe_pose_roll' | 'none';
  rollCorrectionDeg: number | null;
  skippedReason?: 'roll_unavailable' | 'roll_out_of_range' | 'dimension_invalid';
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
  | 'hApprox'
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
