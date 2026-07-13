export const FACE_3D_METRIC_KEYS = [
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
] as const;

export type Face3DMetricKey = (typeof FACE_3D_METRIC_KEYS)[number];

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
};

export type Face3DMetrics = Record<Face3DMetricKey, Face3DMetric>;

export type Face3DProfile = {
  gateVersion: 'face3d-gate-v1';
  metrics: Face3DMetrics;
  schemaVersion: 'aura.face3d-profile.v1';
  source: 'arkit_face_mesh';
  targetFrameCount: number;
  topologyFingerprint: string;
  validFrameCount: number;
  warnings: string[];
};

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
