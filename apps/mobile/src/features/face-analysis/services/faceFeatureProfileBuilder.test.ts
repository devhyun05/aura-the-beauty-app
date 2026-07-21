import {buildFaceFeatureProfile} from './faceFeatureProfileBuilder';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {FaceGeometryMetrics} from '../../face-geometry/types';
import type {FaceFeatureObservations} from '../../../shared/contracts/faceFeatureProfile';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

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

function build(observations?: FaceFeatureObservations, threshold?: number) {
  return buildFaceFeatureProfile({
    metrics: metrics({canthalTiltLeftDeg: 8, canthalTiltRightDeg: 8}),
    measuredAt: '2026-07-21T00:00:00.000Z',
    observations,
    ...(threshold != null ? {vlmConfidenceThreshold: threshold} : {}),
  });
}

// ── 측정 밴드는 항상 유지(관찰 없어도) ─────────────────────────────────────
{
  const p = build();
  assert(p.eye.canthalTilt.band === 'up', 'measured bands present without observations');
  assert(p.eye.doubleEyelid === null, 'VLM slot null when no observations');
}

// ── 유효 관찰 → 슬롯 채움 ──────────────────────────────────────────────────
{
  const p = build({
    eyelidType: {value: 'hooded', confidence: 0.9, evidence: '눈두덩이 덮임'},
    browDensity: {value: 'sparse', confidence: 0.8, evidence: '숱 적음'},
    cheekVolume: {value: 'full', confidence: 0.7, evidence: '볼 통통'},
    lipColorContrast: {value: 'high', confidence: 0.75, evidence: '입술 진함'},
  });
  assert(p.eye.doubleEyelid?.value === 'hooded', 'valid eyelid -> filled');
  assert(p.eye.doubleEyelid?.evidence === '눈두덩이 덮임', 'evidence preserved');
  assert(p.brow.density?.value === 'sparse', 'valid brow density -> filled');
  assert(p.cheek.volume?.value === 'full', 'valid cheek volume -> filled');
  assert(p.lip.colorContrast?.value === 'high', 'valid lip contrast -> filled');
}

// ── 'unclear' → 생략(null) ─────────────────────────────────────────────────
{
  const p = build({
    eyelidType: {value: 'unclear', confidence: 0.9, evidence: '조명 때문에 불확실'},
  });
  assert(p.eye.doubleEyelid === null, "unclear value -> slot null (omit, not 0)");
}

// ── 저confidence → 생략(null) ──────────────────────────────────────────────
{
  const p = build({
    eyelidType: {value: 'hooded', confidence: 0.3, evidence: '어렴풋'},
  });
  assert(p.eye.doubleEyelid === null, 'low confidence -> slot null');
}
{
  // 임계 경계: 정확히 0.5는 통과(>= 임계)
  const p = build(
    {upperLidHooding: {value: 'mild', confidence: 0.5, evidence: 'x'}},
    0.5,
  );
  assert(p.eye.upperLidHooding?.value === 'mild', 'confidence == threshold passes');
}

// ── enum 밖 값(오염) → 생략(null) ──────────────────────────────────────────
{
  const p = build({
    eyelidType: {value: 'double', confidence: 0.9, evidence: '오염값'},
    aegyoSal: {value: 'maybe', confidence: 0.9, evidence: '오염값'},
  });
  assert(p.eye.doubleEyelid === null, 'invalid enum value -> slot null');
  assert(p.eye.aegyoSal === null, 'invalid presence value -> slot null');
}

// ── 상/하안검 독립 판정 ────────────────────────────────────────────────────
{
  const p = build({
    upperLidHooding: {value: 'pronounced', confidence: 0.8, evidence: '상안검'},
    lowerLidSagging: {value: 'none', confidence: 0.8, evidence: '하안검'},
  });
  assert(p.eye.upperLidHooding?.value === 'pronounced', 'upper lid resolved');
  assert(p.eye.lowerLidSagging?.value === 'none', 'lower lid resolved independently');
}

console.log('faceFeatureProfileBuilder: all assertions passed');
