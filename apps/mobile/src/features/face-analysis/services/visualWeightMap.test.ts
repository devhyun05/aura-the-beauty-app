import {buildVisualWeightMap} from './visualWeightMap';
import {buildFaceFeatureProfile} from './faceFeatureProfileBuilder';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {FaceGeometryMetrics} from '../../face-geometry/types';
import type {FaceFeatureObservations} from '../../../shared/contracts/faceFeatureProfile';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

function emptyMetrics(): FaceGeometryMetrics {
  const base = {} as Record<string, {unit: string; value: number | null; warnings: string[]}>;
  for (const k of FACE_GEOMETRY_METRIC_KEYS) {
    base[k] = {unit: k.endsWith('Deg') ? 'deg' : 'ratio', value: null, warnings: []};
  }
  return base as unknown as FaceGeometryMetrics;
}

// 관찰 헬퍼: {region: bandValue} → confidence 0.9 관찰로 프로파일 조립 후 무게 지도.
function weightMap(obs: FaceFeatureObservations) {
  const profile = buildFaceFeatureProfile({
    metrics: emptyMetrics(),
    measuredAt: '2026-07-21T00:00:00.000Z',
    observations: obs,
  });
  return buildVisualWeightMap(profile);
}

function ob(value: string) {
  return {value, confidence: 0.9, evidence: 'x'};
}

// ── 근거 없음 → insufficient / null / coverage 0 ──────────────────────────
{
  const w = weightMap({});
  assert(w.dominantRegion === 'insufficient', 'no observations -> insufficient');
  assert(w.contrastLevel === null, 'no observations -> contrastLevel null');
  assert(w.coverage === 0, 'coverage 0');
  assert(Object.keys(w.weights).length === 0, 'no weights');
}

// ── 4부위 해소, lip 최고 → dominant lip ────────────────────────────────────
{
  const w = weightMap({
    eyeContrast: ob('medium'),
    browDensity: ob('sparse'),
    cheekContrast: ob('low'),
    lipColorContrast: ob('high'),
  });
  assert(w.coverage === 4, 'coverage 4');
  assert(w.dominantRegion === 'lip', 'highest contrast region -> dominant');
  const sum = Object.values(w.weights).reduce((s, v) => s + (v ?? 0), 0);
  assert(Math.abs(sum - 1) < 1e-9, 'weights normalize to 1');
  assert((w.weights.lip ?? 0) > (w.weights.cheek ?? 0), 'lip weight > cheek weight');
}

// ── 미해소 부위는 키 없음(0 아님) ──────────────────────────────────────────
{
  const w = weightMap({
    eyeContrast: ob('high'),
    lipColorContrast: ob('medium'),
  });
  assert(w.coverage === 2, 'only 2 resolved');
  assert(!('brow' in w.weights), 'unresolved brow absent (not 0)');
  assert(!('cheek' in w.weights), 'unresolved cheek absent (not 0)');
  assert(w.dominantRegion === 'eye', 'eye high vs lip medium -> eye dominant');
}

// ── 팽팽하면 balanced ──────────────────────────────────────────────────────
{
  const w = weightMap({
    eyeContrast: ob('high'),
    lipColorContrast: ob('high'),
  });
  assert(w.dominantRegion === 'balanced', 'equal top two -> balanced');
}

// ── 근거 1개 → insufficient(상대 비교 불가) ────────────────────────────────
{
  const w = weightMap({lipColorContrast: ob('high')});
  assert(w.coverage === 1, 'coverage 1');
  assert(w.dominantRegion === 'insufficient', 'single region -> insufficient (cannot compare)');
  assert((w.weights.lip ?? 0) === 1, 'single region weight normalizes to 1');
}

// ── contrastLevel: 전체 대비 수준 ──────────────────────────────────────────
{
  const high = weightMap({eyeContrast: ob('high'), lipColorContrast: ob('high')});
  assert(high.contrastLevel === 'high', 'all high -> high contrast level');
  const low = weightMap({eyeContrast: ob('low'), lipColorContrast: ob('low')});
  assert(low.contrastLevel === 'low', 'all low -> low contrast level');
}

// ── 눈썹 프록시 표기 ───────────────────────────────────────────────────────
{
  const w = weightMap({browDensity: ob('dense'), eyeContrast: ob('low')});
  assert(
    w.basis.some(b => b.includes('brow') && b.includes('proxy')),
    'brow weight flagged as density proxy in basis',
  );
  assert(w.dominantRegion === 'brow', 'dense brow vs low eye -> brow dominant');
}

// ── unclear/저confidence 대비는 무게에서 제외(생략 규칙 상속) ────────────────
{
  const w = weightMap({
    eyeContrast: {value: 'unclear', confidence: 0.9, evidence: 'x'},
    lipColorContrast: {value: 'high', confidence: 0.2, evidence: 'x'},
    cheekContrast: ob('medium'),
  });
  assert(!('eye' in w.weights), 'unclear eye contrast excluded');
  assert(!('lip' in w.weights), 'low-confidence lip contrast excluded');
  assert(w.coverage === 1, 'only cheek resolved');
}

console.log('visualWeightMap: all assertions passed');
