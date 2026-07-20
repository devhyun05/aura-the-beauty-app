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
// 축 하나를 자기참조 서술 구절로. 중앙 근처(±0.08)는 '균형/비슷'으로, 치우치면 방향.
// 절대강도('많이')는 쓰지 않는다 — '수평보다 올라간', 'A가 B보다 도톰'까지만.
function axisPhrase(a: FeatureAxis): string | null {
  if (a.position == null) return null;
  const p = a.position;
  const hi = p > 0.58;
  const lo = p < 0.42;
  switch (a.key) {
    case 'canthalTilt':
      return hi ? '눈꼬리가 수평보다 올라가 또렷한 인상이에요.'
        : lo ? '눈꼬리가 수평보다 내려가 부드러운 인상이에요.'
        : '눈꼬리가 수평에 가까워 균형 잡혀 있어요.';
    case 'browSlope':
      return hi ? '눈썹은 꼬리가 올라간 흐름이에요.'
        : lo ? '눈썹은 완만하게 내려온 흐름이에요.'
        : '눈썹은 수평에 가까운 흐름이에요.';
    // browApex(눈썹 산 위치)는 자기참조 서술 helper가 아닌 시각 축(buildRegionFeatureAxes
    // → buildS3)으로만 전달한다 — describeRegionAxes는 프로덕션 미사용 경로라 케이스를 두지 않는다.
    case 'lipThickness':
      return hi ? '아랫입술이 윗입술보다 도톰해요.'
        : lo ? '윗입술이 아랫입술보다 도톰해요.'
        : '위아래 입술 두께가 비슷해요.';
    default:
      return null;
  }
}

// 부위 축들을 자기참조 서술(최대 2문장)로. 판정 보류 축은 건너뛴다. 없으면 빈 문자열.
export function describeRegionAxes(axes: FeatureAxis[]): string {
  const phrases: string[] = [];
  for (const a of axes) {
    const phrase = axisPhrase(a);
    if (phrase) {
      phrases.push(phrase);
    }
  }
  return phrases.slice(0, 2).join(' ');
}

export function buildRegionFeatureAxes(m: FaceGeometryMetrics): RegionFeatureAxes {
  const canthal = meanOrNull(metricValue(m, 'canthalTiltLeftDeg'), metricValue(m, 'canthalTiltRightDeg'));
  const brow = meanOrNull(metricValue(m, 'browSlopeLeftDeg'), metricValue(m, 'browSlopeRightDeg'));
  // 눈썹 봉우리(산) 위치 0=앞머리..1=꼬리 — 이미 자기 눈썹 위 자기참조 값이라 그대로 위치로.
  const browApex = meanOrNull(metricValue(m, 'browApexRatioLeft'), metricValue(m, 'browApexRatioRight'));
  const lip = metricValue(m, 'lipThicknessRatio'); // 윗입술 두께 / 아랫입술 두께

  return {
    upper: [
      {key: 'canthalTilt', leftLabel: '내려간 눈꼬리', rightLabel: '올라간 눈꼬리', position: directionPosition(canthal)},
      {key: 'browSlope', leftLabel: '처진 눈썹', rightLabel: '올라간 눈썹', position: directionPosition(brow)},
      {key: 'browApex', leftLabel: '앞쪽 산', rightLabel: '바깥쪽 산', position: browApex == null ? null : clamp01(browApex)},
    ],
    mid: [],
    lower: [
      {key: 'lipThickness', leftLabel: '윗입술이 도톰', rightLabel: '아랫입술이 도톰', position: ratioPosition(lip)},
    ],
    jaw: [],
  };
}
