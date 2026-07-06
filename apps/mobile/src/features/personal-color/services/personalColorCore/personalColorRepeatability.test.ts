// Phase 2 재현성 게이트 검증: 안정→pass, 시즌flip→fail, 타입flip(시즌안정)→marginal, 축분산 수식
import { computeRepeatability } from './personalColorRepeatability';
import type { RepeatabilitySample } from './personalColorRepeatability';
import type { AxisName, PersonalColor12Type } from './contracts';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}
function expectClose(actual: number, expected: number, epsilon: number, label: string) {
  if (Math.abs(actual - expected) > epsilon) throw new Error(`${label}: expected ${expected}±${epsilon}, received ${actual}`);
}
function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}

function s(
  vec: [number | null, number | null, number | null, number | null, number | null],
  topType: PersonalColor12Type | null,
  usable = true,
  hairPresent = true,
  skinPresent = true,
): RepeatabilitySample {
  const axes = {} as Record<AxisName, number | null>;
  axes.temperature = vec[0];
  axes.value = vec[1];
  axes.chroma = vec[2];
  axes.clarity = vec[3];
  axes.contrast = vec[4];
  return { axes, topType, usable, hairPresent, skinPresent };
}

const V: [number, number, number, number, number] = [0.5, -0.3, 0.4, 0.5, 0.3];

export function runRepeatabilityTests() {
  // 안정: 5회 동일 → pass, stdev 0, flip 0
  const stable = computeRepeatability(Array.from({ length: 5 }, () => s(V, 'spring_bright')));
  expectEqual(stable.verdict, 'pass', 'stable → pass');
  expectClose(stable.axes.temperature.stdev ?? -1, 0, 1e-9, 'stable temp stdev 0');
  expectEqual(stable.topTypeFlipRate, 0, 'stable no type flip');
  expectEqual(stable.seasonFlipRate, 0, 'stable no season flip');
  expectEqual(stable.matteHitRate.hair, 1, 'stable hair hit 1');

  // 시즌 flip → fail (동일 캡처가 시즌을 뒤집으면 신뢰 불가)
  const seasonFlip = computeRepeatability([
    s(V, 'spring_bright'),
    s(V, 'winter_deep'),
    s(V, 'spring_bright'),
    s(V, 'winter_deep'),
    s(V, 'spring_true'),
  ]);
  expectEqual(seasonFlip.verdict, 'fail', 'season flip → fail');
  expectTrue(seasonFlip.reasons.includes('season_flips'), 'season_flips reason');

  // 타입 flip이지만 시즌 안정 → marginal
  const typeFlip = computeRepeatability([
    s(V, 'spring_bright'),
    s(V, 'spring_true'),
    s(V, 'spring_light'),
    s(V, 'spring_bright'),
    s(V, 'spring_true'),
    s(V, 'spring_light'),
  ]);
  expectEqual(typeFlip.verdict, 'marginal', 'type flip season-stable → marginal');
  expectTrue(typeFlip.reasons.includes('fine_type_flips'), 'fine_type_flips reason');
  expectEqual(typeFlip.seasonFlipRate, 0, 'type flip season stable');

  // 축 분산 수식: temperature [0, 0.2, 0.4]
  const axisSet = computeRepeatability([
    s([0.0, -0.3, 0.4, 0.5, 0.3], 'spring_bright'),
    s([0.2, -0.3, 0.4, 0.5, 0.3], 'spring_bright'),
    s([0.4, -0.3, 0.4, 0.5, 0.3], 'spring_bright'),
  ]);
  expectClose(axisSet.axes.temperature.mean ?? -9, 0.2, 1e-9, 'temp mean');
  expectClose(axisSet.axes.temperature.stdev ?? -9, Math.sqrt(0.08 / 3), 1e-9, 'temp stdev (pop)');
  expectClose(axisSet.axes.temperature.spread ?? -9, 0.4, 1e-9, 'temp spread');

  // usable 비율 낮음 → fail
  const lowUsable = computeRepeatability([
    s(V, 'spring_bright', true),
    s(V, null, false),
    s(V, null, false),
    s(V, null, false),
    s(V, null, false),
  ]);
  expectEqual(lowUsable.verdict, 'fail', 'low usable → fail');
  expectTrue(lowUsable.reasons.includes('low_usable_fraction'), 'low_usable reason');

  // load-bearing 축 불안정 → fail
  const unstable = computeRepeatability([
    s([-0.8, 0.0, 0, 0, 0], 'spring_bright'),
    s([0.8, 0.0, 0, 0, 0], 'spring_bright'),
    s([-0.7, 0.0, 0, 0, 0], 'spring_bright'),
    s([0.7, 0.0, 0, 0, 0], 'spring_bright'),
  ]);
  expectEqual(unstable.verdict, 'fail', 'unstable axis → fail');
  expectTrue(unstable.reasons.includes('load_bearing_axis_unstable'), 'unstable reason');

  // 헤어 matte hit-rate 낮음 → marginal
  const matteLow = computeRepeatability([
    s(V, 'spring_bright', true, false),
    s(V, 'spring_bright', true, false),
    s(V, 'spring_bright', true, false),
    s(V, 'spring_bright', true, false),
    s(V, 'spring_bright', true, true),
  ]);
  expectEqual(matteLow.verdict, 'marginal', 'hair matte low → marginal');
  expectTrue(matteLow.reasons.includes('hair_matte_low_hit_rate'), 'hair matte reason');
  expectClose(matteLow.matteHitRate.hair, 0.2, 1e-9, 'hair hit 0.2');

  // 표본 부족 → fail
  const single = computeRepeatability([s(V, 'spring_bright')]);
  expectEqual(single.verdict, 'fail', 'single sample → fail');
  expectTrue(single.reasons.includes('too_few_samples'), 'too_few reason');

  // 단일 시즌 flip(5회 중 1회)도 fail — 작은 N에서 임계값에 숨지 않게 (false-pass 방어)
  const singleSeasonFlip = computeRepeatability([
    s(V, 'spring_bright'),
    s(V, 'spring_bright'),
    s(V, 'spring_bright'),
    s(V, 'spring_bright'),
    s(V, 'winter_deep'),
  ]);
  expectEqual(singleSeasonFlip.verdict, 'fail', 'single season flip → fail (strict)');
  expectTrue(singleSeasonFlip.reasons.includes('season_flips'), 'single season flip reason');

  // 정확히 50% 세부 타입 불일치 → marginal (경계 포함 >=)
  const halfTypeFlip = computeRepeatability([
    s(V, 'spring_bright'),
    s(V, 'spring_bright'),
    s(V, 'spring_light'),
    s(V, 'spring_light'),
  ]);
  expectEqual(halfTypeFlip.verdict, 'marginal', '50% type flip → marginal');
  expectClose(halfTypeFlip.topTypeFlipRate ?? -1, 0.5, 1e-9, 'type flip rate 0.5');
  expectTrue(halfTypeFlip.reasons.includes('fine_type_flips'), '50% type flip reason');

  // chroma(비-load-bearing) 불안정도 marginal로 잡음 (1c 방어)
  const chromaNoise = computeRepeatability([
    s([0, 0, 0.0, 0, 0], 'spring_bright'),
    s([0, 0, 0.5, 0, 0], 'spring_bright'),
    s([0, 0, 1.0, 0, 0], 'spring_bright'),
  ]);
  expectEqual(chromaNoise.verdict, 'marginal', 'chroma instability → marginal');
  expectTrue(chromaNoise.reasons.includes('axis_moderately_noisy'), 'chroma noise reason');

  console.log('[personal-color] repeatability tests passed');
}

runRepeatabilityTests();
