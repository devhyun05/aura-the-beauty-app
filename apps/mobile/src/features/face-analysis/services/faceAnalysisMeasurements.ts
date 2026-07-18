// 측정 데이터 3-반영 규칙의 wire 계약 (RN 의존 없음 — 계약 러너로 단독 검증).
//
// requestPayload.measurements 로 서버 detail_payload 에 저장되고, 과거 보고서
// GET 의 detailPayload.request.measurements 에서 복원된다. 프롬프트에서 제외하지
// 않으므로 이 payload 전체가 AI 메타데이터에도 들어간다(측정 데이터에 대형 배열
// 없음 — worst-case 크기는 백엔드 pytest 가 상한 고정).
//
// decode 는 백엔드 응답 camelize(키만 변형: dL_skinHair→dLSkinHair,
// spring_light→springLight)를 견뎌야 한다 — 원형/변형 양형을 수용해 원 키로
// 역정규화한다. 저장(DB)과 프롬프트는 raw 키 그대로다.

import type {Face3DProfile} from '../../face-3d/types';
import {parseTrustedServerFace3DProfile} from '../../face-3d/services/face3DContract';
import type {
  FaceGeometryMetricKey,
  FaceGeometryMetricUnit,
  FaceGeometryResult,
  FaceGeometryStatus,
} from '../../face-geometry/types';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {RegionVisuals} from '../../face-geometry/services/faceGeometryCore/regionVisualsBuilder';
import type {
  FaceVerticalThirdsHairlineAnalysis,
  FaceVerticalThirdsMeasurementMode,
  FaceVerticalThirdsResult,
  FaceVerticalThirdsStatus,
  VerticalThirdsKeypoint,
  VerticalThirdsKeypointMap,
} from '../../face-ratio/types';
import {
  APPLE_HAIRLINE_FULL_CONFIDENCE,
  APPLE_HAIRLINE_MIN_CONFIDENCE,
} from '../../face-ratio/constants';
import {isActualHairlineProvider} from '../../face-ratio/services/faceVerticalThirdsHairlineSelection';
import type {
  AuraAxis,
  AuraPersonalColorResult,
  AuraRegionMeasurement,
  AxisName,
  PersonalColor12Type,
  PersonalColorStatus,
  ToneResult,
} from '../../personal-color/services/personalColorCore/contracts';
import {TYPE_LABEL_KO, TYPE_TO_SEASON} from '../../personal-color/services/personalColorCore/constants';
import type {
  ChannelGains,
  IlluminationCorrectionReport,
} from '../../personal-color/services/personalColorCore/illuminationCorrection';
import type {PersonalColorCorrectionStatus} from '../../personal-color/types';

export const FACE_ANALYSIS_MEASUREMENTS_SCHEMA_VERSION =
  'aura-face-analysis-measurements-v1' as const;

// 서버 저장·복원분은 privacy 필드를 갖지 않는다 — 서버에 저장된 데이터에
// local-only 상수를 재부착하면 자기모순이므로 화면 전용 뷰 타입으로 분리한다.
export type MeasuredPersonalColorView = Omit<AuraPersonalColorResult, 'privacy'>;

export type FaceAnalysisMeasurementsPersonalColor = {
  correctionReport: IlluminationCorrectionReport | null;
  correctionStatus: PersonalColorCorrectionStatus;
  reported: MeasuredPersonalColorView;
};

export type FaceAnalysisReportMeasurements = {
  captureId: string;
  face3d?: Face3DProfile;
  faceGeometry2d?: FaceGeometryResult;
  faceVerticalThirds?: FaceVerticalThirdsResult;
  personalColor?: FaceAnalysisMeasurementsPersonalColor;
  // faceGeometry2d.regionVisuals 에서 lift 된 top-level 사본(중복 저장 방지 —
  // encode 가 nested 에서는 제거한다). 구버전 저장분엔 없으므로 optional.
  regionVisuals?: RegionVisuals;
  schemaVersion: typeof FACE_ANALYSIS_MEASUREMENTS_SCHEMA_VERSION;
};

// analyzePersonalColorCapture outcome 과 구조 호환(직접 import 하면 RN 의존이
// 계약 러너 컴파일로 딸려 들어와 구조 타입으로 분리).
export type PersonalColorMeasurementInput = {
  corrected: unknown;
  correctionReport: IlluminationCorrectionReport;
  reported: AuraPersonalColorResult;
};

export function derivePersonalColorCorrectionStatus(
  outcome: Pick<PersonalColorMeasurementInput, 'corrected' | 'correctionReport'>,
): PersonalColorCorrectionStatus {
  const report = outcome.correctionReport;

  return {
    applied: Boolean(outcome.corrected),
    reasons: [
      ...report.reasons,
      ...report.sclera.reasons,
      ...report.wb.reasons,
    ],
  };
}

// ── encode ───────────────────────────────────────────────────────────────────

export type BuildFaceAnalysisMeasurementsInput = {
  captureId: string;
  face3d: Face3DProfile | null;
  faceGeometry2d: FaceGeometryResult | null;
  faceVerticalThirds: FaceVerticalThirdsResult | null;
  personalColor: PersonalColorMeasurementInput | null;
};

// 원본에서 서버에 무의미·부적절한 필드만 뺀다: artifacts(로컬 file:// 경로),
// sourceImage.uri(로컬 경로 — width/height 는 오버레이 좌표 변환용으로 유지),
// privacy(기기 계약 마커). blocked/failed 결과도 statusReason 렌더용으로 저장한다.
export function buildFaceAnalysisMeasurementsPayload(
  input: BuildFaceAnalysisMeasurementsInput,
): Record<string, unknown> | undefined {
  const faceVerticalThirds = input.faceVerticalThirds
    ? encodeVerticalThirds(input.faceVerticalThirds)
    : undefined;
  const faceGeometry2d = input.faceGeometry2d
    ? encodeFaceGeometry(input.faceGeometry2d)
    : undefined;
  const personalColor = input.personalColor
    ? encodePersonalColor(input.personalColor)
    : undefined;
  // faceGeometry2d 에 실려온 화면 렌더용 파생 기하를 top-level 로 lift —
  // encodeFaceGeometry 가 nested 사본은 이미 제거했으므로 중복 저장 없음.
  const regionVisuals = encodeRegionVisuals(input.faceGeometry2d?.regionVisuals);

  if (!faceVerticalThirds && !faceGeometry2d && !personalColor && !input.face3d) {
    return undefined;
  }

  return {
    captureId: input.captureId,
    schemaVersion: FACE_ANALYSIS_MEASUREMENTS_SCHEMA_VERSION,
    ...(faceVerticalThirds ? {faceVerticalThirds} : {}),
    ...(input.face3d ? {face3d: input.face3d} : {}),
    ...(faceGeometry2d ? {faceGeometry2d} : {}),
    ...(personalColor ? {personalColor} : {}),
    ...(regionVisuals ? {regionVisuals} : {}),
  };
}

function encodeVerticalThirds(
  result: FaceVerticalThirdsResult,
): Record<string, unknown> | undefined {
  // Phase 1 행렬 보정은 paired replay MAD+MAE 관문 전까지 로컬 검증 전용이다.
  // 보정된 비율뿐 아니라 진단 메타데이터도 product/AI 저장 경로로 승격하지 않는다.
  if (
    result.postCorrection?.poseNormalization?.confidencePolicy ===
    'diagnostic_only_unvalidated'
  ) {
    return undefined;
  }

  const {artifacts: _artifacts, sourceImage, ...rest} = result;

  return {
    ...rest,
    sourceImage: {height: sourceImage.height, width: sourceImage.width},
  };
}

// regionVisuals 는 buildFaceAnalysisMeasurementsPayload 가 top-level 로 lift 하므로
// nested 사본은 여기서 뺀다(중복 저장 방지).
function encodeFaceGeometry(result: FaceGeometryResult): Record<string, unknown> {
  const {regionVisuals: _regionVisuals, sourceImage, ...rest} = result;

  return {
    ...rest,
    sourceImage: {height: sourceImage.height, width: sourceImage.width},
  };
}

function encodeRegionVisuals(rv: RegionVisuals | undefined): RegionVisuals | undefined {
  return rv && Object.keys(rv).length > 0 ? rv : undefined;
}

function encodePersonalColor(
  input: PersonalColorMeasurementInput,
): Record<string, unknown> {
  const {privacy: _privacy, ...reported} = input.reported;

  return {
    correctionReport: input.correctionReport,
    correctionStatus: derivePersonalColorCorrectionStatus(input),
    reported,
  };
}

// ── AI 요약층: measuredPersonalColor ─────────────────────────────────────────

const RELATION_KEYS = [
  'dL_skinHair',
  'dL_skinLip',
  'dE00_skinHair',
  'dE00_skinLip',
] as const;

const AXIS_NAMES: readonly AxisName[] = [
  'temperature',
  'value',
  'chroma',
  'clarity',
  'contrast',
];

export type MeasuredPersonalColorAiPayload = {
  axes: Record<AxisName, {confidence: number; value: number | null}>;
  calibrationApplied: boolean;
  correction: {
    applied: boolean;
    capped: boolean;
    confidence: number;
    gains: ChannelGains | null;
    reasons: string[];
    scleraSummary: {
      eyesUsed: number;
      leftRightAgreement: number | null;
      measuredLab: {L: number; a: number; b: number} | null;
      sampleCount: number;
    };
    source: string;
    strength: number;
    wbRatio: {bg: number | null; rg: number | null};
  };
  measurementConfidence: number;
  regions: Array<{
    areaRatio: number;
    lab: {L: number; a: number; b: number};
    lch: {C: number; h: number};
    qEff: number;
    region: string;
    warnings: string[];
  }>;
  // camelize-안전 서술명 — dL_/dE00_ 키는 응답 경로에서 변형되므로 쓰지 않는다.
  relations: {
    skinHairColorDelta: number | null;
    skinHairLightnessDelta: number | null;
    skinLipColorDelta: number | null;
    skinLipLightnessDelta: number | null;
  };
  status: PersonalColorStatus;
  tone: {
    distances: Record<string, number>;
    gap: number;
    isMixed: boolean;
    probabilities: Record<string, number>;
    season: string;
    seasonScore: number;
    secondary: string | null;
    top: string;
    typeScore: number;
  } | null;
  warnings: string[];
};

export function buildMeasuredPersonalColorAiPayload(
  input: PersonalColorMeasurementInput | null,
): MeasuredPersonalColorAiPayload | undefined {
  if (!input) {
    return undefined;
  }

  const reported = input.reported;
  const report = input.correctionReport;
  const axes = {} as MeasuredPersonalColorAiPayload['axes'];

  for (const axis of AXIS_NAMES) {
    const value = reported.axes[axis];
    axes[axis] = {confidence: value.confidence, value: value.value};
  }

  return {
    axes,
    calibrationApplied: reported.calibrationApplied,
    correction: {
      applied: Boolean(input.corrected),
      capped: report.capped,
      confidence: report.confidence,
      gains: report.gains,
      reasons: derivePersonalColorCorrectionStatus(input).reasons,
      scleraSummary: {
        eyesUsed: report.sclera.eyesUsed,
        leftRightAgreement: report.sclera.leftRightAgreement,
        measuredLab: report.sclera.measuredLab,
        sampleCount: report.sclera.sampleCount,
      },
      source: report.source,
      strength: report.strength,
      wbRatio: {bg: report.wb.bg, rg: report.wb.rg},
    },
    measurementConfidence: reported.measurementConfidence,
    regions: reported.regions.map(region => ({
      areaRatio: region.areaRatio,
      lab: region.lab,
      lch: region.lch,
      qEff: region.qEff,
      region: region.region,
      warnings: region.warnings,
    })),
    relations: {
      skinHairColorDelta: reported.relations.dE00_skinHair,
      skinHairLightnessDelta: reported.relations.dL_skinHair,
      skinLipColorDelta: reported.relations.dE00_skinLip,
      skinLipLightnessDelta: reported.relations.dL_skinLip,
    },
    status: reported.status,
    tone: reported.tone
      ? {
          distances: reported.tone.distances,
          gap: reported.tone.gap,
          isMixed: reported.tone.isMixed,
          probabilities: reported.tone.probabilities,
          season: reported.tone.season,
          seasonScore: reported.tone.seasonScore,
          secondary: reported.tone.secondary,
          top: reported.tone.top,
          typeScore: reported.tone.typeScore,
        }
      : null,
    warnings: reported.warnings,
  };
}

// ── decode (camelize 내성) ───────────────────────────────────────────────────

// 백엔드 to_camel(casing.py) 파리티: '_' 분할 후 첫 파트는 그대로, 이후 파트는
// 첫 글자만 대문자(내부 대소문자 보존) — dL_skinHair → dLSkinHair.
export function toBackendCamelKey(key: string): string {
  const parts = key.split('_');

  return (
    parts[0] +
    parts
      .slice(1)
      .map(part => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
      .join('')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readKeyVariant(record: Record<string, unknown>, key: string): unknown {
  if (key in record) {
    return record[key];
  }

  return record[toBackendCamelKey(key)];
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNullableFiniteNumber(value: unknown): number | null {
  return readFiniteNumber(value) ?? null;
}

const FACE_LENGTH_VERDICTS = new Set([
  'wide',
  'borderline_wide',
  'average',
  'borderline_long',
  'long',
  'indeterminate',
]);

// 판정 스냅샷 복원(Phase 0-5). verdict가 알려진 값이 아니면(미래 버전의
// 신규 verdict 등) 스냅샷 전체를 버리고 화면 폴백(재판정)에 맡긴다.
function decodeFaceLengthJudgment(
  value: unknown,
): FaceVerticalThirdsResult['faceLengthJudgment'] {
  if (!isRecord(value)) {
    return undefined;
  }
  const band = isRecord(value.band) ? value.band : undefined;
  const hi = readFiniteNumber(band?.hi);
  const lo = readFiniteNumber(band?.lo);
  const verdict = readString(value.verdict);

  if (hi === undefined || lo === undefined || verdict === undefined) {
    return undefined;
  }
  if (!FACE_LENGTH_VERDICTS.has(verdict)) {
    return undefined;
  }

  return {
    band: {hi, lo},
    verdict: verdict as NonNullable<
      FaceVerticalThirdsResult['faceLengthJudgment']
    >['verdict'],
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

const VERTICAL_THIRDS_POST_CORRECTION_METHODS = new Set<
  NonNullable<FaceVerticalThirdsResult['postCorrection']>['method']
>([
  'mediapipe_facial_transformation_matrix',
  'mediapipe_pose_roll',
  'none',
]);

const VERTICAL_THIRDS_POST_CORRECTION_SKIP_REASONS = new Set<
  NonNullable<
    NonNullable<FaceVerticalThirdsResult['postCorrection']>['skippedReason']
  >
>([
  'disabled',
  'dimension_invalid',
  'landmark_count_invalid',
  'landmark_value_invalid',
  'matrix_missing',
  'matrix_value_invalid',
  'matrix_singular',
  'matrix_reflection',
  'roll_unavailable',
  'roll_out_of_range',
]);

function decodeVerticalThirdsPoseNormalization(
  value: unknown,
): NonNullable<
  NonNullable<FaceVerticalThirdsResult['postCorrection']>['poseNormalization']
> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const confidencePolicy = readString(value.confidencePolicy);
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : undefined;
  const landmarkCount = readFiniteNumber(diagnostics?.landmarkCount);
  const requested =
    typeof value.requested === 'boolean' ? value.requested : undefined;

  if (
    confidencePolicy !== 'diagnostic_only_unvalidated' ||
    !diagnostics ||
    landmarkCount === undefined ||
    !Number.isInteger(landmarkCount) ||
    landmarkCount < 0 ||
    requested === undefined
  ) {
    return undefined;
  }

  return {
    confidencePolicy,
    diagnostics: {
      correctionMaxPx: readNullableFiniteNumber(diagnostics.correctionMaxPx),
      correctionRmsPx: readNullableFiniteNumber(diagnostics.correctionRmsPx),
      landmarkCount,
      matrixOrthogonalityResidual: readNullableFiniteNumber(
        diagnostics.matrixOrthogonalityResidual,
      ),
      matrixRotationDeterminant: readNullableFiniteNumber(
        diagnostics.matrixRotationDeterminant,
      ),
      matrixScaleSpread: readNullableFiniteNumber(diagnostics.matrixScaleSpread),
      roundTripRmsPx: readNullableFiniteNumber(diagnostics.roundTripRmsPx),
      zSpanPx: readNullableFiniteNumber(diagnostics.zSpanPx),
    },
    requested,
  };
}

const PERSONAL_COLOR_TYPE_KEYS = Object.keys(TYPE_LABEL_KO) as PersonalColor12Type[];

// camelize 가 Record 키(spring_light→springLight)를 바꾼 응답을 원 키로 복원한다.
function readTypeKeyedRecord(
  value: unknown,
): Record<PersonalColor12Type, number> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const restored = {} as Record<PersonalColor12Type, number>;

  for (const key of PERSONAL_COLOR_TYPE_KEYS) {
    const entry = readFiniteNumber(readKeyVariant(value, key));

    if (entry === undefined) {
      return undefined;
    }

    restored[key] = entry;
  }

  return restored;
}

function readPersonalColorType(value: unknown): PersonalColor12Type | undefined {
  return typeof value === 'string' &&
    (PERSONAL_COLOR_TYPE_KEYS as string[]).includes(value)
    ? (value as PersonalColor12Type)
    : undefined;
}

// ── decode: 세로비율 ─────────────────────────────────────────────────────────

const VERTICAL_THIRDS_STATUSES: readonly FaceVerticalThirdsStatus[] = [
  'full_success',
  'partial_success',
  'blocked',
  'failed',
];

const VERTICAL_THIRDS_MEASUREMENT_MODES: readonly FaceVerticalThirdsMeasurementMode[] = [
  'full_vertical_thirds',
  'middle_lower_only',
];

function readVerticalThirdsKeypoint(value: unknown): VerticalThirdsKeypoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);

  if (x === undefined || y === undefined) {
    return null;
  }

  return {
    confidence: readFiniteNumber(value.confidence) ?? 0,
    method: readString(value.method) ?? '',
    provider: (readString(value.provider) ??
      'mediapipe') as VerticalThirdsKeypoint['provider'],
    x,
    y,
  };
}

function resolveVerticalThirdsHairlinePolicy({
  explicitAnalysis,
  explicitMode,
  keypoints,
  status,
}: {
  explicitAnalysis: Record<string, unknown> | undefined;
  explicitMode: FaceVerticalThirdsMeasurementMode | undefined;
  keypoints: VerticalThirdsKeypointMap;
  status: FaceVerticalThirdsStatus;
}): {
  hairlineAnalysis: FaceVerticalThirdsHairlineAnalysis;
  measurementMode: FaceVerticalThirdsMeasurementMode;
} {
  const hairline = keypoints.H;
  const validActualHairline = Boolean(
    hairline &&
      keypoints.G &&
      hairline.y < keypoints.G.y &&
      hairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE &&
      isActualHairlineProvider(hairline.provider),
  );
  const explicitEligible =
    explicitMode === 'full_vertical_thirds' &&
    explicitAnalysis?.analysisEligible === true &&
    validActualHairline;
  // 필드가 없는 과거 full_success Apple 결과만 안전하게 복원한다. 과거 partial,
  // idx-10 proxy, 알 수 없는 provider는 축 자체를 버리지 않고 2구간으로 강등한다.
  const legacyEligible =
    explicitMode === undefined &&
    explicitAnalysis === undefined &&
    status === 'full_success' &&
    validActualHairline;
  const analysisEligible = explicitEligible || legacyEligible;
  const hasLowConfidenceActualHairline = Boolean(
    hairline &&
      keypoints.G &&
      hairline.y < keypoints.G.y &&
      hairline.confidence >= APPLE_HAIRLINE_MIN_CONFIDENCE &&
      isActualHairlineProvider(hairline.provider),
  );

  return {
    hairlineAnalysis: analysisEligible
      ? {
          analysisEligible: true,
          confidence: hairline?.confidence ?? null,
          outcome: 'detected_high_confidence',
          provider: hairline?.provider ?? null,
        }
      : hasLowConfidenceActualHairline
        ? {
            analysisEligible: false,
            confidence: hairline?.confidence ?? null,
            outcome: 'detected_low_confidence',
            provider: hairline?.provider ?? null,
          }
        : {
            analysisEligible: false,
            confidence: null,
            outcome: 'omitted',
            provider: null,
          },
    measurementMode: analysisEligible
      ? 'full_vertical_thirds'
      : 'middle_lower_only',
  };
}

function decodeVerticalThirds(
  value: unknown,
  imageUrl: string,
): FaceVerticalThirdsResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status = readString(value.status) as FaceVerticalThirdsStatus | undefined;

  if (!status || !VERTICAL_THIRDS_STATUSES.includes(status)) {
    return undefined;
  }

  const sourceImage = isRecord(value.sourceImage) ? value.sourceImage : undefined;
  const width = readFiniteNumber(sourceImage?.width);
  const height = readFiniteNumber(sourceImage?.height);

  if (width === undefined || height === undefined) {
    return undefined;
  }

  const keypointsRecord = isRecord(value.keypoints) ? value.keypoints : {};
  const keypoints: VerticalThirdsKeypointMap = {
    G: readVerticalThirdsKeypoint(keypointsRecord.G),
    H: readVerticalThirdsKeypoint(keypointsRecord.H),
    Me: readVerticalThirdsKeypoint(keypointsRecord.Me),
    Sn: readVerticalThirdsKeypoint(keypointsRecord.Sn),
  };
  const explicitMeasurementMode = readString(value.measurementMode) as
    | FaceVerticalThirdsMeasurementMode
    | undefined;
  const validExplicitMeasurementMode =
    explicitMeasurementMode &&
    VERTICAL_THIRDS_MEASUREMENT_MODES.includes(explicitMeasurementMode)
      ? explicitMeasurementMode
      : undefined;
  const explicitHairlineAnalysis = isRecord(value.hairlineAnalysis)
    ? value.hairlineAnalysis
    : undefined;
  const {hairlineAnalysis, measurementMode} = resolveVerticalThirdsHairlinePolicy({
    explicitAnalysis: explicitHairlineAnalysis,
    explicitMode: validExplicitMeasurementMode,
    keypoints,
    status,
  });

  const interpretationRecord = isRecord(value.interpretation)
    ? value.interpretation
    : {};
  const qualityRecord = isRecord(value.quality) ? value.quality : {};

  let verticalThirds: FaceVerticalThirdsResult['verticalThirds'];

  if (isRecord(value.verticalThirds)) {
    const ratio = value.verticalThirds;
    const displayRatio = isRecord(ratio.displayRatio) ? ratio.displayRatio : undefined;
    const lower = readFiniteNumber(displayRatio?.lower);
    const lowerPx = readFiniteNumber(ratio.lowerPx);
    const middlePx = readFiniteNumber(ratio.middlePx);

    if (lower === undefined || lowerPx === undefined || middlePx === undefined) {
      return undefined;
    }

    verticalThirds = {
      confidence:
        measurementMode === 'middle_lower_only'
          ? Math.min(
              keypoints.G?.confidence ?? 0,
              keypoints.Sn?.confidence ?? 0,
              keypoints.Me?.confidence ?? 0,
            )
          : (readFiniteNumber(ratio.confidence) ?? 0),
      displayRatio: {
        lower,
        middle: 1.0,
        upper:
          measurementMode === 'full_vertical_thirds'
            ? readNullableFiniteNumber(displayRatio?.upper)
            : null,
      },
      lowerNormalized:
        measurementMode === 'full_vertical_thirds'
          ? readNullableFiniteNumber(ratio.lowerNormalized)
          : null,
      lowerPx,
      middleNormalized:
        measurementMode === 'full_vertical_thirds'
          ? readNullableFiniteNumber(ratio.middleNormalized)
          : null,
      middlePx,
      totalPx:
        measurementMode === 'full_vertical_thirds'
          ? readNullableFiniteNumber(ratio.totalPx)
          : null,
      upperNormalized:
        measurementMode === 'full_vertical_thirds'
          ? readNullableFiniteNumber(ratio.upperNormalized)
          : null,
      upperPx:
        measurementMode === 'full_vertical_thirds'
          ? readNullableFiniteNumber(ratio.upperPx)
          : null,
      warnings: readStringArray(ratio.warnings),
    };
  } else if (status === 'full_success' || status === 'partial_success') {
    // 성공 상태인데 비율이 깨졌으면 화면 오버레이 분기가 크래시하므로 축 전체 drop.
    return undefined;
  }

  const resolvedMeasurementMode: FaceVerticalThirdsMeasurementMode =
    measurementMode === 'full_vertical_thirds' &&
    verticalThirds?.displayRatio.upper !== null &&
    verticalThirds?.displayRatio.upper !== undefined &&
    verticalThirds?.upperPx !== null &&
    verticalThirds?.upperPx !== undefined
      ? 'full_vertical_thirds'
      : 'middle_lower_only';
  if (verticalThirds && resolvedMeasurementMode === 'middle_lower_only') {
    verticalThirds = {
      ...verticalThirds,
      confidence: Math.min(
        keypoints.G?.confidence ?? 0,
        keypoints.Sn?.confidence ?? 0,
        keypoints.Me?.confidence ?? 0,
      ),
      displayRatio: {...verticalThirds.displayRatio, upper: null},
      lowerNormalized: null,
      middleNormalized: null,
      totalPx: null,
      upperNormalized: null,
      upperPx: null,
    };
  }
  const resolvedHairlineAnalysis: FaceVerticalThirdsHairlineAnalysis =
    resolvedMeasurementMode === 'full_vertical_thirds'
      ? hairlineAnalysis
      : hairlineAnalysis.analysisEligible
        ? {
            ...hairlineAnalysis,
            analysisEligible: false,
            outcome: 'detected_low_confidence',
          }
        : hairlineAnalysis;

  const faceLengthRecord = isRecord(value.faceLength) ? value.faceLength : undefined;
  const faceLengthHeight = readFiniteNumber(faceLengthRecord?.heightPx);
  const faceLengthRatio = readFiniteNumber(faceLengthRecord?.ratio);
  const faceLengthWidth = readFiniteNumber(faceLengthRecord?.widthPx);
  const postCorrectionRecord = isRecord(value.postCorrection)
    ? value.postCorrection
    : undefined;
  const postCorrectionCenter = isRecord(postCorrectionRecord?.center)
    ? postCorrectionRecord.center
    : undefined;
  const postCorrectionCenterX = readFiniteNumber(postCorrectionCenter?.x);
  const postCorrectionCenterY = readFiniteNumber(postCorrectionCenter?.y);
  const postCorrectionMethod = readString(postCorrectionRecord?.method);
  const postCorrectionSkippedReason = readString(
    postCorrectionRecord?.skippedReason,
  );

  const decodedStatus =
    (status === 'full_success' || status === 'partial_success') &&
    resolvedMeasurementMode === 'middle_lower_only'
      ? 'partial_success'
      : status;

  return {
    artifacts: {},
    captureId: readString(value.captureId) ?? '',
    createdAt: readString(value.createdAt) ?? '',
    hairlineAnalysis: resolvedHairlineAnalysis,
    faceLength:
      resolvedMeasurementMode === 'full_vertical_thirds' &&
      faceLengthHeight !== undefined &&
      faceLengthRatio !== undefined &&
      faceLengthWidth !== undefined
        ? {heightPx: faceLengthHeight, ratio: faceLengthRatio, widthPx: faceLengthWidth}
        : undefined,
    interpretation: {
      dominantPart:
        resolvedMeasurementMode === 'full_vertical_thirds'
          ? (readString(interpretationRecord.dominantPart) as
              | FaceVerticalThirdsResult['interpretation']['dominantPart']
              | undefined)
          : 'unknown',
      summary:
        resolvedMeasurementMode === 'full_vertical_thirds'
          ? (readString(interpretationRecord.summary) ?? '')
          : '헤어라인이 충분히 확인되지 않아 중안부와 하안부만 반영했어요.',
      title: readString(interpretationRecord.title) ?? '',
    },
    // 판정 스냅샷(Phase 0-5) — 구 저장분에는 없으므로 optional 복원.
    faceLengthJudgment: decodeFaceLengthJudgment(value.faceLengthJudgment),
    judgmentVersion: readString(value.judgmentVersion),
    keypoints,
    measurementMode: resolvedMeasurementMode,
    postCorrection: postCorrectionRecord
      ? {
          applied: readBoolean(postCorrectionRecord.applied, false),
          center:
            postCorrectionCenterX !== undefined &&
            postCorrectionCenterY !== undefined
              ? {x: postCorrectionCenterX, y: postCorrectionCenterY}
              : null,
          method:
            postCorrectionMethod &&
            VERTICAL_THIRDS_POST_CORRECTION_METHODS.has(
              postCorrectionMethod as NonNullable<
                FaceVerticalThirdsResult['postCorrection']
              >['method'],
            )
              ? (postCorrectionMethod as NonNullable<
                  FaceVerticalThirdsResult['postCorrection']
                >['method'])
              : 'none',
          poseNormalization: decodeVerticalThirdsPoseNormalization(
            postCorrectionRecord.poseNormalization,
          ),
          rollCorrectionDeg: readNullableFiniteNumber(
            postCorrectionRecord.rollCorrectionDeg,
          ),
          skippedReason:
            postCorrectionSkippedReason &&
            VERTICAL_THIRDS_POST_CORRECTION_SKIP_REASONS.has(
              postCorrectionSkippedReason as NonNullable<
                NonNullable<
                  FaceVerticalThirdsResult['postCorrection']
                >['skippedReason']
              >,
            )
              ? (postCorrectionSkippedReason as NonNullable<
                  NonNullable<
                    FaceVerticalThirdsResult['postCorrection']
                  >['skippedReason']
                >)
              : undefined,
        }
      : undefined,
    quality: {
      pitch: readFiniteNumber(qualityRecord.pitch),
      roll: readFiniteNumber(qualityRecord.roll),
      usable: readBoolean(qualityRecord.usable, false),
      warnings: readStringArray(qualityRecord.warnings),
      yaw: readFiniteNumber(qualityRecord.yaw),
    },
    schemaVersion: 'aura-face-vertical-thirds-v1',
    sessionId: readString(value.sessionId) ?? '',
    sourceImage: {height, uri: imageUrl, width},
    status: decodedStatus,
    statusReason: readString(value.statusReason),
    verticalThirds,
  };
}

// ── decode: 2D 기하 ──────────────────────────────────────────────────────────

const FACE_GEOMETRY_STATUSES: readonly FaceGeometryStatus[] = [
  'full_success',
  'partial_success',
  'blocked',
  'failed',
];

function inferGeometryUnit(key: FaceGeometryMetricKey): FaceGeometryMetricUnit {
  return key.endsWith('Deg') ? 'deg' : 'ratio';
}

function decodeFaceGeometry(value: unknown): FaceGeometryResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status = readString(value.status) as FaceGeometryStatus | undefined;

  if (!status || !FACE_GEOMETRY_STATUSES.includes(status)) {
    return undefined;
  }

  const metricsRecord = isRecord(value.metrics) ? value.metrics : {};
  const metrics = {} as FaceGeometryResult['metrics'];

  // 화면이 metrics[key].value 를 직접 dereference 하므로 16키를 항상 채운다 —
  // 누락 키는 측정 불가로 간주(구버전·부분 손상 응답 방어).
  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    const metricRecord = isRecord(metricsRecord[key]) ? metricsRecord[key] : undefined;
    const unit = readString(metricRecord?.unit);

    metrics[key] = {
      unit: unit === 'deg' || unit === 'ratio' ? unit : inferGeometryUnit(key),
      value: readNullableFiniteNumber(metricRecord?.value),
      warnings: readStringArray(metricRecord?.warnings),
    };
  }

  const poseRecord = isRecord(value.pose) ? value.pose : undefined;
  const pitchDeg = readFiniteNumber(poseRecord?.pitchDeg);
  const rollDeg = readFiniteNumber(poseRecord?.rollDeg);
  const yawDeg = readFiniteNumber(poseRecord?.yawDeg);
  const rollCorrectionRecord = isRecord(value.rollCorrection)
    ? value.rollCorrection
    : undefined;
  const sourceImage = isRecord(value.sourceImage) ? value.sourceImage : undefined;

  return {
    captureId: readString(value.captureId) ?? '',
    createdAt: readString(value.createdAt) ?? '',
    metrics,
    pose:
      pitchDeg !== undefined && rollDeg !== undefined && yawDeg !== undefined
        ? {pitchDeg, rollDeg, yawDeg}
        : null,
    rollCorrection: {
      applied: readBoolean(rollCorrectionRecord?.applied, false),
      rollCorrectionDeg: readNullableFiniteNumber(
        rollCorrectionRecord?.rollCorrectionDeg,
      ),
      skippedReason: readString(rollCorrectionRecord?.skippedReason) as
        | 'dimension_invalid'
        | 'roll_out_of_range'
        | 'roll_unavailable'
        | undefined,
    },
    schemaVersion: 'aura-face-geometry-v1',
    sessionId: readString(value.sessionId) ?? '',
    sourceImage: {
      height: readFiniteNumber(sourceImage?.height) ?? 0,
      uri: '',
      width: readFiniteNumber(sourceImage?.width) ?? 0,
    },
    status,
    statusReason: readString(value.statusReason),
  };
}

// ── decode: 부위별 시각 가이드(top-level lift) ───────────────────────────────

const REGION_VISUAL_KEYS = ['upper', 'mid', 'lower', 'jaw'] as const;

function decodeRegionVisuals(value: unknown): RegionVisuals | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: RegionVisuals = {};

  for (const key of REGION_VISUAL_KEYS) {
    const r = value[key];
    if (!isRecord(r) || !isRecord(r.cropRect) || !isRecord(r.guide)) {
      continue;
    }

    const cr = r.cropRect;
    const g = r.guide;
    const rawPoints = Array.isArray(g.points) ? g.points : [];
    const points = rawPoints
      .filter(isRecord)
      .map(p => ({x: readFiniteNumber(p.x), y: readFiniteNumber(p.y)}))
      .filter((p): p is {x: number; y: number} => p.x !== undefined && p.y !== undefined);

    // 가이드 선/박스를 구성할 최소치(2점) 미만이면 그 부위는 통째로 drop.
    if (points.length < 2) {
      continue;
    }

    out[key] = {
      cropRect: {
        x: readFiniteNumber(cr.x) ?? 0,
        y: readFiniteNumber(cr.y) ?? 0,
        w: readFiniteNumber(cr.w) ?? 0,
        h: readFiniteNumber(cr.h) ?? 0,
      },
      guide: {points, label: typeof g.label === 'string' ? g.label : ''},
    };
  }

  return Object.keys(out).length ? out : undefined;
}

// ── decode: 퍼스널 컬러 ──────────────────────────────────────────────────────

const PERSONAL_COLOR_STATUSES: readonly PersonalColorStatus[] = [
  'definitive',
  'mixed',
  'provisional',
  'insufficient',
];

function decodeTone(value: unknown): ToneResult | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const top = readPersonalColorType(value.top);
  const probabilities = readTypeKeyedRecord(value.probabilities);
  const distances = readTypeKeyedRecord(value.distances);
  const typeScore = readFiniteNumber(value.typeScore);
  const gap = readFiniteNumber(value.gap);

  if (!top || !probabilities || !distances || typeScore === undefined || gap === undefined) {
    return undefined;
  }

  // F8: season 폴백은 top 에서 유도한다 — 종전 '?? spring' 하드코딩은 top 이 여름/가을/
  // 겨울이어도 season 을 봄으로 날조했다(legacy 저장분 복원 시 자기모순).
  const season = (readString(value.season) ?? TYPE_TO_SEASON[top]) as ToneResult['season'];
  // F7: seasonScore 부재(legacy)면 probabilities 에서 유도한다(같은 시즌 확률 합). 날조 아님.
  const seasonScore =
    readFiniteNumber(value.seasonScore) ??
    PERSONAL_COLOR_TYPE_KEYS.reduce(
      (acc, t) => (TYPE_TO_SEASON[t] === season ? acc + probabilities[t] : acc),
      0,
    );

  return {
    distances,
    gap,
    isMixed: readBoolean(value.isMixed, false),
    probabilities,
    season,
    seasonScore,
    secondary: readPersonalColorType(value.secondary) ?? null,
    tau: readFiniteNumber(value.tau) ?? 0,
    top,
    typeScore,
  };
}

function decodeAxes(value: unknown): Record<AxisName, AuraAxis> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const axes = {} as Record<AxisName, AuraAxis>;

  for (const axis of AXIS_NAMES) {
    const axisRecord = isRecord(value[axis]) ? value[axis] : undefined;

    if (!axisRecord) {
      return undefined;
    }

    axes[axis] = {
      basis: 'within-frame-relative',
      confidence: readFiniteNumber(axisRecord.confidence) ?? 0,
      floored: readBoolean(axisRecord.floored, false),
      value: readNullableFiniteNumber(axisRecord.value),
    };
  }

  return axes;
}

function decodeRegions(value: unknown): AuraRegionMeasurement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const regions: AuraRegionMeasurement[] = [];

  for (const entry of value) {
    if (!isRecord(entry) || !isRecord(entry.lab) || !isRecord(entry.lch)) {
      continue;
    }

    const L = readFiniteNumber(entry.lab.L);
    const a = readFiniteNumber(entry.lab.a);
    const b = readFiniteNumber(entry.lab.b);
    const C = readFiniteNumber(entry.lch.C);
    const h = readFiniteNumber(entry.lch.h);
    const region = readString(entry.region);

    if (
      L === undefined ||
      a === undefined ||
      b === undefined ||
      C === undefined ||
      h === undefined ||
      !region
    ) {
      continue;
    }

    regions.push({
      areaRatio: readFiniteNumber(entry.areaRatio) ?? 0,
      colorSpace: (readString(entry.colorSpace) ??
        'srgb') as AuraRegionMeasurement['colorSpace'],
      lab: {L, a, b},
      lch: {C, h},
      overExposedRatio: readFiniteNumber(entry.overExposedRatio) ?? 0,
      qEff: readFiniteNumber(entry.qEff) ?? 0,
      qNative: readFiniteNumber(entry.qNative) ?? 0,
      region: region as AuraRegionMeasurement['region'],
      underExposedRatio: readFiniteNumber(entry.underExposedRatio) ?? 0,
      warnings: readStringArray(entry.warnings),
    });
  }

  return regions;
}

function decodeChannelGains(value: unknown): ChannelGains | null {
  if (!isRecord(value)) {
    return null;
  }

  const r = readFiniteNumber(value.r);
  const g = readFiniteNumber(value.g);
  const b = readFiniteNumber(value.b);

  return r !== undefined && g !== undefined && b !== undefined ? {r, g, b} : null;
}

function decodeCorrectionReport(value: unknown): IlluminationCorrectionReport | null {
  if (!isRecord(value)) {
    return null;
  }

  const scleraRecord = isRecord(value.sclera) ? value.sclera : {};
  const wbRecord = isRecord(value.wb) ? value.wb : {};
  const measuredLabRecord = isRecord(scleraRecord.measuredLab)
    ? scleraRecord.measuredLab
    : undefined;
  const measuredRgbRecord = isRecord(scleraRecord.measuredRgb)
    ? scleraRecord.measuredRgb
    : undefined;
  const measuredLabL = readFiniteNumber(measuredLabRecord?.L);
  const measuredLabA = readFiniteNumber(measuredLabRecord?.a);
  const measuredLabB = readFiniteNumber(measuredLabRecord?.b);
  const measuredR = readFiniteNumber(measuredRgbRecord?.r);
  const measuredG = readFiniteNumber(measuredRgbRecord?.g);
  const measuredB = readFiniteNumber(measuredRgbRecord?.b);

  return {
    applied: readBoolean(value.applied, false),
    capped: readBoolean(value.capped, false),
    confidence: readFiniteNumber(value.confidence) ?? 0,
    gains: decodeChannelGains(value.gains),
    reasons: readStringArray(value.reasons),
    sclera: {
      available: readBoolean(scleraRecord.available, false),
      eyesUsed: readFiniteNumber(scleraRecord.eyesUsed) ?? 0,
      leftRightAgreement: readNullableFiniteNumber(scleraRecord.leftRightAgreement),
      measuredLab:
        measuredLabL !== undefined &&
        measuredLabA !== undefined &&
        measuredLabB !== undefined
          ? {L: measuredLabL, a: measuredLabA, b: measuredLabB}
          : null,
      measuredRgb:
        measuredR !== undefined && measuredG !== undefined && measuredB !== undefined
          ? {r: measuredR, g: measuredG, b: measuredB}
          : null,
      rawGains: decodeChannelGains(scleraRecord.rawGains),
      reasons: readStringArray(scleraRecord.reasons),
      sampleCount: readFiniteNumber(scleraRecord.sampleCount) ?? 0,
    },
    source: (readString(value.source) ?? 'none') as IlluminationCorrectionReport['source'],
    strength: readFiniteNumber(value.strength) ?? 0,
    wb: {
      available: readBoolean(wbRecord.available, false),
      bg: readNullableFiniteNumber(wbRecord.bg),
      rawGains: decodeChannelGains(wbRecord.rawGains),
      reasons: readStringArray(wbRecord.reasons),
      rg: readNullableFiniteNumber(wbRecord.rg),
    },
  };
}

function decodePersonalColor(
  value: unknown,
): FaceAnalysisMeasurementsPersonalColor | undefined {
  if (!isRecord(value) || !isRecord(value.reported)) {
    return undefined;
  }

  const reportedRecord = value.reported;
  const status = readString(reportedRecord.status) as PersonalColorStatus | undefined;

  if (!status || !PERSONAL_COLOR_STATUSES.includes(status)) {
    return undefined;
  }

  const tone = decodeTone(reportedRecord.tone);
  const axes = decodeAxes(reportedRecord.axes);

  if (tone === undefined || !axes) {
    return undefined;
  }

  const relationsRecord = isRecord(reportedRecord.relations)
    ? reportedRecord.relations
    : {};
  const relations = {} as MeasuredPersonalColorView['relations'];

  for (const key of RELATION_KEYS) {
    relations[key] = readNullableFiniteNumber(readKeyVariant(relationsRecord, key));
  }

  const paletteRecord = isRecord(reportedRecord.palette) ? reportedRecord.palette : {};
  const artifactsRecord = isRecord(reportedRecord.artifacts)
    ? reportedRecord.artifacts
    : {};
  const referencePointsRecord = isRecord(artifactsRecord.referencePoints)
    ? artifactsRecord.referencePoints
    : {};

  const reported: MeasuredPersonalColorView = {
    artifacts: {
      calibrationVersion: readString(artifactsRecord.calibrationVersion) ?? null,
      frameCount: readFiniteNumber(artifactsRecord.frameCount) ?? 0,
      referencePoints: {
        fixedRefsVersion: readString(referencePointsRecord.fixedRefsVersion) ?? '',
        neutralSource: (readString(referencePointsRecord.neutralSource) ??
          'population') as 'population' | 'in-frame-neutral',
      },
    },
    axes,
    calibrationApplied: readBoolean(reportedRecord.calibrationApplied, false),
    colorFrame: 'device-relative-awb-locked',
    deferredRegions: ['eye'],
    measurementConfidence: readFiniteNumber(reportedRecord.measurementConfidence) ?? 0,
    palette: {
      best: Array.isArray(paletteRecord.best)
        ? (paletteRecord.best.filter(isRecord) as MeasuredPersonalColorView['palette']['best'])
        : [],
      colorFamilies: Array.isArray(paletteRecord.colorFamilies)
        ? (paletteRecord.colorFamilies.filter(
            isRecord,
          ) as MeasuredPersonalColorView['palette']['colorFamilies'])
        : [],
      worst: Array.isArray(paletteRecord.worst)
        ? (paletteRecord.worst.filter(isRecord) as MeasuredPersonalColorView['palette']['worst'])
        : [],
    },
    preCalibrationHedge: readBoolean(reportedRecord.preCalibrationHedge, false),
    regions: decodeRegions(reportedRecord.regions),
    relations,
    schemaVersion: (readString(reportedRecord.schemaVersion) ??
      'aura-personal-color-v1') as MeasuredPersonalColorView['schemaVersion'],
    status,
    tone,
    warnings: readStringArray(reportedRecord.warnings),
  };

  const correctionStatusRecord = isRecord(value.correctionStatus)
    ? value.correctionStatus
    : {};

  return {
    correctionReport: decodeCorrectionReport(value.correctionReport),
    correctionStatus: {
      applied: readBoolean(correctionStatusRecord.applied, false),
      reasons: readStringArray(correctionStatusRecord.reasons),
    },
    reported,
  };
}

// ── decode: 최상위 ───────────────────────────────────────────────────────────

export function parseFaceAnalysisMeasurements(
  value: unknown,
  options: {imageUrl?: string} = {},
): FaceAnalysisReportMeasurements | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.schemaVersion !== FACE_ANALYSIS_MEASUREMENTS_SCHEMA_VERSION) {
    return undefined;
  }

  const captureId = readString(value.captureId);

  if (!captureId) {
    return undefined;
  }

  const faceVerticalThirds = decodeVerticalThirds(
    value.faceVerticalThirds,
    options.imageUrl ?? '',
  );
  // 인증된 backend detail 복원 경계에서만 serverCalibrationReceiptStatus를 허용한다.
  // Unity/device 이벤트 parser는 같은 필드를 fail-closed로 거부한다.
  const face3d = parseTrustedServerFace3DProfile(value.face3d) ?? undefined;
  const faceGeometry2d = decodeFaceGeometry(value.faceGeometry2d);
  const personalColor = decodePersonalColor(value.personalColor);
  const regionVisuals = decodeRegionVisuals(value.regionVisuals);

  return {
    captureId,
    schemaVersion: FACE_ANALYSIS_MEASUREMENTS_SCHEMA_VERSION,
    ...(faceVerticalThirds ? {faceVerticalThirds} : {}),
    ...(face3d ? {face3d} : {}),
    ...(faceGeometry2d ? {faceGeometry2d} : {}),
    ...(personalColor ? {personalColor} : {}),
    ...(regionVisuals ? {regionVisuals} : {}),
  };
}

// ── 표시 identity: 세션 props vs 복원 measurements ───────────────────────────

// 세션 측정 props 는 "지금 화면의 보고서가 그 세션의 캡처로 만든 보고서"일 때만
// 쓴다. 명시적 reportId(과거 조회)는 항상 복원분, measurements 가 없는 구버전
// 보고서는 세션 직후 자기 보고서 경로만 reportId 없이 도달하므로 세션 props 허용.
export function shouldUseSessionMeasurements(input: {
  explicitReportId: string | null;
  reportCaptureId: string | null;
  sessionCaptureId: string | null;
}): boolean {
  if (input.explicitReportId) {
    return false;
  }

  if (input.reportCaptureId === null) {
    return true;
  }

  return (
    input.sessionCaptureId !== null &&
    input.reportCaptureId === input.sessionCaptureId
  );
}
