import {deriveMeasuredFeatureBands} from './faceFeatureProfileDerive';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {FaceGeometryMetrics} from '../../face-geometry/types';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// 모든 지표를 null로 채운 뒤 overrides만 값 부여(합성 측정치).
function metrics(overrides: Record<string, number>): FaceGeometryMetrics {
  const base = {} as Record<
    string,
    {unit: string; value: number | null; warnings: string[]}
  >;
  for (const k of FACE_GEOMETRY_METRIC_KEYS) {
    base[k] = {
      unit: k.endsWith('Deg') ? 'deg' : 'ratio',
      value: k in overrides ? overrides[k] : null,
      warnings: [],
    };
  }
  return base as unknown as FaceGeometryMetrics;
}

function derive(overrides: Record<string, number>, extra = {}) {
  return deriveMeasuredFeatureBands({
    metrics: metrics(overrides),
    measuredAt: '2026-07-21T00:00:00.000Z',
    ...extra,
  });
}

// ── 방향 밴드: 눈꼬리 ─────────────────────────────────────────────────────
{
  const p = derive({canthalTiltLeftDeg: 10, canthalTiltRightDeg: 10});
  assert(p.eye.canthalTilt.band === 'up', 'raised canthal -> up');
  assert(p.eye.canthalTilt.calibration === 'self-referential', 'canthal is self-ref');
}
{
  const p = derive({canthalTiltLeftDeg: -10, canthalTiltRightDeg: -10});
  assert(p.eye.canthalTilt.band === 'down', 'drooped canthal -> down');
}
{
  const p = derive({canthalTiltLeftDeg: 1, canthalTiltRightDeg: 1});
  assert(p.eye.canthalTilt.band === 'level', 'near-horizontal canthal -> level (deadzone)');
}

// ── 판정 보류: 지표 없으면 band=null ───────────────────────────────────────
{
  const p = derive({});
  assert(p.eye.canthalTilt.band === null, 'no metric -> band null');
  assert(p.eye.canthalTilt.value === null, 'no metric -> value null');
  assert(
    p.eye.doubleEyelid === null && p.cheek.volume === null,
    'VLM slots start null (backend fills)',
  );
}

// ── 좌우 평균: 한쪽만 있어도 판정 ──────────────────────────────────────────
{
  const p = derive({browSlopeLeftDeg: 8});
  assert(p.brow.slope.band === 'up', 'single-side brow slope -> up via meanOrNull');
}

// ── 눈 사이 거리(자기참조): eyeWidthRatio ──────────────────────────────────
{
  // eyeWidth가 눈사이보다 큼(ratio>1.15) -> 가까운 눈
  const p = derive({eyeWidthRatioLeft: 1.3, eyeWidthRatioRight: 1.3});
  assert(p.eye.spacing.band === 'close', 'eye wider than gap -> close-set');
  assert(p.eye.spacing.calibration === 'self-referential', 'spacing is self-ref');
}
{
  const p = derive({eyeWidthRatioLeft: 0.7, eyeWidthRatioRight: 0.7});
  assert(p.eye.spacing.band === 'wide', 'eye narrower than gap -> wide-set');
}
{
  const p = derive({eyeWidthRatioLeft: 1.0, eyeWidthRatioRight: 1.0});
  assert(p.eye.spacing.band === 'balanced', 'eye ~= gap -> balanced');
}

// ── 눈썹 산 위치(자기참조): 0=앞머리..1=꼬리 ───────────────────────────────
{
  const p = derive({browApexRatioLeft: 0.75, browApexRatioRight: 0.75});
  assert(p.brow.apex.band === 'outer', 'apex near tail -> outer');
}
{
  const p = derive({browApexRatioLeft: 0.2, browApexRatioRight: 0.2});
  assert(p.brow.apex.band === 'inner', 'apex near head -> inner');
}
{
  const p = derive({browApexRatioLeft: 0.5, browApexRatioRight: 0.5});
  assert(p.brow.apex.band === 'center', 'apex mid -> center');
}

// ── 입술 균형(자기참조): 윗/아랫 두께비 ────────────────────────────────────
{
  const p = derive({lipThicknessRatio: 1.5});
  assert(p.lip.thicknessBalance.band === 'upperFuller', 'upper thicker -> upperFuller');
}
{
  const p = derive({lipThicknessRatio: 0.6});
  assert(p.lip.thicknessBalance.band === 'lowerFuller', 'lower thicker -> lowerFuller');
}
{
  const p = derive({lipThicknessRatio: 1.0});
  assert(p.lip.thicknessBalance.band === 'balanced', 'equal lips -> balanced');
}
{
  // 퇴화값 방어: ratio<=0 은 보류
  const p = derive({lipThicknessRatio: 0});
  assert(p.lip.thicknessBalance.band === null, 'non-positive lip ratio -> unresolved');
}

// ── 입꼬리 좌우 비대칭(자기참조, ratio 데드존) ─────────────────────────────
{
  const p = derive({mouthCornerAsymmetry: 0.05});
  assert(p.lip.cornerAsymmetry.band === 'rightLower', 'positive asym -> right corner lower');
}
{
  const p = derive({mouthCornerAsymmetry: -0.05});
  assert(p.lip.cornerAsymmetry.band === 'leftLower', 'negative asym -> left corner lower');
}
{
  // deg 데드존(3)이 아니라 ratio 데드존(0.02)을 써야 미세 비대칭이 even
  const p = derive({mouthCornerAsymmetry: 0.01});
  assert(p.lip.cornerAsymmetry.band === 'even', 'tiny asym -> even (ratio deadzone, not deg)');
}

// ── population 잠정 밴드 표시 ───────────────────────────────────────────────
{
  const p = derive({eyeOpennessLeft: 0.5, eyeOpennessRight: 0.5});
  assert(p.eye.openness.band === 'high', 'tall eye -> high(round)');
  assert(
    p.eye.openness.calibration === 'provisional-population',
    'openness flagged provisional-population',
  );
}
{
  const p = derive({jawWidthRatio: 0.9, lowerJawWidthRatio: 0.9});
  assert(p.contour.jawWidth.band === 'high', 'wide jaw -> high');
  assert(
    p.contour.jawWidth.calibration === 'provisional-population',
    'jawWidth flagged provisional-population',
  );
}

// ── 세로 3분할 우세(자기참조) ──────────────────────────────────────────────
{
  const p = derive({}, {verticalThirds: {upper: 1.0, middle: 1.0, lower: 1.3}});
  assert(p.contour.verticalBalance.band === 'lower', 'longest lower third -> lower dominant');
}
{
  const p = derive({}, {verticalThirds: {upper: 1.0, middle: 1.0, lower: 1.0}});
  assert(p.contour.verticalBalance.band === 'balanced', 'equal thirds -> balanced');
}
{
  const p = derive({}, {verticalThirds: {upper: 1.4, middle: 1.0, lower: 1.0}});
  assert(p.contour.verticalBalance.band === 'upper', 'longest upper third -> upper dominant');
}
{
  // upper=null(헤어라인 미검출)이면 전체 우세 판정 불가 -> 보류(over-claim 방지)
  const p = derive({}, {verticalThirds: {upper: null, middle: 1.0, lower: 1.4}});
  assert(p.contour.verticalBalance.band === null, 'null upper -> unresolved (cannot claim dominance)');
}
{
  const p = derive({});
  assert(p.contour.verticalBalance.band === null, 'no thirds -> unresolved');
}

// ── 얼굴형 라벨 패스스루 ───────────────────────────────────────────────────
{
  const p = derive({}, {faceShapeLabel: '계란형'});
  assert(p.contour.faceShape === '계란형', 'faceShape label passes through');
  const q = derive({});
  assert(q.contour.faceShape === null, 'no faceShape -> null');
}

// ── 메타·재현성 ────────────────────────────────────────────────────────────
{
  const p = derive({}, {sourceReportId: 'r-1'});
  assert(p.schemaVersion === 'aura-face-feature-profile.v0', 'schemaVersion set');
  assert(p.bandMappingVersion === 'bands-v0-provisional', 'bandMappingVersion set');
  assert(p.sourceReportId === 'r-1', 'sourceReportId threaded');
  assert(p.measuredAt === '2026-07-21T00:00:00.000Z', 'measuredAt threaded (no Date.now)');
}

console.log('faceFeatureProfileDerive: all assertions passed');
