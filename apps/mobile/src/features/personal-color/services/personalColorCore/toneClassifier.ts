// 12톤 분류. bug #3 수정: softmax에 명시적 temperature τ, 걸침 임계값은
// 확률공간(scale-stable). null 축은 거리 계산에서 드롭 후 Σω 재정규화.

import { clamp } from './colorMath';
import {
  ALL_12_TYPES,
  AXIS_RELIABILITY,
  CLASSIFIER,
  PROTOTYPE_ORDER,
  PROTOTYPES,
  TYPE_TO_SEASON,
} from './constants';
import type { AuraAxis, AxisName, PersonalColor12Type, ToneResult } from './contracts';

export type ToneOptions = {
  tau?: number;
};

function presentAxisValues(axes: Record<AxisName, AuraAxis>): Partial<Record<AxisName, number>> {
  const out: Partial<Record<AxisName, number>> = {};
  for (const name of PROTOTYPE_ORDER) {
    const axis = axes[name];
    if (axis && axis.value != null) out[name] = axis.value;
  }
  return out;
}

// 존재하는 축만, Σω로 재정규화한 가중 유클리드 거리
export function weightedDistance(
  present: Partial<Record<AxisName, number>>,
  proto: [number, number, number, number, number],
): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < PROTOTYPE_ORDER.length; i++) {
    const name = PROTOTYPE_ORDER[i];
    const x = present[name];
    if (x == null) continue;
    const w = AXIS_RELIABILITY[name];
    const diff = x - proto[i];
    num += w * diff * diff;
    den += w;
  }
  if (den === 0) return Number.POSITIVE_INFINITY;
  return Math.sqrt(num / den);
}

export function computeTone(axes: Record<AxisName, AuraAxis>, options: ToneOptions = {}): ToneResult | null {
  const tau = options.tau ?? CLASSIFIER.tau0;
  const present = presentAxisValues(axes);
  const presentCount = Object.keys(present).length;
  // 축이 2개 미만이면 분류 불가
  if (presentCount < 3) return null;

  const distances = {} as Record<PersonalColor12Type, number>;
  for (const type of ALL_12_TYPES) {
    distances[type] = weightedDistance(present, PROTOTYPES[type]);
  }

  // softmax(-d/τ) — 수치 안정 위해 최소 d 기준으로 shift
  const minD = Math.min(...ALL_12_TYPES.map(t => distances[t]));
  let sumExp = 0;
  const expScore = {} as Record<PersonalColor12Type, number>;
  for (const type of ALL_12_TYPES) {
    const e = Math.exp(-(distances[type] - minD) / tau);
    expScore[type] = e;
    sumExp += e;
  }
  const probabilities = {} as Record<PersonalColor12Type, number>;
  for (const type of ALL_12_TYPES) {
    probabilities[type] = expScore[type] / sumExp;
  }

  const ranked = [...ALL_12_TYPES].sort((a, b) => probabilities[b] - probabilities[a]);
  const top = ranked[0];
  const secondaryCandidate = ranked[1];
  const gap = probabilities[top] - probabilities[secondaryCandidate];
  const isMixed = gap < CLASSIFIER.mixedGap;
  const showSecondary = isMixed || probabilities[secondaryCandidate] >= CLASSIFIER.secondaryMin;

  return {
    top,
    secondary: showSecondary ? secondaryCandidate : null,
    isMixed,
    typeScore: probabilities[top],
    gap,
    tau,
    probabilities,
    distances,
    season: TYPE_TO_SEASON[top],
  };
}

// 축 벡터가 뉴트럴에 가까운지 (top 확률이 낮음) — engine이 status 판정에 사용
export function isBelowNeutral(tone: ToneResult): boolean {
  return tone.typeScore < CLASSIFIER.neutralMin;
}

export { clamp };
