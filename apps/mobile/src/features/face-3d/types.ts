// v1 필수 5지표 — 파서가 전부 존재를 강제한다. 키 추가/제거 금지(스키마 v1 계약).
export const FACE_3D_REQUIRED_METRIC_KEYS = [
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
] as const;

// Tier-2 optional 지표(코 형태·광대) — g1 맵/구버전 프레임워크 프로필에는 없다.
// 있으면 파싱, 없으면 생략(프로필 전체 파싱 실패 아님).
// 계약: docs/face3d/TIER2_METRIC_CONTRACT.md
export const FACE_3D_OPTIONAL_METRIC_KEYS = [
  'noseLength',
  'nasalBridgeStraightness',
  'nasalAxisDeviation',
  'alarWidth',
  'malarProjectionLeft',
  'malarProjectionRight',
] as const;

export type Face3DRequiredMetricKey = (typeof FACE_3D_REQUIRED_METRIC_KEYS)[number];
export type Face3DOptionalMetricKey = (typeof FACE_3D_OPTIONAL_METRIC_KEYS)[number];
export type Face3DMetricKey = Face3DRequiredMetricKey | Face3DOptionalMetricKey;

// 사용자 노출 화이트리스트. Product-owner가 신규 실기기 반복성 수집을 면제했고,
// 승인된 G2 map을 17개 기존 ARFace export에서 11개 finite 값으로 오프라인 검증했다.
// optional 키는 구버전 G1 보고서에 없을 수 있으므로 그 카드만 생략한다.
export const FACE_3D_EXPOSED_METRIC_KEYS: readonly Face3DMetricKey[] = [
  ...FACE_3D_REQUIRED_METRIC_KEYS,
  ...FACE_3D_OPTIONAL_METRIC_KEYS,
];

export type Face3DStatus =
  | 'idle'
  | 'preparing'
  | 'tracking'
  | 'collecting'
  | 'completed'
  | 'blocked'
  | 'error';

export type Face3DMetric = {
  confidence: number;
  mad: number | null;
  unit: 'normalized';
  validFrameCount: number;
  value: number | null;
  // Internal validation only. Never render this field in a user-facing metric grid.
  valueMm?: number | null;
  valueMmConfidence?: number;
  valueMmMad?: number | null;
  valueMmValidFrameCount?: number;
};

// 필수 5지표는 전량 존재, Tier-2 는 있을 때만 존재하는 교차 타입.
export type Face3DMetrics = Record<Face3DRequiredMetricKey, Face3DMetric> &
  Partial<Record<Face3DOptionalMetricKey, Face3DMetric>>;

export type Face3DProfileV1 = {
  gateVersion: 'face3d-gate-v1';
  metrics: Face3DMetrics;
  schemaVersion: 'aura.face3d-profile.v1';
  source: 'arkit_face_mesh';
  targetFrameCount: number;
  topologyFingerprint: string;
  validFrameCount: number;
  warnings: string[];
};

export type Face3DSampleMode = 'micro_burst' | 'single_frame';

export type Face3DSensorProvenance = {
  depthDataObservedRatio: number | null;
  deviceModel: string | null;
  faceTrackingSupported: boolean | null;
  trueDepthHardware: boolean | null;
};

export type Face3DCalibrationReceipt = {
  appBuild: string;
  approvalArtifactSha256: string;
  captureNonce: string;
  collectionPolicyId: string;
  expiresAtUtc: string;
  gateVersion: 'face3d-gate-v2';
  issuedAtUtc: string;
  profileBindingSha256: string;
  receiptId: string;
  reportContextId: string;
  signature: string;
  signatureAlgorithm: 'hmac-sha256-v1';
  signingKeyId: string;
  subjectContextId: string;
};

export type Face3DProfileV2 = {
  aggregation: 'median_mad' | 'none';
  captureWindowMs: number;
  collectionPolicyId: string;
  completionRatio: number;
  confidenceCalibrationStatus: 'uncalibrated' | 'calibrated';
  gateVersion: 'face3d-gate-v2';
  metrics: Face3DMetrics;
  sampleMode: Face3DSampleMode;
  schemaVersion: 'aura.face3d-profile.v2';
  source: 'arkit_face_mesh';
  targetFrameCount: number;
  topologyFingerprint: string;
  validFrameCount: number;
  warnings: string[];
};

export type Face3DProfileV3 = {
  aggregation: 'median_mad' | 'none';
  calibrationReceipt: Face3DCalibrationReceipt | null;
  captureNonce: string;
  captureWindowMs: number;
  collectionPolicyId: string;
  completionRatio: number;
  confidenceCalibrationStatus: 'uncalibrated' | 'calibrated';
  gateVersion: 'face3d-gate-v2';
  metrics: Face3DMetrics;
  // Opaque server/tooling digest. Never recompute with JSON.stringify:
  // canonicalization recursively replaces every finite number (including
  // integers, with -0 normalized to 0) by
  // {$face3dNumber: fixed12_trimmed}, then key-sorts compact JSON before SHA-256.
  profileBindingSha256: string | null;
  sampleMode: Face3DSampleMode;
  schemaVersion: 'aura.face3d-profile.v3';
  // Added only by the backend after signature, binding, expiry, context, and
  // one-time receipt-consumption checks. Unity never emits "verified".
  serverCalibrationReceiptStatus?: string;
  sensorProvenance: Face3DSensorProvenance;
  source: 'arkit_face_mesh';
  targetFrameCount: number;
  topologyFingerprint: string;
  validFrameCount: number;
  warnings: string[];
};

export type Face3DProfile =
  | Face3DProfileV1
  | Face3DProfileV2
  | Face3DProfileV3;

export type Face3DStartRequest = {
  gateVersion: 'face3d-gate-v1';
  maximumDurationMs: number;
  minimumValidFrames: number;
  requestId: string;
  targetValidFrames: number;
};

export type Face3DStatusEvent = {
  currentMaximumFaceCount?: number;
  message?: string;
  meshIndexCount?: number;
  meshUvCount?: number;
  meshVertexCount?: number;
  requestId: string;
  sessionSequence?: number;
  status: Face3DStatus;
  supportedFaceCount?: number;
  targetFrameCount: number;
  topologyFingerprint?: string;
  type: 'face3d_status';
  validFrameCount: number;
  warnings: string[];
};

export type Face3DAnalyzedEvent = {
  profile: Face3DProfile;
  requestId: string;
  type: 'face3d_analyzed';
};

export type Face3DEvent = Face3DStatusEvent | Face3DAnalyzedEvent;

export type Face3DAnalysisState = {
  currentMaximumFaceCount?: number;
  message?: string;
  meshIndexCount?: number;
  meshUvCount?: number;
  meshVertexCount?: number;
  profile: Face3DProfile | null;
  requestId: string | null;
  status: Face3DStatus;
  supportedFaceCount?: number;
  targetFrameCount: number;
  topologyFingerprint?: string;
  validFrameCount: number;
  warnings: string[];
};
