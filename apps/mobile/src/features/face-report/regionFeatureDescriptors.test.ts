import {buildRegionFeatureDescriptors} from './regionFeatureDescriptors';
import {buildFaceFeatureProfile} from '../face-analysis/services/faceFeatureProfileBuilder';
import type {FaceFeatureObservations} from '../../shared/contracts/faceFeatureProfile';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

function descriptors(obs: FaceFeatureObservations) {
  const profile = buildFaceFeatureProfile({
    measuredAt: '2026-07-21T00:00:00.000Z',
    observations: obs,
  });
  return buildRegionFeatureDescriptors(profile);
}

function ob(value: string) {
  return {value, confidence: 0.9, evidence: 'x'};
}

// ── 관찰 없음 → 전 부위 빈 배열 ────────────────────────────────────────────
{
  const d = descriptors({});
  assert(d.upper.length === 0 && d.mid.length === 0 && d.lower.length === 0 && d.jaw.length === 0, 'no obs -> all empty');
}

// ── 상안부: 눈·눈썹 판정이 구절로 ──────────────────────────────────────────
{
  const d = descriptors({
    eyelidType: ob('hooded'),
    upperLidHooding: ob('pronounced'),
    lowerLidSagging: ob('mild'),
    aegyoSal: ob('present'),
    eyeContrast: ob('high'),
    browDensity: ob('dense'),
  });
  assert(d.upper.some(s => s.includes('헐린 눈')), 'hooded -> 헐린 눈');
  assert(d.upper.some(s => s.includes('상안검') && s.includes('뚜렷')), 'pronounced upper lid');
  assert(d.upper.some(s => s.includes('하안검') && s.includes('처진')), 'mild lower lid sagging');
  assert(d.upper.some(s => s.includes('애교살')), 'aegyo present');
  assert(d.upper.some(s => s.includes('눈매 대비')), 'high eye contrast');
  assert(d.upper.some(s => s.includes('숱') && s.includes('짙')), 'dense brow');
}

// ── '무난/없음'은 생략(소음 감소) ──────────────────────────────────────────
{
  const d = descriptors({
    upperLidHooding: ob('none'),
    lowerLidSagging: ob('none'),
    aegyoSal: ob('absent'),
    browDensity: ob('medium'),
    eyeContrast: ob('medium'),
  });
  // eyelid는 판정 안 됨 → 무쌍/속쌍 등도 없음. none/absent/medium 전부 생략.
  assert(d.upper.length === 0, 'none/absent/medium omitted (silence, not fabrication)');
}

// ── 중안부·하안부·광대 매핑 ────────────────────────────────────────────────
{
  const d = descriptors({
    cheekVolume: ob('full'),
    cheekContrast: ob('low'),
    lipColorContrast: ob('high'),
    cheekboneHeight: ob('high'),
  });
  assert(d.mid.some(s => s.includes('볼') && s.includes('볼륨')), 'full cheek volume -> mid');
  assert(d.mid.some(s => s.includes('볼 대비')), 'cheek contrast -> mid');
  assert(d.lower.some(s => s.includes('입술 혈색') && s.includes('뚜렷')), 'high lip contrast -> lower');
  assert(d.jaw.some(s => s.includes('광대') && s.includes('높')), 'high cheekbone -> jaw');
}

// ── unclear/저confidence는 상속 생략(빌더 규칙) ────────────────────────────
{
  const d = descriptors({
    eyelidType: {value: 'unclear', confidence: 0.9, evidence: 'x'},
    lipColorContrast: {value: 'high', confidence: 0.2, evidence: 'x'},
  });
  assert(d.upper.length === 0, 'unclear eyelid -> no descriptor');
  assert(d.lower.length === 0, 'low-confidence lip -> no descriptor');
}

// ── 무쌍 라벨 ──────────────────────────────────────────────────────────────
{
  const d = descriptors({eyelidType: ob('monolid')});
  assert(d.upper.some(s => s.includes('무쌍')), 'monolid -> 무쌍 label');
}

console.log('regionFeatureDescriptors: all assertions passed');
