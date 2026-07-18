// S3 부위별 자기참조 스펙트럼 축 — 위치는 실측 자기참조 기하(faceGeometry2d)에서
// 결정론적으로 나온다(LLM이 지어내지 않는다). 양 끝은 '자기 부위 A↔B' 또는 '수평(0°)
// 기준 방향'만 쓴다 — 모집단 평균·절대강도('큰 눈'/'긴 코')는 기준이 없어 만들지 않는다.
// 지표가 없으면 position=null(판정 보류). RN·토큰 무의존(계약 러너가 plain node 실행).

import type {FaceGeometryMetricKey, FaceGeometryMetrics} from '../face-geometry/types';

export type FeatureAxis = {
  key: string;
  leftLabel: string;
  rightLabel: string;
  // 0..1 위치(0.5=중립/동일). null = 지표 없음 → 판정 보류.
  position: number | null;
};

export type RegionAxesKey = 'upper' | 'mid' | 'lower' | 'jaw';
export type RegionFeatureAxes = Record<RegionAxesKey, FeatureAxis[]>;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const clampR = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function metricValue(m: FaceGeometryMetrics, k: FaceGeometryMetricKey): number | null {
  const x = m[k];
  return x && x.value != null && Number.isFinite(x.value) ? x.value : null;
}

function meanOrNull(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

// 수평(0°) 기준 방향 → 0..1(0.5=수평). 표시 범위 ±rangeDeg를 양 끝으로 클램프.
// '올라감/내려감'은 자기 얼굴의 수평선 대비 방향이라 자기참조(모집단 아님).
function directionPosition(deg: number | null, rangeDeg = 18): number | null {
  if (deg == null) return null;
  return clamp01(0.5 + clampR(deg, -rangeDeg, rangeDeg) / (2 * rangeDeg));
}

// 자기 두 부위 비율(분자/분모) → 0..1(0.5=동일). r>1이면 분자 우세(좌), r<1이면 분모 우세(우).
function ratioPosition(r: number | null): number | null {
  if (r == null || r <= 0) return null;
  const t = clampR(Math.log(r) / Math.log(2), -1, 1); // r=2→+1, r=0.5→−1
  return clamp01(0.5 - 0.5 * t);
}

/**
 * 실측 자기참조 지표로 부위별 축을 만든다. 정직성:
 * - 눈꼬리/눈썹 = 수평(0°) 기준 방향(내려감↔올라감).
 * - 입술 = 자기 윗입술↔아랫입술 두께비(자기 두 부위 비교).
 * mid/jaw는 현재 자기참조-비교로 정직하게 세울 축이 마땅치 않아 비운다(내러티브가 담당).
 * 절대강도(큰 눈/긴 코)는 기준이 없어 만들지 않는다.
 */
export function buildRegionFeatureAxes(m: FaceGeometryMetrics): RegionFeatureAxes {
  const canthal = meanOrNull(metricValue(m, 'canthalTiltLeftDeg'), metricValue(m, 'canthalTiltRightDeg'));
  const brow = meanOrNull(metricValue(m, 'browSlopeLeftDeg'), metricValue(m, 'browSlopeRightDeg'));
  const lip = metricValue(m, 'lipThicknessRatio'); // 윗입술 두께 / 아랫입술 두께

  return {
    upper: [
      {key: 'canthalTilt', leftLabel: '내려간 눈꼬리', rightLabel: '올라간 눈꼬리', position: directionPosition(canthal)},
      {key: 'browSlope', leftLabel: '처진 눈썹', rightLabel: '올라간 눈썹', position: directionPosition(brow)},
    ],
    mid: [],
    lower: [
      {key: 'lipThickness', leftLabel: '윗입술이 도톰', rightLabel: '아랫입술이 도톰', position: ratioPosition(lip)},
    ],
    jaw: [],
  };
}
