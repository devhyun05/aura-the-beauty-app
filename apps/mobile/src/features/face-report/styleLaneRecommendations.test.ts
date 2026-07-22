import {buildStyleLaneRecommendations} from './styleLaneRecommendations';
import {buildFaceFeatureProfile} from '../face-analysis/services/faceFeatureProfileBuilder';
import {buildVisualWeightMap} from '../face-analysis/services/visualWeightMap';
import {FACE_GEOMETRY_METRIC_KEYS} from '../face-geometry/types';
import type {FaceGeometryMetrics} from '../face-geometry/types';
import type {FaceFeatureObservations} from '../../shared/contracts/faceFeatureProfile';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

function metrics(overrides: Record<string, number>): FaceGeometryMetrics {
  const base = {} as Record<string, {unit: string; value: number | null; warnings: string[]}>;
  for (const k of FACE_GEOMETRY_METRIC_KEYS) {
    base[k] = {unit: k.endsWith('Deg') ? 'deg' : 'ratio', value: k in overrides ? overrides[k] : null, warnings: []};
  }
  return base as unknown as FaceGeometryMetrics;
}

function build(obs: FaceFeatureObservations, m: Record<string, number> = {}) {
  const profile = buildFaceFeatureProfile({
    metrics: metrics(m),
    measuredAt: '2026-07-21T00:00:00.000Z',
    observations: obs,
  });
  return buildStyleLaneRecommendations(profile, buildVisualWeightMap(profile));
}

function ob(value: string) {
  return {value, confidence: 0.9, evidence: 'x'};
}

// ── 항상 3레인, 고정 키 순서 ────────────────────────────────────────────────
{
  const lanes = build({});
  assert(lanes.length === 3, 'always 3 lanes');
  assert(lanes[0].laneKey === 'balance' && lanes[1].laneKey === 'youthful' && lanes[2].laneKey === 'accent', 'lane order balance/youthful/accent');
  assert(lanes.every(l => l.moves.length >= 3), 'each lane has moves');
  assert(lanes.every(l => l.chip && l.title && l.description), 'each lane has chip/title/description');
}

// ── accent: 우세 부위를 주인공으로 ─────────────────────────────────────────
{
  // 립 대비만 high → dominant lip
  const lanes = build({lipColorContrast: ob('high'), eyeContrast: ob('low')});
  const accent = lanes.find(l => l.laneKey === 'accent')!;
  assert(accent.title.includes('립'), 'lip dominant -> accent stars 립');
  assert(accent.moves[0].region === '립', 'accent emphasize move = dominant region');
}

// ── accent: 근거 부족이면 눈 기본 강조(W-4) ────────────────────────────────
{
  const lanes = build({}); // 관찰 없음 -> weight insufficient
  const accent = lanes.find(l => l.laneKey === 'accent')!;
  assert(accent.title.includes('눈'), 'insufficient -> default accent on 눈');
  assert(accent.description.includes('원포인트'), 'insufficient -> one-point framing');
}

// ── balance: 처진 눈꼬리면 눈 보정 문구 ────────────────────────────────────
{
  const lanes = build({}, {canthalTiltLeftDeg: -10, canthalTiltRightDeg: -10});
  const balance = lanes.find(l => l.laneKey === 'balance')!;
  const eyeMove = balance.moves.find(m => m.region === '눈')!;
  assert(eyeMove.note.includes('올려'), 'downturned canthal -> lift note in balance');
}

// ── youthful: 애교살 있으면 살리는 문구, 없으면 만들어주는 문구 ────────────
{
  const withAegyo = build({aegyoSal: ob('present')}).find(l => l.laneKey === 'youthful')!;
  assert(withAegyo.moves.some(m => m.note.includes('애교살을 살려')), 'aegyo present -> use existing aegyo');
  const noAegyo = build({aegyoSal: ob('absent')}).find(l => l.laneKey === 'youthful')!;
  assert(noAegyo.moves.some(m => m.note.includes('애교살 느낌')), 'aegyo absent -> add aegyo look');
}

// ── youthful: 중안부 김이면 특화 문구 ──────────────────────────────────────
{
  const lanes = build({}, {}); // verticalThirds 없음 -> 일반 문구
  const y = lanes.find(l => l.laneKey === 'youthful')!;
  assert(y.description.includes('중앙') || y.description.includes('중안부'), 'youthful describes midface strategy');
}

console.log('styleLaneRecommendations: all assertions passed');
