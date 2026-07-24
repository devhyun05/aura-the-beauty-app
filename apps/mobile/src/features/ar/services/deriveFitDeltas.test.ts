import {deriveFitDeltas} from './deriveFitDeltas';
import {toFitEntries} from '../../../shared/contracts/personalFitProfile';
import {buildFaceFeatureProfile} from '../../face-analysis/services/faceFeatureProfileBuilder';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {FaceGeometryMetrics} from '../../face-geometry/types';
import type {FaceFeatureObservations} from '../../../shared/contracts/faceFeatureProfile';

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

function profileOf(args: {
  metricOverrides?: Record<string, number>;
  thirds?: {upper: number | null; middle: number; lower: number} | null;
  observations?: FaceFeatureObservations;
}) {
  return buildFaceFeatureProfile({
    metrics: metrics(args.metricOverrides ?? {}),
    verticalThirds: args.thirds ?? null,
    measuredAt: '2026-07-21T00:00:00.000Z',
    observations: args.observations,
  });
}

function ob(value: string) {
  return {value, confidence: 0.9, evidence: 'x'};
}

// rules 합치기(부위 무시)로 특정 필드값 찾기.
function ruleValue(entries: {rules: Record<string, number>}[], field: string): number {
  return entries.reduce((sum, e) => sum + (e.rules[field] ?? 0), 0);
}

// ── 기본 deltaScale=0 → 자동 적용 OFF(δ 전부 0) ────────────────────────────
{
  const p = profileOf({metricOverrides: {canthalTiltLeftDeg: -10, canthalTiltRightDeg: -10}});
  const fit = deriveFitDeltas(p, 'balance');
  // 구조(행)는 있지만 δ는 0.
  assert(fit.entries.length > 0, 'rows produced even when OFF');
  assert(ruleValue(fit.entries, 'eyeCornerLift') === 0, 'deltaScale 0 -> delta 0 (auto-apply OFF)');
  assert(toFitEntries(fit).length === 0, 'OFF -> no non-zero fit entries after strip');
}

// ── 처진 눈꼬리 → 윙·눈꼬리 리프트 양(+) ───────────────────────────────────
{
  const p = profileOf({metricOverrides: {canthalTiltLeftDeg: -10, canthalTiltRightDeg: -10}});
  const fit = deriveFitDeltas(p, 'balance', {deltaScale: 1});
  assert(ruleValue(fit.entries, 'eyeCornerLift') > 0, 'downturned -> eyeCornerLift +');
  assert(ruleValue(fit.entries, 'eyelinerWingLength') > 0, 'downturned -> wing +');
  const b = fit.entries.find(e => e.basis.source === 'eye.canthalTilt');
  assert(b?.basis.grade === 'B', 'canthalTilt row grade B');
}

// ── hooded → 가짜 크리스 높게(+) + 라인 얇게(−) ────────────────────────────
{
  const p = profileOf({observations: {eyelidType: ob('hooded')}});
  const fit = deriveFitDeltas(p, 'balance', {deltaScale: 1});
  assert(ruleValue(fit.entries, 'eyeshadowHeight') > 0, 'hooded -> eyeshadowHeight +');
  assert(ruleValue(fit.entries, 'eyelinerThickness') < 0, 'hooded -> eyeliner thinner (−)');
}
{
  // 상안검 처짐 pronounced도 hooded와 같은 처방
  const p = profileOf({observations: {upperLidHooding: ob('pronounced')}});
  const fit = deriveFitDeltas(p, 'balance', {deltaScale: 1});
  assert(ruleValue(fit.entries, 'eyeshadowHeight') > 0, 'pronounced hooding -> eyeshadowHeight +');
}

// ── 무쌍 → floating liner 바깥 연장(+) ─────────────────────────────────────
{
  const p = profileOf({observations: {eyelidType: ob('monolid')}});
  const fit = deriveFitDeltas(p, 'balance', {deltaScale: 1});
  assert(ruleValue(fit.entries, 'eyelinerWingLength') > 0, 'monolid -> wing +');
}

// ── 눈 세로:가로 확장 방향 반대 ────────────────────────────────────────────
{
  // 둥근 눈(openness high) → 가로 연장(wing +)
  const round = deriveFitDeltas(profileOf({metricOverrides: {eyeOpennessLeft: 0.5, eyeOpennessRight: 0.5}}), 'balance', {deltaScale: 1});
  assert(ruleValue(round.entries, 'eyelinerWingLength') > 0, 'round eye -> wing +');
  // E-7 확장: 둥근 눈 → 아래 라인 삼각존 트레이스 + 눈꼬리 밖 연장(가로 확장 하부 받침)
  assert(ruleValue(round.entries, 'eyelinerLowerTailTrace') > 0, 'round eye -> lower tail trace +');
  assert(ruleValue(round.entries, 'eyelinerLowerTailLen') > 0, 'round eye -> lower tail ext +');
  // 가는 눈(openness low) → 세로 리프트(eyeshadowHeight +), 윙 안 씀
  const narrow = deriveFitDeltas(profileOf({metricOverrides: {eyeOpennessLeft: 0.2, eyeOpennessRight: 0.2}}), 'balance', {deltaScale: 1});
  assert(ruleValue(narrow.entries, 'eyeshadowHeight') > 0, 'narrow eye -> eyeshadowHeight +');
  assert(ruleValue(narrow.entries, 'eyelinerWingLength') === 0, 'narrow eye -> no wing');
  assert(ruleValue(narrow.entries, 'eyelinerLowerTailTrace') === 0, 'narrow eye -> no lower trace');
}

// ── 애교살 있음 → 애교 강조 ────────────────────────────────────────────────
{
  const p = profileOf({observations: {aegyoSal: ob('present')}});
  const fit = deriveFitDeltas(p, 'balance', {deltaScale: 1});
  assert(ruleValue(fit.entries, 'aegyoHeight') > 0, 'aegyo present -> aegyoHeight +');
}

// ── 중안부 김 → 블러셔 고배치, youthful이 balance보다 강함 ──────────────────
{
  const thirds = {upper: 1.0, middle: 1.3, lower: 1.0};
  const bal = deriveFitDeltas(profileOf({thirds}), 'balance', {deltaScale: 1});
  const you = deriveFitDeltas(profileOf({thirds}), 'youthful', {deltaScale: 1});
  const balLift = ruleValue(bal.entries, 'blushLift');
  const youLift = ruleValue(you.entries, 'blushLift');
  assert(balLift > 0, 'long midface -> blushLift +');
  assert(youLift > balLift, 'youthful lane amplifies midface-shortening');
}

// ── accent 레인 → 형태 보정 없음(개성 보존) ────────────────────────────────
{
  const p = profileOf({
    metricOverrides: {canthalTiltLeftDeg: -10, canthalTiltRightDeg: -10},
    observations: {eyelidType: ob('hooded')},
  });
  const fit = deriveFitDeltas(p, 'accent', {deltaScale: 1});
  assert(fit.entries.length === 0, 'accent lane -> no shape-correction entries');
}

// ── 신뢰 밴드 없으면 행 생략(δ=0 아님) ─────────────────────────────────────
{
  const fit = deriveFitDeltas(profileOf({}), 'balance', {deltaScale: 1});
  assert(fit.entries.length === 0, 'no resolved bands -> no rows (omit, not zero)');
}

// ── toFitEntries 부위 병합 ─────────────────────────────────────────────────
{
  // hooded는 eyelinerUpper(thickness) + eyeshadow(height), canthalTilt down은
  // eyelinerUpper(cornerLift, wing) — eyelinerUpper 행이 병합돼야 한다.
  const p = profileOf({
    metricOverrides: {canthalTiltLeftDeg: -10, canthalTiltRightDeg: -10},
    observations: {eyelidType: ob('hooded')},
  });
  const stripped = toFitEntries(deriveFitDeltas(p, 'balance', {deltaScale: 1}));
  const eyeliner = stripped.find(e => e.region === 'eyelinerUpper');
  assert(eyeliner != null, 'eyelinerUpper region present');
  assert(
    'eyeCornerLift' in eyeliner!.rules &&
      'eyelinerWingLength' in eyeliner!.rules &&
      'eyelinerThickness' in eyeliner!.rules,
    'eyelinerUpper rules merged across rows',
  );
  assert(stripped.some(e => e.region === 'eyeshadow'), 'eyeshadow region present');
}

console.log('deriveFitDeltas: all assertions passed');
