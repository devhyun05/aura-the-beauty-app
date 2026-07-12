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

  // hair 없으면 contrast는 null (lip 단독은 시즌을 뒤집어 신뢰 불가 → 분류에서 드롭)
  const noHair: RegionSignals = {
    skin: signal('skin', { L: 70, a: 10, b: 12 }, 0.85),
    lip: signal('lip', { L: 46, a: 38, b: 9 }, 0.85),
  };
  const noHairAxes = computeAxes(noHair).axes;
  expectNull(noHairAxes.contrast.value, 'contrast null without hair');
  // 그래도 나머지 축(temperature/value/chroma/clarity)은 계산됨
  expectTrue(noHairAxes.temperature.value != null, 'temperature present without hair');
  expectTrue(noHairAxes.clarity.value != null, 'clarity present without hair (skin+lip chroma)');

  // 저신뢰 lip이 대비축 전체를 veto하지 못한다(필수 pair skin·hair 신뢰만 반영)
  const weakLip: RegionSignals = {
    skin: signal('skin', { L: 66, a: 11, b: 14 }, 0.85),
    hair: signal('hair', { L: 16, a: 2, b: -1 }, 0.85),
    lip: signal('lip', { L: 48, a: 40, b: 12 }, 0.05),
  };
  const weakLipAxes = computeAxes(weakLip).axes;
  expectTrue(weakLipAxes.contrast.value != null, 'contrast survives weak lip (no veto)');

  // --- 회귀: 대비/맑기 pinning 방지 (검은 머리라고 모두가 +1로 박히면 안 됨) ---
  // 저대비 얼굴: 피부-머리 명도차 작음(갈색 머리) + 뮤트 입술.
  const lowContrast = computeAxes({
    skin: signal('skin', { L: 58, a: 12, b: 15 }, 0.85),
    hair: signal('hair', { L: 42, a: 5, b: 8 }, 0.85),
    lip: signal('lip', { L: 50, a: 20, b: 12 }, 0.85),
  }).axes;
  // 고대비 얼굴: 밝은 피부 + 검은 머리 + 선명 입술.
  const highContrast = computeAxes({
    skin: signal('skin', { L: 70, a: 10, b: 14 }, 0.85),
    hair: signal('hair', { L: 12, a: 1, b: -2 }, 0.85),
    lip: signal('lip', { L: 46, a: 45, b: 18 }, 0.85),
  }).axes;
  expectTrue(
    lowContrast.contrast.value != null && highContrast.contrast.value != null,
    'contrast present both faces',
  );
  expectTrue(
    (highContrast.contrast.value as number) > (lowContrast.contrast.value as number) + 0.2,
    'contrast separates high vs low face',
  );
  expectTrue(
    (lowContrast.contrast.value as number) < 0.95,
    'low-contrast face contrast NOT pinned at +1 (un-pinning)',
  );

  // 맑기: 채도 선명함에 따라 갈라지고, 뮤트 얼굴이 클리어로 박히지 않음.
  const mutedFace = computeAxes({
    skin: signal('skin', { L: 62, a: 10, b: 13 }, 0.85),
    hair: signal('hair', { L: 20, a: 2, b: 0 }, 0.85),
    lip: signal('lip', { L: 52, a: 14, b: 10 }, 0.85),
  }).axes;
  const vividFace = computeAxes({
    skin: signal('skin', { L: 62, a: 16, b: 20 }, 0.85),
    hair: signal('hair', { L: 20, a: 2, b: 0 }, 0.85),
    lip: signal('lip', { L: 46, a: 50, b: 22 }, 0.85),
  }).axes;
  expectTrue(
    mutedFace.clarity.value != null && vividFace.clarity.value != null,
    'clarity present both faces',
  );
  expectTrue(
    (vividFace.clarity.value as number) > (mutedFace.clarity.value as number) + 0.15,
    'clarity separates vivid vs muted face',
  );
  expectTrue(
    (mutedFace.clarity.value as number) < 0.95,
    'muted face clarity NOT pinned high (un-pinning)',
  );

  console.log('[personal-color] axisModel tests passed');
}

runAxisModelTests();
