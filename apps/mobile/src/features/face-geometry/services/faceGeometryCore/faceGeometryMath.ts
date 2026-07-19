// 2D 얼굴 기하 지표의 순수 계산 코어 — RN 의존 없음(tsc 계약 러너로 단독 검증).
// 입력은 픽셀 좌표 Map<index, point>. 좌표 통일(정규화→픽셀)과 roll 보정은
// 호출측(faceGeometryService)이 이 모듈의 순수 함수로 끝낸 뒤 넘긴다.

import type {
  FaceGeometryDebugAnchor,
  FaceGeometryDebugAnchors,
  FaceGeometryMetric,
  FaceGeometryMetricKey,
  FaceGeometryMetricUnit,
  FaceGeometryMetrics,
} from '../../types';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../types';
import {
  BROW_CORE_LEFT_INDICES,
  BROW_CORE_RIGHT_INDICES,
  BROW_UPPER_EDGE_LEFT_INDICES,
  BROW_UPPER_EDGE_RIGHT_INDICES,
  CANTHAL_TANGENT_INDICES,
  FACE_GEOMETRY_LANDMARK_INDICES,
} from './landmarkIndices';

export type PixelPoint = {x: number; y: number};
export type PixelLandmarkMap = Map<number, PixelPoint>;

// 분모/분산 퇴화 판정 하한. 픽셀 거리 스케일(수백 px)에서 사실상 0 만 걸러낸다.
export const GEOMETRY_EPSILON = 1e-6;

const IDX = FACE_GEOMETRY_LANDMARK_INDICES;

// 정규화(0..1) 랜드마크를 픽셀 좌표 Map 으로 변환한다.
// 항상 새 객체를 만든다 — requestFaceLandmarks 는 같은 이미지 요청을 dedup 해
// 결과 객체를 소비자끼리 공유하므로, 제자리 변환은 다른 분석기를 오염시킨다.
// 랜드마크 배열은 밀집·정렬 비보장이라 반드시 .i 로 매핑한다.
export function toPixelLandmarkMap(
  landmarks: ReadonlyArray<{i: number; x: number; y: number}>,
  imageWidth: number,
  imageHeight: number,
): PixelLandmarkMap {
  const map: PixelLandmarkMap = new Map();

  for (const point of landmarks) {
    if (
      !Number.isFinite(point.i) ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      continue;
    }

    map.set(point.i, {
      x: point.x * imageWidth,
      y: point.y * imageHeight,
    });
  }

  return map;
}

export function collectMissingIndices(
  map: PixelLandmarkMap,
  indices: readonly number[],
): number[] {
  return indices.filter(index => {
    const point = map.get(index);
    return !point || !Number.isFinite(point.x) || !Number.isFinite(point.y);
  });
}

// roll 상쇄 회전을 적용한 새 Map 을 만든다(원본 불변).
export function rotatePixelLandmarkMap(
  map: PixelLandmarkMap,
  angleDeg: number,
  center: PixelPoint,
): PixelLandmarkMap {
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotated: PixelLandmarkMap = new Map();

  map.forEach((point, index) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    rotated.set(index, {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    });
  });

  return rotated;
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function metric(
  unit: FaceGeometryMetricUnit,
  value: number | null,
  warnings: string[] = [],
): FaceGeometryMetric {
  return {unit, value, warnings};
}

function unavailable(unit: FaceGeometryMetricUnit, warning: string): FaceGeometryMetric {
  return metric(unit, null, [warning]);
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

// 분모 퇴화를 지표 단위로 격리하는 비율 헬퍼.
function ratioMetric(numerator: number, denominator: number): FaceGeometryMetric {
  if (!(denominator > GEOMETRY_EPSILON)) {
    return unavailable('ratio', 'denominator_degenerate');
  }
  return metric('ratio', round(numerator / denominator, 4));
}

// 내안각→외안각 기울기(도). 이미지 y 는 아래로 증가하므로 -(dy) 가 위쪽 양수.
// |dx| 로 좌우 진행 방향을 정규화해 양수 = 눈꼬리가 올라간 형태로 통일한다.
function canthalTiltDeg(inner: PixelPoint, outer: PixelPoint): FaceGeometryMetric {
  const dx = Math.abs(outer.x - inner.x);
  if (!(dx > GEOMETRY_EPSILON)) {
    return unavailable('deg', 'canthal_axis_degenerate');
  }
  const deg = (Math.atan2(-(outer.y - inner.y), dx) * 180) / Math.PI;
  return metric('deg', round(deg, 2));
}

// 외안각 수렴각(도): 외안각에서 상·하 눈꺼풀 접선 벡터의 사잇각. atan2(|cross|,dot)로
// [0,180]. 두 상대벡터의 각이라 전역 회전에 불변 → roll 보정과 무관하게 산출한다.
function outerCanthalAngleDeg(
  outer: PixelPoint,
  upper: PixelPoint,
  lower: PixelPoint,
): FaceGeometryMetric {
  const ux = upper.x - outer.x;
  const uy = upper.y - outer.y;
  const lx = lower.x - outer.x;
  const ly = lower.y - outer.y;
  if (!(Math.hypot(ux, uy) > GEOMETRY_EPSILON) || !(Math.hypot(lx, ly) > GEOMETRY_EPSILON)) {
    return unavailable('deg', 'canthal_tangent_degenerate');
  }
  const cross = ux * ly - uy * lx;
  const dot = ux * lx + uy * ly;
  const deg = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI;
  return metric('deg', round(deg, 2));
}

// 눈썹 링 10점 최소자승 직선 기울기(도). 부호는 mirror 정규화 —
// 양수 = 눈썹이 꼬리(외측) 쪽으로 올라감. 피사체 오른쪽은 외측이 -x 방향이라
// 이미지 기울기 b 의 부호를 그대로, 왼쪽은 반전해 좌우를 같은 의미로 만든다.
function browSlopeDeg(
  points: PixelPoint[],
  side: 'left' | 'right',
): FaceGeometryMetric {
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let varX = 0;
  let covXY = 0;

  for (const p of points) {
    varX += (p.x - meanX) * (p.x - meanX);
    covXY += (p.x - meanX) * (p.y - meanY);
  }

  if (!(varX > GEOMETRY_EPSILON)) {
    return unavailable('deg', 'brow_x_variance_degenerate');
  }

  const b = covXY / varX;
  const signFactor = side === 'left' ? -1 : 1;
  const deg = (Math.atan(signFactor * b) * 180) / Math.PI;
  return metric('deg', round(deg, 2));
}

// 눈썹 상연 edge(medial→lateral)에서 최고점(y 최소)을 apex 로, 그 지점의 호길이 비율
// (0=medial, 1=lateral)을 반환. slope 한 개보다 형태(어디서 솟는가)를 보존한다.
function browApexRatioMetric(edge: PixelPoint[]): FaceGeometryMetric {
  if (edge.length < 3) {
    return unavailable('ratio', 'brow_edge_insufficient');
  }
  const cum: number[] = [0];
  for (let i = 1; i < edge.length; i++) {
    cum.push(cum[i - 1] + distance(edge[i - 1], edge[i]));
  }
  const total = cum[cum.length - 1];
  if (!(total > GEOMETRY_EPSILON)) {
    return unavailable('ratio', 'brow_length_degenerate');
  }
  let apex = 0;
  for (let i = 1; i < edge.length; i++) {
    if (edge[i].y < edge[apex].y) {
      apex = i;
    }
  }
  return metric('ratio', round(cum[apex] / total, 4));
}

// 상꺼풀 ↔ 눈썹 하연 최저점(링에서 y 최대 = 눈에 가장 가까운 점)의 수직거리.
function eyeBrowGapMetric(
  upperLid: PixelPoint,
  browRing: PixelPoint[],
  eyeWidthPx: number,
): FaceGeometryMetric {
  if (!(eyeWidthPx > GEOMETRY_EPSILON)) {
    return unavailable('ratio', 'denominator_degenerate');
  }
  const browLowestY = Math.max(...browRing.map(p => p.y));
  const gapPx = upperLid.y - browLowestY;
  if (!(gapPx > 0)) {
    return unavailable('ratio', 'brow_gap_degenerate');
  }
  return metric('ratio', round(gapPx / eyeWidthPx, 4));
}

export type ComputeFaceGeometryMetricsInput = {
  map: PixelLandmarkMap;
  // roll 보정이 적용되지 않은 좌표에서는 기울기·수직거리 계열(canthalTilt,
  // browSlope, browApexRatio, eyeBrowGap, mouthCornerAsymmetry)을 계산하지 않는다 —
  // 카메라 기울기를 얼굴 특징으로 오인하기 때문. 해당 지표만 null 이 된다.
  rollCorrectionApplied: boolean;
};

const ROLL_SENSITIVE_KEYS: readonly FaceGeometryMetricKey[] = [
  'browApexRatioLeft',
  'browApexRatioRight',
  'browSlopeLeftDeg',
  'browSlopeRightDeg',
  'canthalTiltLeftDeg',
  'canthalTiltRightDeg',
  'eyeBrowGapLeft',
  'eyeBrowGapRight',
  'mouthCornerAsymmetry',
];

function metricUnitOf(key: FaceGeometryMetricKey): FaceGeometryMetricUnit {
  return key.endsWith('Deg') ? 'deg' : 'ratio';
}

export function createUnavailableFaceGeometryMetrics(
  warning: string,
): FaceGeometryMetrics {
  const metrics = {} as FaceGeometryMetrics;
  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    metrics[key] = unavailable(metricUnitOf(key), warning);
  }
  return metrics;
}

// 필요 인덱스는 호출측이 collectMissingIndices 로 선검증한다(없으면 blocked).
// 그래도 방어적으로 지표별 입력 결손은 지표 단위 null 로 격리한다.
export function computeFaceGeometryMetrics({
  map,
  rollCorrectionApplied,
}: ComputeFaceGeometryMetricsInput): FaceGeometryMetrics {
  const metrics = createUnavailableFaceGeometryMetrics('not_computed');

  const get = (index: number): PixelPoint | null => map.get(index) ?? null;
  const getRing = (indices: readonly number[]): PixelPoint[] | null => {
    const points: PixelPoint[] = [];
    for (const index of indices) {
      const point = get(index);
      if (!point) {
        return null;
      }
      points.push(point);
    }
    return points;
  };

  const faceRight = get(IDX.faceWidthRight);
  const faceLeft = get(IDX.faceWidthLeft);
  const eyeInnerR = get(IDX.eyeInnerRight);
  const eyeOuterR = get(IDX.eyeOuterRight);
  const eyeInnerL = get(IDX.eyeInnerLeft);
  const eyeOuterL = get(IDX.eyeOuterLeft);

  const faceWidthPx = faceRight && faceLeft ? distance(faceRight, faceLeft) : null;
  const interCanthalPx = eyeInnerR && eyeInnerL ? distance(eyeInnerR, eyeInnerL) : null;
  const eyeWidthRightPx = eyeInnerR && eyeOuterR ? distance(eyeInnerR, eyeOuterR) : null;
  const eyeWidthLeftPx = eyeInnerL && eyeOuterL ? distance(eyeInnerL, eyeOuterL) : null;

  // 눈 폭 / 내안각 거리
  if (eyeWidthLeftPx !== null && interCanthalPx !== null) {
    metrics.eyeWidthRatioLeft = ratioMetric(eyeWidthLeftPx, interCanthalPx);
  }
  if (eyeWidthRightPx !== null && interCanthalPx !== null) {
    metrics.eyeWidthRatioRight = ratioMetric(eyeWidthRightPx, interCanthalPx);
  }

  // 눈 개방도(상하 눈꺼풀 거리 / 동측 눈 폭)
  const upperLidL = get(IDX.eyeUpperLidLeft);
  const lowerLidL = get(IDX.eyeLowerLidLeft);
  const upperLidR = get(IDX.eyeUpperLidRight);
  const lowerLidR = get(IDX.eyeLowerLidRight);
  if (upperLidL && lowerLidL && eyeWidthLeftPx !== null) {
    metrics.eyeOpennessLeft = ratioMetric(distance(upperLidL, lowerLidL), eyeWidthLeftPx);
  }
  if (upperLidR && lowerLidR && eyeWidthRightPx !== null) {
    metrics.eyeOpennessRight = ratioMetric(distance(upperLidR, lowerLidR), eyeWidthRightPx);
  }

  // 내안각 거리 / 얼굴 폭
  if (interCanthalPx !== null && faceWidthPx !== null) {
    metrics.interCanthalRatio = ratioMetric(interCanthalPx, faceWidthPx);
  }

  // 입꼬리 거리 / 얼굴 폭
  const mouthR = get(IDX.mouthCornerRight);
  const mouthL = get(IDX.mouthCornerLeft);
  if (mouthR && mouthL && faceWidthPx !== null) {
    metrics.mouthWidthRatio = ratioMetric(distance(mouthR, mouthL), faceWidthPx);
  }

  // 윗입술 두께 : 아랫입술 두께 (중앙 세로, roll 무관한 점간 거리)
  const upperLipTop = get(IDX.upperLipOuterTop);
  const upperLipBottom = get(IDX.upperLipInnerBottom);
  const lowerLipTop = get(IDX.lowerLipInnerTop);
  const lowerLipBottom = get(IDX.lowerLipOuterBottom);
  if (upperLipTop && upperLipBottom && lowerLipTop && lowerLipBottom) {
    metrics.lipThicknessRatio = ratioMetric(
      distance(upperLipTop, upperLipBottom),
      distance(lowerLipTop, lowerLipBottom),
    );
  }

  // 눈꼬리 수렴각(회전 불변, roll 게이트 무관)
  const canthalUpperR = get(CANTHAL_TANGENT_INDICES.upperRight);
  const canthalLowerR = get(CANTHAL_TANGENT_INDICES.lowerRight);
  if (eyeOuterR && canthalUpperR && canthalLowerR) {
    metrics.outerCanthalAngleRightDeg = outerCanthalAngleDeg(eyeOuterR, canthalUpperR, canthalLowerR);
  }
  const canthalUpperL = get(CANTHAL_TANGENT_INDICES.upperLeft);
  const canthalLowerL = get(CANTHAL_TANGENT_INDICES.lowerLeft);
  if (eyeOuterL && canthalUpperL && canthalLowerL) {
    metrics.outerCanthalAngleLeftDeg = outerCanthalAngleDeg(eyeOuterL, canthalUpperL, canthalLowerL);
  }

  // 하악 폭 / 얼굴 폭, 아래턱 윤곽 폭 / 얼굴 폭
  const jawR = get(IDX.jawRight);
  const jawL = get(IDX.jawLeft);
  if (jawR && jawL && faceWidthPx !== null) {
    metrics.jawWidthRatio = ratioMetric(distance(jawR, jawL), faceWidthPx);
  }
  const lowerJawR = get(IDX.lowerJawRight);
  const lowerJawL = get(IDX.lowerJawLeft);
  if (lowerJawR && lowerJawL && faceWidthPx !== null) {
    metrics.lowerJawWidthRatio = ratioMetric(distance(lowerJawR, lowerJawL), faceWidthPx);
  }

  if (!rollCorrectionApplied) {
    for (const key of ROLL_SENSITIVE_KEYS) {
      metrics[key] = unavailable(metricUnitOf(key), 'roll_correction_unavailable');
    }
    return metrics;
  }

  // ── 이하 roll 보정 좌표 전제 지표 ──────────────────────────────────────────

  if (eyeInnerL && eyeOuterL) {
    metrics.canthalTiltLeftDeg = canthalTiltDeg(eyeInnerL, eyeOuterL);
  }
  if (eyeInnerR && eyeOuterR) {
    metrics.canthalTiltRightDeg = canthalTiltDeg(eyeInnerR, eyeOuterR);
  }

  const browRingLeft = getRing(BROW_CORE_LEFT_INDICES);
  const browRingRight = getRing(BROW_CORE_RIGHT_INDICES);
  if (browRingLeft) {
    metrics.browSlopeLeftDeg = browSlopeDeg(browRingLeft, 'left');
  }
  if (browRingRight) {
    metrics.browSlopeRightDeg = browSlopeDeg(browRingRight, 'right');
  }

  const browEdgeRight = getRing(BROW_UPPER_EDGE_RIGHT_INDICES);
  if (browEdgeRight) {
    metrics.browApexRatioRight = browApexRatioMetric(browEdgeRight);
  }
  const browEdgeLeft = getRing(BROW_UPPER_EDGE_LEFT_INDICES);
  if (browEdgeLeft) {
    metrics.browApexRatioLeft = browApexRatioMetric(browEdgeLeft);
  }

  if (upperLidL && browRingLeft && eyeWidthLeftPx !== null) {
    metrics.eyeBrowGapLeft = eyeBrowGapMetric(upperLidL, browRingLeft, eyeWidthLeftPx);
  }
  if (upperLidR && browRingRight && eyeWidthRightPx !== null) {
    metrics.eyeBrowGapRight = eyeBrowGapMetric(upperLidR, browRingRight, eyeWidthRightPx);
  }

  // 입꼬리 높이차 / 내안각 거리. 양수 = 피사체 오른쪽 입꼬리가 더 아래.
  if (mouthR && mouthL && interCanthalPx !== null) {
    if (!(interCanthalPx > GEOMETRY_EPSILON)) {
      metrics.mouthCornerAsymmetry = unavailable('ratio', 'denominator_degenerate');
    } else {
      metrics.mouthCornerAsymmetry = metric(
        'ratio',
        round((mouthR.y - mouthL.y) / interCanthalPx, 4),
      );
    }
  }

  return metrics;
}

// 오버레이 검증 전용(로컬) — 지표 계산에 실제 쓴 랜드마크 점을 정규화(0..1)
// 좌표로 담는다. computeFaceGeometryMetrics 와 같은 인덱스를 재사용해 지표와
// 시각화가 어긋나지 않게 한다. ⚠ 서버 wire payload 에는 절대 포함하지 않는다
// (faceAnalysisMeasurements.encodeFaceGeometry 가 명시적으로 제외).
export function collectFaceGeometryDebugAnchors(
  map: PixelLandmarkMap,
  imageWidth: number,
  imageHeight: number,
): FaceGeometryDebugAnchors {
  if (!(imageWidth > 0) || !(imageHeight > 0)) {
    return [];
  }
  const anchors: FaceGeometryDebugAnchor[] = [];
  const norm = (p: PixelPoint) => ({x: p.x / imageWidth, y: p.y / imageHeight});
  const seg = (label: string, a: number, b: number): void => {
    const pa = map.get(a);
    const pb = map.get(b);
    if (pa && pb) {
      anchors.push({label, kind: 'segment', points: [norm(pa), norm(pb)]});
    }
  };
  seg('canthalTiltRight', IDX.eyeInnerRight, IDX.eyeOuterRight);
  seg('canthalTiltLeft', IDX.eyeInnerLeft, IDX.eyeOuterLeft);
  seg('eyeOpennessRight', IDX.eyeUpperLidRight, IDX.eyeLowerLidRight);
  seg('eyeOpennessLeft', IDX.eyeUpperLidLeft, IDX.eyeLowerLidLeft);
  // 수렴각: 외안각→상접선, 외안각→하접선 (2 segment)
  seg('canthalUpperRight', IDX.eyeOuterRight, CANTHAL_TANGENT_INDICES.upperRight);
  seg('canthalLowerRight', IDX.eyeOuterRight, CANTHAL_TANGENT_INDICES.lowerRight);
  seg('canthalUpperLeft', IDX.eyeOuterLeft, CANTHAL_TANGENT_INDICES.upperLeft);
  seg('canthalLowerLeft', IDX.eyeOuterLeft, CANTHAL_TANGENT_INDICES.lowerLeft);
  // 눈썹 상연 edge polyline
  const browEdge = (label: string, indices: readonly number[]): void => {
    const pts: {x: number; y: number}[] = [];
    for (const i of indices) {
      const p = map.get(i);
      if (p) pts.push(norm(p));
    }
    if (pts.length >= 2) anchors.push({label, kind: 'polyline', points: pts});
  };
  browEdge('browEdgeRight', BROW_UPPER_EDGE_RIGHT_INDICES);
  browEdge('browEdgeLeft', BROW_UPPER_EDGE_LEFT_INDICES);
  return anchors;
}
