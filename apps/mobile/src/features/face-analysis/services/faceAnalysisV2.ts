export type FaceAnalysisStageStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed';

export type FaceAnalysisStageState = {
  cacheHit: boolean;
  durationMs?: number | null;
  durationSource?: 'server_monotonic' | null;
  errorCode?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  providerCallCount?: number | null;
  runId?: string | null;
  status: FaceAnalysisStageStatus;
  totalTokens?: number | null;
  updatedAt?: string | null;
  validationRetryCount?: number | null;
};

export type FaceAnalysisPipelineState = {
  aiConsulting: FaceAnalysisStageState;
  aiMeasurement: FaceAnalysisStageState;
  aiPerception: FaceAnalysisStageState;
  overall: 'processing' | 'partial' | 'completed' | 'failed';
  retryRequestedStage?: 'ai_measurement' | 'ai_perception' | 'ai_consulting' | null;
};

export type FaceAnalysisMetricEnvelope = {
  confidence: number;
  derivedFrom: string[];
  reason?: string | null;
  sensitivity: 0 | 1 | 2 | 3;
  shots: Array<'S1' | 'FACE3D'>;
  source: 'landmark' | 'pixel' | 'depth' | 'ai';
  status: 'measured' | 'estimated' | 'unmeasured' | 'blocked';
  unit?: 'mm' | 'deg' | 'ratio' | 'lab' | 'score' | 'label' | null;
  value: unknown;
  warnings: string[];
};

export type FaceAnalysisInsight = {
  confidence: number;
  description: string;
  label: string;
  rationaleMetricKeys: string[];
  sensitivity: 0 | 1 | 2 | 3;
};

export type FaceAnalysisMeasurementInterpretation = {
  confidence: number;
  description: string;
  displayValue?: string | null;
  rationaleMetricKeys: string[];
  resultLabel: string;
  sensitivity: 0 | 1 | 2;
  title: string;
};

// perception 하위 인사이트는 sensitivity>=3이면 서버 응답 투영에서 개별
// 제거될 수 있어(app/api/analysis.py _project_internal_only_records) 전부
// optional — derived의 동일 패턴과 같은 이유다.
export type FaceAnalysisSkinInsights = {
  texture?: FaceAnalysisInsight;
  pores?: FaceAnalysisInsight;
  sebumDryness?: FaceAnalysisInsight;
  shineDistribution?: FaceAnalysisInsight;
  shineType?: FaceAnalysisInsight;
  pigmentation?: FaceAnalysisInsight;
  redness?: FaceAnalysisInsight;
  darkCircles?: FaceAnalysisInsight;
  toneUniformity?: FaceAnalysisInsight;
};

export type FaceAnalysisFeatureImpression = {
  eyeImpression?: FaceAnalysisInsight;
  eyelidWeight?: FaceAnalysisInsight;
  underEyeZone?: FaceAnalysisInsight;
  browImpression?: FaceAnalysisInsight;
  lipImpression?: FaceAnalysisInsight;
};

export type FaceAnalysisLinesAndPlanes = {
  lineShape?: FaceAnalysisInsight;
  lineWeight?: FaceAnalysisInsight;
  dimensionality?: FaceAnalysisInsight;
  contourDefinition?: FaceAnalysisInsight;
  noseShadowEffect?: FaceAnalysisInsight;
  noseCheekConnection?: FaceAnalysisInsight;
  lowerFaceImpression?: FaceAnalysisInsight;
  jawlineDefinition?: FaceAnalysisInsight;
};

export type FaceAnalysisGestaltPerception = {
  perceptualCenter?: FaceAnalysisInsight;
  featurePresenceRanking?: FaceAnalysisInsight;
  detailDensity?: FaceAnalysisInsight;
  negativeSpace?: FaceAnalysisInsight;
  centerVsOuter?: FaceAnalysisInsight;
  clarityVsSoftness?: FaceAnalysisInsight;
  overallMood?: FaceAnalysisInsight;
  standoutFeatures?: FaceAnalysisInsight[];
};

export type FaceAnalysisVolumePerception = {
  upperLowerDistribution?: FaceAnalysisInsight;
  visibleHollows?: FaceAnalysisInsight[];
  mouthCornerImpression?: FaceAnalysisInsight;
};

export type FaceAnalysisPersonalColorPerception = {
  status: 'provisional' | 'insufficient';
  season: string | null;
  subtype: string | null;
  borderTone: string | null;
  rationaleMetricKeys: string[];
};

export type FaceAnalysisImpressionAxis = {
  key: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
};

export type FaceAnalysisPerception = {
  skin: FaceAnalysisSkinInsights;
  featureImpression: FaceAnalysisFeatureImpression;
  linesAndPlanes: FaceAnalysisLinesAndPlanes;
  gestalt: FaceAnalysisGestaltPerception;
  volume: FaceAnalysisVolumePerception;
  personalColor: FaceAnalysisPersonalColorPerception;
  impressionAxes: FaceAnalysisImpressionAxis[];
};

// 서버 상세 응답 투영은 sensitivity>=3 insight(예: asymmetry)를 통째로 제거한다
// (analysis.py _project_internal_only_records) — 각 insight 는 부재할 수 있다.
export type FaceAnalysisDerivedResult = {
  asymmetry?: FaceAnalysisInsight;
  cheekboneAndEline?: FaceAnalysisInsight;
  colorAxes?: FaceAnalysisInsight;
  eyeBrow?: FaceAnalysisInsight;
  faceShape?: FaceAnalysisInsight;
  irisExposure?: FaceAnalysisInsight;
  nosePhiltrumLips?: FaceAnalysisInsight;
  rulesVersion: string;
  skinColor?: FaceAnalysisInsight;
  verticalBalance?: FaceAnalysisInsight;
  measurementInterpretations?: Record<string, FaceAnalysisMeasurementInterpretation>;
};

export type FaceAnalysisV2 = {
  aiMeasurements: Record<string, FaceAnalysisMetricEnvelope>;
  consulting?: Record<string, unknown> | null;
  coverage: {
    authoritativeKeys: string[];
    blockedKeys: Array<{key: string; reason: string}>;
    missingObservableKeys: string[];
    outOfScopeKeys: string[];
  };
  derived: FaceAnalysisDerivedResult;
  faceProfile: Record<string, FaceAnalysisMetricEnvelope>;
  perception?: FaceAnalysisPerception | null;
  pipeline: FaceAnalysisPipelineState;
  schemaVersion: 'aura-face-analysis-v2';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
  return value == null || (typeof value === 'number' && value >= 0);
}

function isStageState(value: unknown): value is FaceAnalysisStageState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ['pending', 'processing', 'completed', 'partial', 'failed'].includes(
      String(value.status),
    ) &&
    typeof value.cacheHit === 'boolean' &&
    isOptionalNonNegativeNumber(value.durationMs) &&
    (value.durationSource == null || value.durationSource === 'server_monotonic') &&
    isOptionalNonNegativeNumber(value.inputTokens) &&
    isOptionalNonNegativeNumber(value.outputTokens) &&
    isOptionalNonNegativeNumber(value.totalTokens) &&
    isOptionalNonNegativeNumber(value.providerCallCount) &&
    isOptionalNonNegativeNumber(value.validationRetryCount)
  );
}

function isMetric(value: unknown): value is FaceAnalysisMetricEnvelope {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.confidence === 'number' &&
    typeof value.sensitivity === 'number' &&
    isStringArray(value.shots) &&
    isStringArray(value.warnings) &&
    isStringArray(value.derivedFrom) &&
    ['landmark', 'pixel', 'depth', 'ai'].includes(String(value.source)) &&
    ['measured', 'estimated', 'unmeasured', 'blocked'].includes(String(value.status))
  );
}

function parseMetrics(value: unknown): Record<string, FaceAnalysisMetricEnvelope> | null {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(value);
  return entries.every(([, metric]) => isMetric(metric))
    ? Object.fromEntries(entries) as Record<string, FaceAnalysisMetricEnvelope>
    : null;
}

function isInsight(value: unknown): value is FaceAnalysisInsight {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.label === 'string' &&
    typeof value.description === 'string' &&
    typeof value.confidence === 'number' &&
    typeof value.sensitivity === 'number' &&
    isStringArray(value.rationaleMetricKeys)
  );
}

function isMeasurementInterpretation(
  value: unknown,
): value is FaceAnalysisMeasurementInterpretation {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.title === 'string' &&
    typeof value.resultLabel === 'string' &&
    typeof value.description === 'string' &&
    (value.displayValue == null || typeof value.displayValue === 'string') &&
    typeof value.confidence === 'number' &&
    typeof value.sensitivity === 'number' &&
    isStringArray(value.rationaleMetricKeys)
  );
}

function isMeasurementInterpretationMap(value: unknown): boolean {
  return (
    value == null ||
    (isRecord(value) && Object.values(value).every(isMeasurementInterpretation))
  );
}

const derivedInsightKeys = [
  'asymmetry',
  'cheekboneAndEline',
  'colorAxes',
  'eyeBrow',
  'faceShape',
  'irisExposure',
  'nosePhiltrumLips',
  'skinColor',
  'verticalBalance',
] as const;

export function parseFaceAnalysisV2(value: unknown): FaceAnalysisV2 | undefined {
  if (!isRecord(value) || value.schemaVersion !== 'aura-face-analysis-v2') {
    return undefined;
  }
  const coverage = value.coverage;
  const derived = value.derived;
  const pipeline = value.pipeline;
  const aiMeasurements = parseMetrics(value.aiMeasurements);
  const faceProfile = parseMetrics(value.faceProfile);
  if (
    !isRecord(coverage) ||
    !isStringArray(coverage.authoritativeKeys) ||
    !isStringArray(coverage.missingObservableKeys) ||
    !isStringArray(coverage.outOfScopeKeys) ||
    !Array.isArray(coverage.blockedKeys) ||
    !isRecord(derived) ||
    typeof derived.rulesVersion !== 'string' ||
    !derivedInsightKeys.every(key => derived[key] == null || isInsight(derived[key])) ||
    !isMeasurementInterpretationMap(derived.measurementInterpretations) ||
    !isRecord(pipeline) ||
    !isStageState(pipeline.aiMeasurement) ||
    !isStageState(pipeline.aiPerception) ||
    !isStageState(pipeline.aiConsulting) ||
    !['processing', 'partial', 'completed', 'failed'].includes(String(pipeline.overall)) ||
    !aiMeasurements ||
    !faceProfile
  ) {
    return undefined;
  }
  if (value.perception != null && !isRecord(value.perception)) {
    return undefined;
  }
  if (value.consulting != null && !isRecord(value.consulting)) {
    return undefined;
  }
  return value as FaceAnalysisV2;
}
