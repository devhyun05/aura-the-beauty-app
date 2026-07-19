import type {FitEntry} from './fitSheets';
import type {RegionKey} from './regions';

export const AUTO_FIT_METRIC_KEYS = [
  'eyeCornerAngle',
  'eyeAspectRatio',
  'eyeDistance',
  'eyeBrowDistance',
  'lipThicknessRatio',
  'faceWidthLengthRatio',
  'lipWidth',
] as const;

export type AutoFitMetricKey = typeof AUTO_FIT_METRIC_KEYS[number];

export interface MetricEnvelope {
  value: number;
  confidence: number;
  source: 'landmark' | 'pixel' | 'depth' | 'ai' | 'draping';
}

export type AutoFitMetrics = Partial<Record<AutoFitMetricKey, MetricEnvelope>>;

export interface AutoFitResult {
  accepted: boolean;
  deltas: FitEntry[];
}

/**
 * 카탈로그가 그려진 캐노니컬 얼굴 좌표계의 동일 측정 기준이다.
 * 미적 이상형 수치가 아니며, 얼굴분석 파이프라인 캘리브레이션 후 교체하는 단일 지점이다.
 */
export const AUTO_FIT_REFS: Readonly<Record<AutoFitMetricKey, number>> = {
  eyeCornerAngle: 0,
  eyeAspectRatio: 0.32,
  eyeDistance: 1,
  eyeBrowDistance: 1,
  lipThicknessRatio: 0.75,
  faceWidthLengthRatio: 0.75,
  lipWidth: 1,
};

export const AUTO_FIT_CONFIDENCE_MIN = 0.6;

export const AUTO_FIT_OUTPUT_RULES: Readonly<
  Partial<Record<RegionKey, readonly string[]>>
> = {
  eyelinerUpper: ['eyeCornerLift'],
  eyeshadow: ['eyeshadowHeight'],
  doubleLid: ['doubleLidHeight'],
  lip: ['lipOverline'],
  blush: ['blushLift', 'blushSpread'],
};

function usable(metrics: AutoFitMetrics, key: AutoFitMetricKey): number | null {
  const metric = metrics[key];
  if (
    !metric ||
    metric.confidence < AUTO_FIT_CONFIDENCE_MIN ||
    !Number.isFinite(metric.confidence) ||
    !Number.isFinite(metric.value)
  ) {
    return null;
  }
  return metric.value;
}

function addRule(
  byRegion: Map<RegionKey, FitEntry>,
  region: RegionKey,
  key: string,
  delta: number,
): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  const entry = byRegion.get(region) ?? {region, rules: {}};
  entry.rules![key] = (entry.rules![key] ?? 0) + delta;
  byRegion.set(region, entry);
}

/** 측정값을 겹 ID 없는 부위 단위 자동 핏 기저 델타로 변환한다. */
export function computeAutoFit(metrics: AutoFitMetrics): FitEntry[] {
  const byRegion = new Map<RegionKey, FitEntry>();

  const cornerAngle = usable(metrics, 'eyeCornerAngle');
  if (cornerAngle !== null) {
    addRule(
      byRegion,
      'eyelinerUpper',
      'eyeCornerLift',
      0.006 * Math.max(0, AUTO_FIT_REFS.eyeCornerAngle - cornerAngle),
    );
  }

  const eyeAspect = usable(metrics, 'eyeAspectRatio');
  if (eyeAspect !== null) {
    addRule(
      byRegion,
      'eyeshadow',
      'eyeshadowHeight',
      0.5 * (eyeAspect / AUTO_FIT_REFS.eyeAspectRatio - 1),
    );
  }

  const eyeBrowDistance = usable(metrics, 'eyeBrowDistance');
  if (eyeBrowDistance !== null) {
    const delta = 0.3 * (eyeBrowDistance / AUTO_FIT_REFS.eyeBrowDistance - 1);
    addRule(byRegion, 'eyeshadow', 'eyeshadowHeight', delta);
    addRule(byRegion, 'doubleLid', 'doubleLidHeight', delta);
  }

  const lipThickness = usable(metrics, 'lipThicknessRatio');
  if (lipThickness !== null) {
    addRule(
      byRegion,
      'lip',
      'lipOverline',
      0.05 * Math.max(0, 1 - lipThickness / AUTO_FIT_REFS.lipThicknessRatio),
    );
  }

  const faceRatio = usable(metrics, 'faceWidthLengthRatio');
  if (faceRatio !== null && faceRatio > AUTO_FIT_REFS.faceWidthLengthRatio) {
    addRule(byRegion, 'blush', 'blushLift', 0.03);
  } else if (faceRatio !== null && faceRatio < AUTO_FIT_REFS.faceWidthLengthRatio) {
    addRule(byRegion, 'blush', 'blushSpread', 0.03);
  }

  // eyeDistance·lipWidth는 v1 입력 계약에만 포함한다. 자동 이동은 산출하지 않는다.
  return [...byRegion.values()];
}

/** 미수락/부재 저장물은 컴파일 기저에서 완전히 우회한다. */
export function acceptedAutoFitDeltas(result: AutoFitResult | null): FitEntry[] {
  return result?.accepted ? result.deltas : [];
}
