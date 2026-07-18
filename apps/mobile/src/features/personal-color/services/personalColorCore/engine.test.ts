// 엔진 통합 검증 (fixture 기반). bug #1/#2 산출 + status 게이팅.
import { analyzePersonalColor, combineSkinPatches } from './engine';
import { PERSONAL_COLOR_FIXTURES, requireFixture } from './fixtureInventory';
import { TYPE_TO_SEASON } from './constants';
import { PERSONAL_COLOR_SCHEMA_VERSION } from './contracts';

function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}
function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

// 시즌 단위 회귀 그물: 종전 테스트는 축 '부호'만 봤고 최종 tone.top 의 시즌은
// 한 번도 검증하지 않아, "전원 봄 라이트" 계통 오분류가 그물을 빠져나갔다.
// expectedSeason 이 확정된(cusp/none 아닌) 픽스처는 분류 시즌이 일치해야 한다.
function runSeasonNet() {
  const definite = PERSONAL_COLOR_FIXTURES.fixtures.filter(
    f => f.expectedSeason === 'spring' || f.expectedSeason === 'summer'
      || f.expectedSeason === 'autumn' || f.expectedSeason === 'winter',
  );
  for (const fx of definite) {
    const result = analyzePersonalColor(fx.native);
    expectTrue(result.tone != null, `${fx.fixtureId}: tone present for season net`);
    const gotSeason = TYPE_TO_SEASON[result.tone!.top];
    expectEqual(gotSeason, fx.expectedSeason, `${fx.fixtureId}: classified season (top=${result.tone!.top})`);
  }
}

// F4 회귀: 3 skin 패치는 같은 얼굴·같은 조명이라 강한 상관인데, 종전 확률적 OR
// (1-Π(1-c))는 독립 증거로 결합해 신뢰도를 부풀렸다(각 0.5 → 0.875). 가중 평균으로
// 바꿔 저품질 캡처가 mc 게이트를 자신 있게 통과하지 못하게 한다.
function runSkinConfidenceNet() {
  const patch = (confidence: number) => ({
    rgbMean: { r: 205, g: 172, b: 158 },
    rgbVariance: { r: 60, g: 60, b: 60 },
    dominant: { r: 205, g: 172, b: 158 },
    sampleCount: 800,
    areaRatio: 0.8,
    matteCoverage: 0.9,
    overexposedRatio: 0,
    underexposedRatio: 0,
    specularRejectedRatio: 0.05,
    confidence,
  });
  const native = (c: number) => ({
    status: 'ok' as const,
    faceCount: 1,
    colorSpace: 'srgb' as const,
    regions: { skinCheekLeft: patch(c), skinCheekRight: patch(c), skinForehead: patch(c) },
    warnings: [],
  });
  // 세 패치 모두 0.5 → 합성도 0.5 근방 (종전 OR은 0.875로 부풀렸다)
  const combined = combineSkinPatches(native(0.5))!;
  expectTrue(
    combined.confidence >= 0.45 && combined.confidence <= 0.55,
    `combined skin confidence averages (got ${combined.confidence})`,
  );
}

// F9 회귀: 립 메이크업(고채도 립)은 temperature(30%)·chroma(55%) 축을 오염시킨다.
// 다만 비비드한 입술은 winter 의 자연 특징이기도 해(픽스처 bright_clear_winter lip
// C*≈68) 채도만으로 립스틱과 구분되지 않는다 → 측정을 조용히 바꾸지 않고 advisory
// 경고만 남겨(계측 가능한 경고 원칙) 소비처가 신중히 해석하게 한다.
function runLipMakeupNet() {
  const region = (rgb: { r: number; g: number; b: number }, over = {}) => ({
    rgbMean: rgb, rgbVariance: { r: 60, g: 60, b: 60 }, dominant: rgb,
    sampleCount: 800, areaRatio: 0.8, matteCoverage: 0.9,
    overexposedRatio: 0, underexposedRatio: 0, specularRejectedRatio: 0.05, confidence: 0.85, ...over,
  });
  const withLip = (lip: { r: number; g: number; b: number }) => ({
    status: 'ok' as const, faceCount: 1, colorSpace: 'srgb' as const,
    regions: {
      skinCheekLeft: region({ r: 205, g: 172, b: 158 }),
      skinCheekRight: region({ r: 205, g: 172, b: 158 }),
      skinForehead: region({ r: 205, g: 172, b: 158 }),
      hair: region({ r: 35, g: 32, b: 36 }),
      lip: region(lip, { matteCoverage: 1 }),
    },
    warnings: [],
  });
  // 비비드 레드 립스틱(C*≈74) → 경고 present
  const vivid = analyzePersonalColor(withLip({ r: 200, g: 30, b: 45 }));
  expectTrue(vivid.warnings.includes('lip_makeup_suspected'), 'vivid lip → makeup suspected warning');
  // 자연 뮤트 입술(C*≈17) → 경고 없음
  const muted = analyzePersonalColor(withLip({ r: 150, g: 110, b: 110 }));
  expectTrue(!muted.warnings.includes('lip_makeup_suspected'), 'muted lip → no makeup warning');
}

export function runEngineTests() {
  runSeasonNet();
  runSkinConfidenceNet();
  runLipMakeupNet();

  // bug #1 센터링: value/chroma가 실제로 부호를 가짐
  const summer = analyzePersonalColor(requireFixture('light_cool_summer').native);
  expectTrue((summer.axes.value.value as number) < 0, 'light_cool_summer value < 0 (light)');
  expectTrue((summer.axes.temperature.value as number) < 0, 'light_cool_summer temperature < 0 (cool)');

  const autumn = analyzePersonalColor(requireFixture('deep_warm_autumn').native);
  expectTrue((autumn.axes.value.value as number) > 0, 'deep_warm_autumn value > 0 (deep)');
  expectTrue((autumn.axes.temperature.value as number) > 0, 'deep_warm_autumn temperature > 0 (warm)');

  const muted = analyzePersonalColor(requireFixture('muted_soft_summer').native);
  expectTrue((muted.axes.chroma.value as number) < 0, 'muted_soft_summer chroma < 0');

  const winter = analyzePersonalColor(requireFixture('bright_clear_winter').native);
  expectTrue((winter.axes.chroma.value as number) > 0, 'bright_clear_winter chroma > 0');

  // 결과 계약
  expectEqual(summer.schemaVersion, PERSONAL_COLOR_SCHEMA_VERSION, 'schemaVersion');
  expectEqual(summer.colorFrame, 'device-relative-awb-locked', 'colorFrame relative');
  expectEqual(summer.privacy.localOnly, true, 'privacy localOnly');
  expectEqual(summer.privacy.offDeviceUpload, false, 'privacy offDeviceUpload');
  expectTrue(summer.deferredRegions[0] === 'eye', 'eye deferred');
  expectEqual(summer.preCalibrationHedge, true, 'preCalibrationHedge default true');
  expectTrue(summer.tone == null || summer.status !== 'definitive', 'no definitive before calibration');
  for (const axis of Object.values(summer.axes)) {
    expectTrue(axis.basis === 'within-frame-relative', 'axis basis relative');
  }

  // bug #2 floor: 전부 저신뢰 → insufficient, tone null, 축 null
  const low = analyzePersonalColor(requireFixture('low_confidence_all').native);
  expectEqual(low.status, 'insufficient', 'low_confidence status insufficient');
  expectEqual(low.tone, null, 'low_confidence tone null');
  expectEqual(low.axes.temperature.value, null, 'low_confidence temperature null');
  expectTrue(low.measurementConfidence < 0.45, 'low_confidence mc < usable');

  // hair 없어도 동작
  const noHair = analyzePersonalColor(requireFixture('hair_missing').native);
  expectTrue(noHair.warnings.includes('hair_missing'), 'hair_missing warning');
  expectTrue(noHair.axes.temperature.value != null, 'temperature present without hair');

  // 과노출 경고 + qEff 하락
  const over = analyzePersonalColor(requireFixture('overexposed_skin').native);
  const skinM = over.regions.find(r => r.region === 'skin');
  expectTrue(!!skinM && skinM.warnings.includes('skin_overexposed'), 'skin_overexposed warning');
  expectTrue(!!skinM && skinM.qEff < skinM.qNative, 'exposure penalty lowers qEff');

  // 보정셋 적용 시 definitive 가능 (mc 충분 가정)
  const calibrated = analyzePersonalColor(requireFixture('deep_warm_autumn').native, {
    calibrationApplied: true,
    calibrationVersion: 'test-cal-v1',
    frameCount: 3,
  });
  expectEqual(calibrated.calibrationApplied, true, 'calibrationApplied true');
  expectEqual(calibrated.preCalibrationHedge, false, 'preCalibrationHedge false when calibrated');

  console.log('[personal-color] engine tests passed');
}

runEngineTests();
