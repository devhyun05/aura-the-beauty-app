import {buildVisualWeightPresentation} from './visualWeightPresentation';
import type {VisualWeightMap} from '../../shared/contracts/visualWeightMap';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

function map(overrides: Partial<VisualWeightMap>): VisualWeightMap {
  return {
    schemaVersion: 'aura-visual-weight.v0',
    weightMappingVersion: 'weights-v0-provisional',
    weights: {},
    dominantRegion: 'insufficient',
    contrastLevel: null,
    coverage: 0,
    basis: [],
    ...overrides,
  };
}

// ── 근거 부족 → null(블록 숨김) ────────────────────────────────────────────
{
  assert(buildVisualWeightPresentation(map({})) === null, 'coverage 0 -> null');
  assert(
    buildVisualWeightPresentation(
      map({coverage: 1, weights: {lip: 1}, dominantRegion: 'insufficient'}),
    ) === null,
    'insufficient -> null',
  );
}

// ── 우세 부위 → headline + 정렬된 막대 ─────────────────────────────────────
{
  const p = buildVisualWeightPresentation(
    map({
      coverage: 4,
      weights: {eye: 0.4, brow: 0.2, cheek: 0.1, lip: 0.3},
      dominantRegion: 'eye',
      contrastLevel: 'high',
    }),
  );
  assert(p !== null, 'resolved -> present');
  assert(p!.headline.includes('눈매'), 'dominant eye -> 눈매 in headline');
  assert(p!.regions[0].label === '눈매' && p!.regions[0].dominant, 'top region is dominant eye');
  assert(p!.regions[0].percent === 40, 'eye percent 40');
  assert(p!.regions[1].label === '입술', 'second is lip (sorted desc)');
  assert(p!.contrastLine !== null && p!.contrastLine.includes('또렷'), 'high contrast -> 또렷');
}

// ── 균형 → headline만, 우세 강조 없음 ──────────────────────────────────────
{
  const p = buildVisualWeightPresentation(
    map({
      coverage: 2,
      weights: {eye: 0.5, lip: 0.5},
      dominantRegion: 'balanced',
      contrastLevel: 'low',
    }),
  );
  assert(p!.headline.includes('고르게'), 'balanced -> 고르게 분포');
  assert(p!.regions.every(r => !r.dominant), 'balanced -> no dominant region');
  assert(p!.contrastLine!.includes('부드러운'), 'low contrast -> 부드러운');
}

// ── 미해소 부위는 막대에서 제외 ────────────────────────────────────────────
{
  const p = buildVisualWeightPresentation(
    map({
      coverage: 2,
      weights: {eye: 0.6, lip: 0.4},
      dominantRegion: 'eye',
      contrastLevel: 'medium',
    }),
  );
  assert(p!.regions.length === 2, 'only resolved regions shown');
  assert(!p!.regions.some(r => r.label === '눈썹'), 'unresolved brow absent from bars');
  assert(p!.contrastLine!.includes('균형'), 'medium contrast -> 균형');
}

console.log('visualWeightPresentation: all assertions passed');
