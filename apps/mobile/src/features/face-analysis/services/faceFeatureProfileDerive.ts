// 1층 프로파일의 결정론적(측정) 밴드 판정 — 순수함수. LLM·네트워크 무관.
//
// 입력은 온디바이스 faceGeometry2d 16지표(+세로3분할 표시비율, 얼굴형 라벨).
// 신규 측정은 없다 — 기존 지표를 밴드로 나누기만 한다. VLM enum 슬롯은 여기서
// 채우지 않고 전부 null로 둔다(백엔드 분석 호출이 채움).
//
// 자기참조 원칙: 방향(수평 0° 대비)·자기 부위 간 비율만 밴드로 쓴다. 아직
// population 기준선이 필요한 밴드(눈 개방 둥근/가는, 눈썹-눈 거리, 입 폭, 하악
// 폭)는 calibration='provisional-population'으로 표시한다 — 자체 분포(mean±SD)
// 확정 전까지 임계값은 잠정이고, 그 사실을 소비처가 알 수 있게 한다.
// RN·토큰 무의존(계약 러너가 plain node로 실행).

import {
  FACE_GEOMETRY_METRIC_KEYS,
  type FaceGeometryMetricKey,
  type FaceGeometryMetrics,
} from '../../face-geometry/types';
import {
  FACE_FEATURE_BAND_MAPPING_VERSION,
  FACE_FEATURE_PROFILE_SCHEMA_VERSION,
  type AsymmetryBand,
  type BandCalibration,
  type BrowApexBand,
  type DirectionBand,
  type FaceFeatureProfile,
  type LipBalanceBand,
  type MagnitudeBand,
  type MeasuredBand,
  type SpacingBand,
  type VerticalDominantBand,
} from '../../../shared/contracts/faceFeatureProfile';

// ── 잠정 임계값 ────────────────────────────────────────────────────────────
// ⚠ 전부 잠정(bandMappingVersion='bands-v0-provisional'). 자체 분포 확정 시 교체.
// 'population' 주석이 붙은 중심값은 모집단 기준선이 필요한 값 — 자기참조가 아니다.
const THRESHOLDS = {
  // 방향(deg) 데드존: |값|<=이면 level. canthalTilt·browSlope 공용.
  directionDeadzoneDeg: 3,
  // 눈 사이 거리: eyeWidthRatio(=eyeWidth/interCanthal) 1.0=균형(눈폭≈눈사이).
  // >1 = 눈이 사이보다 넓음 = 가까운 눈, <1 = 먼 눈. 데드존은 자기참조 비율.
  spacingRatioDeadzone: 0.15,
  // 눈썹 산 위치 0..1(0=앞머리): 중앙 0.5 기준 데드존. 자기참조.
  apexCenter: 0.5,
  apexDeadzone: 0.12,
  // 입술 윗:아랫 두께비 1.0=균형. 자기참조.
  lipBalanceDeadzone: 0.15,
  // 세로3분할 우세: 최대 편차가 이 값 미만이면 balanced. 자기참조(세 부위 비교).
  verticalBalancedTolerance: 0.06,
  // 입꼬리 좌우 높이차(mouthCornerAsymmetry, 내안각 거리로 정규화된 비율):
  // |값|<=이면 even. 자기 좌우 비교라 자기참조.
  cornerAsymmetryDeadzone: 0.02,
  // ↓ population 기준선 필요(잠정) ─────────────────────────────────
  opennessCenter: 0.33, // population: 눈 height/width 대략 중심(둥근↔가는 경계)
  opennessDeadzone: 0.06,
  eyeGapCenter: 1.6, // population: eyeBrowGap(=gap/eyeWidth) 중심
  eyeGapDeadzone: 0.35,
  mouthWidthCenter: 0.45, // population: mouthWidth/faceWidth 중심
  mouthWidthDeadzone: 0.05,
  jawWidthCenter: 0.78, // population: jawWidth/faceWidth 중심
  jawWidthDeadzone: 0.06,
} as const;

// 전 지표 null(측정 없음) 스텁 — geometryMetrics 부재 시 사용. 밴드는 전부 판정
// 보류가 되고, VLM 슬롯(관찰 기반)만 채워진다(2층 무게 지도는 관찰만으로도 성립).
function emptyFaceGeometryMetrics(): FaceGeometryMetrics {
  const m = {} as FaceGeometryMetrics;
  for (const k of FACE_GEOMETRY_METRIC_KEYS) {
    m[k] = {unit: k.endsWith('Deg') ? 'deg' : 'ratio', value: null, warnings: []};
  }
  return m;
}

function metricValue(
  m: FaceGeometryMetrics,
  k: FaceGeometryMetricKey,
): number | null {
  const x = m[k];
  return x && x.value != null && Number.isFinite(x.value) ? x.value : null;
}

function meanOrNull(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

// 밴드 없음(판정 보류) 슬롯.
function unresolved<B extends string>(
  metricKeys: readonly string[],
  calibration: BandCalibration,
): MeasuredBand<B> {
  return {band: null, value: null, metricKeys, calibration};
}

function measured<B extends string>(
  band: B,
  value: number,
  metricKeys: readonly string[],
  calibration: BandCalibration,
): MeasuredBand<B> {
  return {band, value, metricKeys, calibration};
}

// 수평(0°) 대비 방향 → down/level/up. 자기참조.
function directionBand(
  deg: number | null,
  metricKeys: readonly string[],
): MeasuredBand<DirectionBand> {
  if (deg == null) return unresolved(metricKeys, 'self-referential');
  const dz = THRESHOLDS.directionDeadzoneDeg;
  const band: DirectionBand = deg > dz ? 'up' : deg < -dz ? 'down' : 'level';
  return measured(band, deg, metricKeys, 'self-referential');
}

// 중심값 대비 low/balanced/high 3구간. population 잠정 밴드에 공용.
function magnitudeBand(
  value: number | null,
  center: number,
  deadzone: number,
  metricKeys: readonly string[],
): MeasuredBand<MagnitudeBand> {
  if (value == null) return unresolved(metricKeys, 'provisional-population');
  const band: MagnitudeBand =
    value > center + deadzone
      ? 'high'
      : value < center - deadzone
        ? 'low'
        : 'balanced';
  return measured(band, value, metricKeys, 'provisional-population');
}

// 입꼬리 좌우 높이차 → leftLower/even/rightLower. 자기참조.
// 지표 부호: 양수 = 피사체 오른쪽 입꼬리가 더 아래(y 큼).
function cornerAsymmetryBand(
  value: number | null,
  metricKeys: readonly string[],
): MeasuredBand<AsymmetryBand> {
  if (value == null) return unresolved(metricKeys, 'self-referential');
  const dz = THRESHOLDS.cornerAsymmetryDeadzone;
  const band: AsymmetryBand =
    value > dz ? 'rightLower' : value < -dz ? 'leftLower' : 'even';
  return measured(band, value, metricKeys, 'self-referential');
}

function spacingBand(
  eyeWidthRatio: number | null,
  metricKeys: readonly string[],
): MeasuredBand<SpacingBand> {
  if (eyeWidthRatio == null) return unresolved(metricKeys, 'self-referential');
  const dz = THRESHOLDS.spacingRatioDeadzone;
  // eyeWidthRatio>1 = 눈폭이 눈사이보다 큼 = 가까운 눈.
  const band: SpacingBand =
    eyeWidthRatio > 1 + dz
      ? 'close'
      : eyeWidthRatio < 1 - dz
        ? 'wide'
        : 'balanced';
  return measured(band, eyeWidthRatio, metricKeys, 'self-referential');
}

function apexBand(
  apex: number | null,
  metricKeys: readonly string[],
): MeasuredBand<BrowApexBand> {
  if (apex == null) return unresolved(metricKeys, 'self-referential');
  const {apexCenter: c, apexDeadzone: dz} = THRESHOLDS;
  const band: BrowApexBand =
    apex > c + dz ? 'outer' : apex < c - dz ? 'inner' : 'center';
  return measured(band, apex, metricKeys, 'self-referential');
}

function lipBalanceBand(
  ratio: number | null,
  metricKeys: readonly string[],
): MeasuredBand<LipBalanceBand> {
  if (ratio == null || ratio <= 0) {
    return unresolved(metricKeys, 'self-referential');
  }
  const dz = THRESHOLDS.lipBalanceDeadzone;
  // lipThicknessRatio = 윗입술 / 아랫입술. >1 = 윗입술이 도톰.
  const band: LipBalanceBand =
    ratio > 1 + dz
      ? 'upperFuller'
      : ratio < 1 - dz
        ? 'lowerFuller'
        : 'balanced';
  return measured(band, ratio, metricKeys, 'self-referential');
}

// 세로 3분할 표시비율(middle=1.0 기준 upper/lower). 평균 대비 편차가 가장 큰
// 부위를 우세로. "어느 부위가 얼굴 전체에서 우세한가"는 세 부위가 다 있어야
// 성립하므로, upper(헤어라인)가 없으면 판정 보류한다 — 두 부위만으로는 평균
// 대비 편차가 항상 같아 우세를 말할 수 없다(over-claim 방지).
function verticalBalanceBand(
  thirds: {upper: number | null; middle: number; lower: number} | null,
): MeasuredBand<VerticalDominantBand> {
  const metricKeys = ['verticalThirds'] as const;
  if (
    !thirds ||
    thirds.upper == null ||
    !Number.isFinite(thirds.upper) ||
    !Number.isFinite(thirds.middle) ||
    !Number.isFinite(thirds.lower)
  ) {
    return unresolved(metricKeys, 'self-referential');
  }
  const parts: Array<{key: VerticalDominantBand; ratio: number}> = [
    {key: 'upper', ratio: thirds.upper},
    {key: 'middle', ratio: thirds.middle},
    {key: 'lower', ratio: thirds.lower},
  ];
  const mean = parts.reduce((s, p) => s + p.ratio, 0) / parts.length;
  let dominant = parts[0];
  let maxDev = -Infinity;
  for (const p of parts) {
    const dev = Math.abs(p.ratio - mean);
    if (dev > maxDev) {
      maxDev = dev;
      dominant = p;
    }
  }
  if (maxDev < THRESHOLDS.verticalBalancedTolerance) {
    return measured('balanced', maxDev, metricKeys, 'self-referential');
  }
  return measured(dominant.key, dominant.ratio, metricKeys, 'self-referential');
}

export type DeriveFeatureBandsInput = {
  // 없으면 전 지표 판정 보류(VLM 슬롯만 채워짐 — 2층은 관찰만으로도 성립).
  metrics?: FaceGeometryMetrics | null;
  // 세로3분할 표시비율(middle=1.0 정규화). 없으면 verticalBalance 보류.
  verticalThirds?: {upper: number | null; middle: number; lower: number} | null;
  // faceAnalysisV2.derived.faceShape.label — 없으면 null.
  faceShapeLabel?: string | null;
  sourceReportId?: string;
  // ISO 문자열. Date.now() 미사용(계약 러너 재현성) — 호출측이 주입.
  measuredAt: string;
};

/**
 * 측정 지표 → 1층 프로파일의 결정론 밴드. VLM 슬롯은 전부 null(백엔드가 채움).
 * 지표 부재는 band=null(판정 보류)로 격리 — 없는 값을 지어내지 않는다.
 */
export function deriveMeasuredFeatureBands(
  input: DeriveFeatureBandsInput,
): FaceFeatureProfile {
  const m = input.metrics ?? emptyFaceGeometryMetrics();

  const canthal = meanOrNull(
    metricValue(m, 'canthalTiltLeftDeg'),
    metricValue(m, 'canthalTiltRightDeg'),
  );
  const browSlope = meanOrNull(
    metricValue(m, 'browSlopeLeftDeg'),
    metricValue(m, 'browSlopeRightDeg'),
  );
  const browApex = meanOrNull(
    metricValue(m, 'browApexRatioLeft'),
    metricValue(m, 'browApexRatioRight'),
  );
  const eyeWidth = meanOrNull(
    metricValue(m, 'eyeWidthRatioLeft'),
    metricValue(m, 'eyeWidthRatioRight'),
  );
  const openness = meanOrNull(
    metricValue(m, 'eyeOpennessLeft'),
    metricValue(m, 'eyeOpennessRight'),
  );
  const eyeGap = meanOrNull(
    metricValue(m, 'eyeBrowGapLeft'),
    metricValue(m, 'eyeBrowGapRight'),
  );
  const jaw = meanOrNull(
    metricValue(m, 'jawWidthRatio'),
    metricValue(m, 'lowerJawWidthRatio'),
  );

  return {
    schemaVersion: FACE_FEATURE_PROFILE_SCHEMA_VERSION,
    bandMappingVersion: FACE_FEATURE_BAND_MAPPING_VERSION,
    ...(input.sourceReportId ? {sourceReportId: input.sourceReportId} : {}),
    measuredAt: input.measuredAt,
    eye: {
      canthalTilt: directionBand(canthal, [
        'canthalTiltLeftDeg',
        'canthalTiltRightDeg',
      ]),
      openness: magnitudeBand(
        openness,
        THRESHOLDS.opennessCenter,
        THRESHOLDS.opennessDeadzone,
        ['eyeOpennessLeft', 'eyeOpennessRight'],
      ),
      spacing: spacingBand(eyeWidth, [
        'eyeWidthRatioLeft',
        'eyeWidthRatioRight',
      ]),
      doubleEyelid: null,
      upperLidHooding: null,
      lowerLidSagging: null,
      aegyoSal: null,
      contrast: null,
    },
    brow: {
      slope: directionBand(browSlope, [
        'browSlopeLeftDeg',
        'browSlopeRightDeg',
      ]),
      apex: apexBand(browApex, ['browApexRatioLeft', 'browApexRatioRight']),
      eyeGap: magnitudeBand(
        eyeGap,
        THRESHOLDS.eyeGapCenter,
        THRESHOLDS.eyeGapDeadzone,
        ['eyeBrowGapLeft', 'eyeBrowGapRight'],
      ),
      density: null,
    },
    lip: {
      thicknessBalance: lipBalanceBand(metricValue(m, 'lipThicknessRatio'), [
        'lipThicknessRatio',
      ]),
      width: magnitudeBand(
        metricValue(m, 'mouthWidthRatio'),
        THRESHOLDS.mouthWidthCenter,
        THRESHOLDS.mouthWidthDeadzone,
        ['mouthWidthRatio'],
      ),
      cornerAsymmetry: cornerAsymmetryBand(
        metricValue(m, 'mouthCornerAsymmetry'),
        ['mouthCornerAsymmetry'],
      ),
      colorContrast: null,
    },
    cheek: {
      cheekboneHeight: null,
      volume: null,
      contrast: null,
    },
    contour: {
      jawWidth: magnitudeBand(
        jaw,
        THRESHOLDS.jawWidthCenter,
        THRESHOLDS.jawWidthDeadzone,
        ['jawWidthRatio', 'lowerJawWidthRatio'],
      ),
      verticalBalance: verticalBalanceBand(input.verticalThirds ?? null),
      faceShape: input.faceShapeLabel ?? null,
    },
  };
}
