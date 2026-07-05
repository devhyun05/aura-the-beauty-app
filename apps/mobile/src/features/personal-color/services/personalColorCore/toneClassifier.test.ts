// bug #3 (softmax τ + 확률공간 앵커) + 구조 검증
import { ALL_12_TYPES, CLASSIFIER, PROTOTYPES, PROTOTYPE_ORDER, TYPE_TO_SEASON } from './constants';
import { computeTone, weightedDistance } from './toneClassifier';
import type { AuraAxis, AxisName, PersonalColor12Type } from './contracts';

function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}
function expectClose(actual: number, expected: number, epsilon: number, label: string) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}±${epsilon}, received ${actual}`);
  }
}

function axesFrom(vec: [number, number, number, number, number]): Record<AxisName, AuraAxis> {
  const out = {} as Record<AxisName, AuraAxis>;
  PROTOTYPE_ORDER.forEach((name, i) => {
    out[name] = { value: vec[i], confidence: 0.9, floored: false, basis: 'within-frame-relative' };
  });
  return out;
}
function midpoint(
  a: [number, number, number, number, number],
  b: [number, number, number, number, number],
): [number, number, number, number, number] {
  return [0, 1, 2, 3, 4].map(i => (a[i] + b[i]) / 2) as [number, number, number, number, number];
}

export function runToneClassifierTests() {
  // 구조: 12개, 5축 [-1,1], 4시즌×3, 최소 쌍거리>0
  expectTrue(ALL_12_TYPES.length === 12, '12 prototypes');
  const seasonCounts: Record<string, number> = {};
  for (const t of ALL_12_TYPES) {
    const coords = PROTOTYPES[t];
    expectTrue(coords.length === 5, `${t} has 5 axes`);
    for (const c of coords) expectTrue(c >= -1 && c <= 1, `${t} axis in range`);
    seasonCounts[TYPE_TO_SEASON[t]] = (seasonCounts[TYPE_TO_SEASON[t]] ?? 0) + 1;
  }
  for (const s of ['spring', 'summer', 'autumn', 'winter']) {
    expectTrue(seasonCounts[s] === 3, `${s} has 3 subtypes`);
  }
  let minPair = Infinity;
  for (let i = 0; i < ALL_12_TYPES.length; i++) {
    for (let j = i + 1; j < ALL_12_TYPES.length; j++) {
      const present: Partial<Record<AxisName, number>> = {};
      PROTOTYPE_ORDER.forEach((n, k) => (present[n] = PROTOTYPES[ALL_12_TYPES[i]][k]));
      const d = weightedDistance(present, PROTOTYPES[ALL_12_TYPES[j]]);
      minPair = Math.min(minPair, d);
    }
  }
  expectTrue(minPair > 0, 'all prototypes distinct');

  // 프로토타입 좌표 그대로 입력 → 해당 타입이 top, gap 확보
  const bright = computeTone(axesFrom(PROTOTYPES.winter_bright));
  expectTrue(bright != null, 'winter_bright tone computed');
  expectTrue((bright as { top: PersonalColor12Type }).top === 'winter_bright', 'winter_bright is top');
  expectTrue((bright as { gap: number }).gap >= CLASSIFIER.mixedGap, 'winter_bright gap >= MIXED_GAP');

  // 확률 합 = 1
  const probSum = ALL_12_TYPES.reduce((a, t) => a + (bright as { probabilities: Record<string, number> }).probabilities[t], 0);
  expectClose(probSum, 1, 1e-6, 'probabilities sum to 1');

  // cusp (두 프로토타입 중점) → isMixed, top-2 안정 (τ 스윕)
  const cuspVec = midpoint(PROTOTYPES.spring_bright, PROTOTYPES.spring_true);
  const cuspSet = new Set<string>();
  for (const tau of [0.15, 0.3, 0.6]) {
    const tone = computeTone(axesFrom(cuspVec), { tau });
    expectTrue(tone != null, `cusp tone at τ=${tau}`);
    const t = tone as { isMixed: boolean; top: string; secondary: string | null };
    expectTrue(t.isMixed, `cusp isMixed at τ=${tau}`);
    cuspSet.add(t.top);
    if (t.secondary) cuspSet.add(t.secondary);
  }
  const allowed = new Set(['spring_bright', 'spring_true']);
  for (const t of cuspSet) expectTrue(allowed.has(t), `cusp top-2 ⊂ {spring_bright, spring_true}: got ${t}`);

  // τ↑ → gap 단조 감소 (선명 케이스)
  const g15 = (computeTone(axesFrom(PROTOTYPES.winter_bright), { tau: 0.15 }) as { gap: number }).gap;
  const g30 = (computeTone(axesFrom(PROTOTYPES.winter_bright), { tau: 0.3 }) as { gap: number }).gap;
  const g60 = (computeTone(axesFrom(PROTOTYPES.winter_bright), { tau: 0.6 }) as { gap: number }).gap;
  expectTrue(g15 > g30 && g30 > g60, `gap decreases with τ: ${g15} > ${g30} > ${g60}`);

  // 축 3개 미만 → null
  const sparse = axesFrom([0.5, 0.5, 0.5, 0.5, 0.5]);
  sparse.chroma = { value: null, confidence: 0, floored: true, basis: 'within-frame-relative' };
  sparse.clarity = { value: null, confidence: 0, floored: true, basis: 'within-frame-relative' };
  sparse.contrast = { value: null, confidence: 0, floored: true, basis: 'within-frame-relative' };
  expectTrue(computeTone(sparse) === null, 'sparse axes → null tone');

  console.log('[personal-color] toneClassifier tests passed');
}

runToneClassifierTests();
