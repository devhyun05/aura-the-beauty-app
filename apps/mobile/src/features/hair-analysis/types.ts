export type HairJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'expired';

export type HairStyle = {
  bangs: string;
  catalogVersion: string;
  description: string;
  faceShapes: string[];
  length: string;
  name: string;
  previewUrl?: string | null;
  referenceUrl?: string | null;
  styleId: string;
  texture: string;
  transitionLengths: string[];
};

export type HairRecommendation = {
  reasons: string[];
  score: number;
  style: HairStyle;
  styleId: string;
};

export type HairAnalysisResult = {
  bangs: string;
  captureQuality?: {
    faceAndShouldersVisible?: boolean | null;
    frontFacing?: boolean | null;
    hatDetected?: boolean | null;
    personCount?: number | null;
  };
  confidence: number;
  currentColor: string;
  currentLength: string;
  faceShape: string;
  hairline: string;
  maskProvider?: string;
  part: string;
  recommendations: HairRecommendation[];
  schemaVersion: 'aura-hair-analysis-v1';
  summary: string;
  texture: string;
  volume: string;
};

export type HairAnalysisJob = {
  analysis: HairAnalysisResult | null;
  completedAt?: string | null;
  createdAt?: string | null;
  error?: {code?: string | null; message?: string | null} | null;
  expiresAt?: string | null;
  id: string;
  status: HairJobStatus;
};

export type HairSimulation = {
  analysisId: string;
  completedAt?: string | null;
  createdAt?: string | null;
  error?: {code?: string | null; message?: string | null} | null;
  expiresAt?: string | null;
  id: string;
  quality?: Record<string, unknown>;
  resultUrl?: string | null;
  resultUrlExpiresIn?: number | null;
  saved: boolean;
  status: HairJobStatus;
  style?: HairStyle | null;
  styleId: string;
};

export type HairMatteArtifacts = {
  hairMatteUri?: string;
  hairlineConfidence?: number;
  hairlinePosition?: {x: number; y: number};
  skinMatteUri?: string;
};
