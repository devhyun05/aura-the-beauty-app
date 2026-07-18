import {buildRegionFeatureAxes, describeRegionAxes} from './reportFeatureAxes';
import {FACE_GEOMETRY_METRIC_KEYS} from '../face-geometry/types';
import type {FaceGeometryMetrics} from '../face-geometry/types';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// 모든 지표를 null로 채운 뒤 overrides만 값 부여(합성 측정치).
function metrics(overrides: Record<string, number>): FaceGeometryMetrics {
  const base = {} as Record<string, {unit: string; value: number | null; warnings: string[]}>;
  for (const k of FACE_GEOMETRY_METRIC_KEYS) {
    base[k] = {unit: k.endsWith('Deg') ? 'deg' : 'ratio', value: k in overrides ? overrides[k] : null, warnings: []};
  }
  return base as unknown as FaceGeometryMetrics;
}

// 눈꼬리 올라감(+10° 양쪽) → 위치가 '올라간 쪽'(>0.5)
{
  const a = buildRegionFeatureAxes(metrics({canthalTiltLeftDeg: 10, canthalTiltRightDeg: 10}));
  const c = a.upper.find(x => x.key === 'canthalTilt')!;
  assert(c.position != null && c.position > 0.5, 'raised canthal -> right of center');
}
// 윗입술 2배 두꺼움(ratio 2=윗/아랫) → 위치 왼쪽(윗입술 도톰, <0.5)
{
  const a = buildRegionFeatureAxes(metrics({lipThicknessRatio: 2}));
  const lip = a.lower.find(x => x.key === 'lipThickness')!;
  assert(lip.position != null && lip.position < 0.5, 'upper lip thicker -> left');
}
// 아랫입술 2배(ratio 0.5) → 오른쪽(>0.5)
{
  const a = buildRegionFeatureAxes(metrics({lipThicknessRatio: 0.5}));
  const lip = a.lower.find(x => x.key === 'lipThickness')!;
  assert(lip.position != null && lip.position > 0.5, 'lower lip thicker -> right');
}
// 같은 두께(ratio 1) → 정중앙 0.5
{
  const a = buildRegionFeatureAxes(metrics({lipThicknessRatio: 1}));
  const lip = a.lower.find(x => x.key === 'lipThickness')!;
  assert(lip.position === 0.5, 'equal lips -> center');
}
// 지표 없음 → position null(판정 보류)
{
  const a = buildRegionFeatureAxes(metrics({}));
  assert(a.upper.every(x => x.position === null), 'no metrics -> upper axes withheld');
  assert(a.lower[0].position === null, 'no lip metric -> withheld');
  assert(a.mid.length === 0 && a.jaw.length === 0, 'mid/jaw empty (narrative-only)');
}
// 한쪽만 측정돼도 평균 폴백(+18° 한쪽 → 표시 범위 상한 ~1.0)
{
  const a = buildRegionFeatureAxes(metrics({canthalTiltLeftDeg: 18}));
  const c = a.upper.find(x => x.key === 'canthalTilt')!;
  assert(c.position != null && c.position >= 0.99, 'one-side +18deg -> ~1.0');
}

// describeRegionAxes — 자기참조 서술('남들 대비'·'많이' 없음), 보류 축은 건너뜀
{
  const upper = buildRegionFeatureAxes(metrics({canthalTiltLeftDeg: 12, canthalTiltRightDeg: 12})).upper;
  const s = describeRegionAxes(upper);
  assert(s.includes('눈꼬리') && s.includes('올라'), 'raised canthal narrated');
  assert(!s.includes('평균') && !s.includes('많이'), 'no population/intensity wording');
  // 모두 보류면 빈 문자열
  assert(describeRegionAxes(buildRegionFeatureAxes(metrics({})).upper) === '', 'all withheld -> empty narrative');
  // 입술: 아랫입술 도톰(ratio 0.5) 서술
  const lower = buildRegionFeatureAxes(metrics({lipThicknessRatio: 0.5})).lower;
  assert(describeRegionAxes(lower).includes('아랫입술이 윗입술보다 도톰'), 'lower lip thicker narrated');
}

// eslint-disable-next-line no-console
console.log('reportFeatureAxes.test.ts OK');
