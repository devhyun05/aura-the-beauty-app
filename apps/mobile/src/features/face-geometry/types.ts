// 2D 정적 얼굴 기하 지표 — MediaPipe 478 랜드마크(Unity homuler IMAGE 모드) 기반,
// 온디바이스 전용. status 퍼널은 face-ratio(FaceVerticalThirdsResult) 관례를 따른다.

import type {RegionVisuals} from './services/faceGeometryCore/regionVisualsBuilder';

export type FaceGeometryStatus =
  | 'full_success'
  | 'partial_success'
  | 'blocked'
  | 'failed';

export type FaceGeometryMetricUnit = 'ratio' | 'deg';

export type FaceGeometryMetric = {
  unit: FaceGeometryMetricUnit;
  // null = 이 지표만 산출 불가(사유는 warnings). 결과 전체 status와 별개로
  // 지표 단위로 격리한다 — roll 게이트 밖이면 각도 지표만 null(partial_success).
  value: number | null;
  warnings: string[];
};

// 명명 기준: 피사체(anatomical) 기준 — Left/Right 는 피사체 자신의 좌/우.
// 각도(deg) 지표의 부호는 좌우 mirror 정규화되어 있다(양수 = 꼬리/외측이 올라감).
export const FACE_GEOMETRY_METRIC_KEYS = [
  'browSlopeLeftDeg',
  'browSlopeRightDeg',
  'canthalTiltLeftDeg',
  'canthalTiltRightDeg',
  'eyeBrowGapLeft',
  'eyeBrowGapRight',
  'eyeOpennessLeft',
  'eyeOpennessRight',
  'eyeWidthRatioLeft',
  'eyeWidthRatioRight',
  'interCanthalRatio',
  'jawWidthRatio',
  'lipThicknessRatio',
  'lowerJawWidthRatio',
  'mouthCornerAsymmetry',
  'mouthWidthRatio',
  'outerCanthalAngleLeftDeg',
  'outerCanthalAngleRightDeg',
] as const;

export type FaceGeometryMetricKey = (typeof FACE_GEOMETRY_METRIC_KEYS)[number];

export type FaceGeometryMetrics = Record<FaceGeometryMetricKey, FaceGeometryMetric>;

export type FaceGeometryRollCorrection = {
  applied: boolean;
  rollCorrectionDeg: number | null;
  skippedReason?: 'dimension_invalid' | 'roll_out_of_range' | 'roll_unavailable';
};

export type FaceGeometryPose = {
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
};

export type FaceGeometryResult = {
  captureId: string;
  createdAt: string;
  metrics: FaceGeometryMetrics;
  pose: FaceGeometryPose | null;
  // 부위별 크롭 rect + 가이드 폴리라인(정규화 0..1) — 화면 카드 렌더용 파생 기하.
  // 코덱(faceAnalysisMeasurements)이 top-level로 lift 하므로 여기서는 전달용.
  regionVisuals?: RegionVisuals;
  rollCorrection: FaceGeometryRollCorrection;
  schemaVersion: 'aura-face-geometry-v1';
  sessionId: string;
  sourceImage: {height: number; uri: string; width: number};
  status: FaceGeometryStatus;
  statusReason?: string;
};
