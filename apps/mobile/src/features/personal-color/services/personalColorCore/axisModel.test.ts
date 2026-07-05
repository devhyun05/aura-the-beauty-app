// bug #2 (q 재정규화 + floor guard) 검증
import { aggregate, computeAxes } from './axisModel';
import type { RegionSignal, RegionSignals } from './axisModel';
import type { Lab } from './contracts';

function expectClose(actual: number, expected: number, epsilon: number, label: string) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}±${epsilon}, received ${actual}`);
  }
}
function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}
function expectNull(value: unknown, label: string) {
  if (value !== null) throw new Error(`${label}: expected null, received ${String(value)}`);
}

function signal(region: RegionSignal['region'], lab: Lab, qEff: number, sigma = 12): RegionSignal {
  return { region, lab, sigma, qEff };
}

export function runAxisModelTests() {
  // 전역 q 불변: 모든 qEff를 상수배해도 결과 동일 (naive Σwvq는 실패)
  const hi = aggregate([
    { w: 0.6, v: 0.5, qEff: 0.9 },
    { w: 0.4, v: -0.5, qEff: 0.9 },
  ]);
  const lo = aggregate([
    { w: 0.6, v: 0.5, qEff: 0.4 },
    { w: 0.4, v: -0.5, qEff: 0.4 },
  ]);
  expectTrue(hi.value != null && lo.value != null, 'aggregate values present');
  expectClose(hi.value as number, lo.value as number, 1e-9, 'global-q invariance');
  expectClose(hi.value as number, 0.1, 1e-9, 'aggregate expected value');

  // 부위 드롭 시 부호 유지: 모두 양수 → 한 부위 빠져도 양수, 0으로 안 감
  const full = aggregate([
    { w: 0.6, v: 0.8, qEff: 0.9 },
    { w: 0.1, v: 0.4, qEff: 0.9 },
    { w: 0.3, v: 0.5, qEff: 0.9 },
  ]);
  const dropped = aggregate([
    { w: 0.6, v: 0.8, qEff: 0.9 },
    { w: 0.3, v: 0.5, qEff: 0.9 },
  ]);
  expectTrue((full.value as number) > 0, 'full positive');
  expectTrue((dropped.value as number) > 0, 'dropped still positive (no sign collapse)');
  expectTrue((dropped.value as number) >= 0.5 && (dropped.value as number) <= 0.8, 'dropped within remaining range');

  // floor guard: Σ(w·qEff) < 0.35 → null
  const floored = aggregate([
    { w: 0.6, v: 0.9, qEff: 0.1 },
    { w: 0.4, v: 0.9, qEff: 0.1 },
  ]);
  expectNull(floored.value, 'floored value null');
  expectTrue(floored.floored, 'floored flag');

  // computeAxes floor: 전부 저신뢰 → 축 null
  const lowSignals: RegionSignals = {
    skin: signal('skin', { L: 70, a: 10, b: 12 }, 0.1),
    hair: signal('hair', { L: 15, a: 2, b: -3 }, 0.1),
    lip: signal('lip', { L: 46, a: 38, b: 9 }, 0.1),
  };
  const lowAxes = computeAxes(lowSignals).axes;
  expectNull(lowAxes.temperature.value, 'low temperature null');
  expectNull(lowAxes.value.value, 'low value null');
  expectTrue(lowAxes.temperature.floored, 'low temperature floored');

  // 정상 신뢰 → 축 present, [-1,1]
  const okSignals: RegionSignals = {
    skin: signal('skin', { L: 70, a: 10, b: 12 }, 0.85),
    hair: signal('hair', { L: 15, a: 2, b: -3 }, 0.85),
    lip: signal('lip', { L: 46, a: 38, b: 9 }, 0.85),
  };
  const okAxes = computeAxes(okSignals).axes;
  expectTrue(okAxes.temperature.value != null, 'ok temperature present');
  expectTrue(
    (okAxes.temperature.value as number) >= -1 && (okAxes.temperature.value as number) <= 1,
    'temperature in range',
  );

  // dropped-region (hair 없음) 시 contrast는 skin-lip으로 계산 (null 아님)
  const noHair: RegionSignals = {
    skin: signal('skin', { L: 70, a: 10, b: 12 }, 0.85),
    lip: signal('lip', { L: 46, a: 38, b: 9 }, 0.85),
  };
  const noHairAxes = computeAxes(noHair).axes;
  expectTrue(noHairAxes.contrast.value != null, 'contrast present without hair');

  console.log('[personal-color] axisModel tests passed');
}

runAxisModelTests();
