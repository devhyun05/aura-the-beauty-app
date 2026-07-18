// illuminationCorrection 검증: von Kries 복원성(핵심), 소스 선택, 게이트/캡, WB 방향.
import { deltaE00, linearToSrgb8, rgb8ToLab, srgb8ToLinear } from './colorMath';
import {
  deriveIlluminationCorrection,
  ILLUMINATION_CORRECTION,
} from './illuminationCorrection';
import type { ChannelGains } from './illuminationCorrection';
import type { NativePersonalColorResult, NativeRegionStats, Rgb } from './contracts';

function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}
function expectClose(actual: number, expected: number, epsilon: number, label: string) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}±${epsilon}, received ${actual}`);
  }
}

function stats(rgb: Rgb, overrides: Partial<NativeRegionStats> = {}): NativeRegionStats {
  return {
    rgbMean: rgb,
    rgbVariance: { r: 60, g: 60, b: 60 },
    dominant: rgb,
    sampleCount: 800,
    areaRatio: 0.8,
    matteCoverage: 0.9,
    overexposedRatio: 0,
    underexposedRatio: 0,
    specularRejectedRatio: 0.05,
    confidence: 0.85,
    ...overrides,
  };
}

function base(regions: NativePersonalColorResult['regions']): NativePersonalColorResult {
  return {
    status: 'ok',
    faceCount: 1,
    landmarkCount: 478,
    imageWidth: 1080,
    imageHeight: 1440,
    colorSpace: 'srgb',
    matte: { skinAvailable: true, hairAvailable: true, matteWidth: 512, matteHeight: 682 },
    regions,
    warnings: [],
  };
}

// 선형 공간에서 캐스트(조명) 게인을 곱해 "캐스트 낀 촬영"을 합성
function castRgb(rgb: Rgb, cast: ChannelGains): Rgb {
  return {
    r: linearToSrgb8(Math.min(1, srgb8ToLinear(rgb.r) * cast.r)),
    g: linearToSrgb8(Math.min(1, srgb8ToLinear(rgb.g) * cast.g)),
    b: linearToSrgb8(Math.min(1, srgb8ToLinear(rgb.b) * cast.b)),
  };
}

const CLEAN_SKIN: Rgb = { r: 197, g: 172, b: 159 };
const CLEAN_HAIR: Rgb = { r: 40, g: 35, b: 34 };
const CLEAN_LIP: Rgb = { r: 172, g: 96, b: 100 };
// 중립광 아래 "기준 흰자" — scleraReferenceRgb와 일치해야 항등/복원 성질이 성립
const CLEAN_SCLERA: Rgb = { ...ILLUMINATION_CORRECTION.scleraReferenceRgb };

function faceWithCast(cast: ChannelGains, scleraOverrides: Partial<NativeRegionStats> = {}) {
  const skin = castRgb(CLEAN_SKIN, cast);
  return base({
    skinCheekLeft: stats(skin),
    skinCheekRight: stats(skin),
    skinForehead: stats(skin),
    hair: stats(castRgb(CLEAN_HAIR, cast)),
    lip: stats(castRgb(CLEAN_LIP, cast), { matteCoverage: 1 }),
    scleraLeft: stats(castRgb(CLEAN_SCLERA, cast), { sampleCount: 120, ...scleraOverrides }),
    scleraRight: stats(castRgb(CLEAN_SCLERA, cast), { sampleCount: 120, ...scleraOverrides }),
  });
}

export function runIlluminationCorrectionTests() {
  const IDENTITY: ChannelGains = { r: 1, g: 1, b: 1 };

  // 0. linear↔sRGB 왕복 (모듈이 의존하는 역변환의 정합)
  for (const v of [0, 8, 64, 128, 200, 255]) {
    expectClose(linearToSrgb8(srgb8ToLinear(v)), v, 0.51, `srgb round-trip ${v}`);
  }

  // 1. 캐스트 없음 + 중립 흰자 → 게인 ≈ 1 (해도 무해)
  const neutral = deriveIlluminationCorrection(faceWithCast(IDENTITY));
  expectTrue(neutral.report.applied, 'neutral: applied');
  expectTrue(neutral.report.source === 'sclera', 'neutral: sclera source');
  expectClose(neutral.report.gains!.r, 1, 0.02, 'neutral gain r');
  expectClose(neutral.report.gains!.b, 1, 0.02, 'neutral gain b');

  // 2. 핵심 — 웜 캐스트 복원성: 흰자 기반 보정이 원래 피부색을 되찾는다
  const WARM: ChannelGains = { r: 1.15, g: 1.0, b: 0.82 };
  const warm = deriveIlluminationCorrection(faceWithCast(WARM));
  expectTrue(warm.report.applied && warm.report.source === 'sclera', 'warm: sclera applied');
  const castSkinLab = rgb8ToLab(castRgb(CLEAN_SKIN, WARM));
  const cleanSkinLab = rgb8ToLab(CLEAN_SKIN);
  const correctedSkinLab = rgb8ToLab(warm.correctedNative!.regions!.skinCheekLeft!.rgbMean);
  const dCast = deltaE00(cleanSkinLab, castSkinLab);
  const dCorrected = deltaE00(cleanSkinLab, correctedSkinLab);
  expectTrue(dCast > 4, `warm cast visibly shifts skin (dE=${dCast.toFixed(2)})`);
  expectTrue(dCorrected < 1.5, `correction recovers clean skin (dE=${dCorrected.toFixed(2)})`);
  expectTrue(dCorrected < dCast * 0.25, 'correction reduces cast error by >=4x');

  // 2b. 실측 흰자가 리포트에 기록됨 (진단·재보정용)
  expectTrue(warm.report.sclera.measuredRgb != null, 'measured sclera rgb present');
  expectTrue(warm.report.sclera.measuredLab != null, 'measured sclera lab present');

  // 3. 품질 신호는 원본 유지 (rgbMean/dominant만 보정)
  const w = warm.correctedNative!.regions!;
  expectClose(w.skinCheekLeft!.confidence, 0.85, 1e-9, 'confidence untouched');
  expectClose(w.skinCheekLeft!.overexposedRatio, 0, 1e-9, 'exposure untouched');
  expectTrue(warm.correctedNative!.regions!.scleraLeft!.rgbMean.r ===
    faceWithCast(WARM).regions!.scleraLeft!.rgbMean.r, 'sclera region not rewritten');

  // 4. 강한(클리핑 직전) 캐스트 → 캡 발동
  const EXTREME: ChannelGains = { r: 1.35, g: 1.0, b: 0.62 };
  const extreme = deriveIlluminationCorrection(faceWithCast(EXTREME));
  expectTrue(extreme.report.applied, 'extreme: still applied');
  expectTrue(extreme.report.capped, 'extreme: capped');
  expectTrue(
    extreme.report.gains!.b <= 1 + ILLUMINATION_CORRECTION.scleraGainCap + 1e-9,
    'extreme: gain within cap',
  );

  // 4b. 채널을 클리핑시키는 진짜 극단 캐스트 → 흰자 드롭(정보 소실) → 미적용
  const CLIPPING: ChannelGains = { r: 1.8, g: 1.0, b: 0.45 };
  const clippingOut = deriveIlluminationCorrection(faceWithCast(CLIPPING));
  expectTrue(!clippingOut.report.applied, 'clipping cast: not applied (fail-safe)');

  // 4c. 충혈 감지: a*만 끌어올리는 red-only 시프트(충혈)는 캐스트가 아님 → 스킵.
  //     반면 웜 캐스트(위 2번, a*·b* 동반 상승)는 통과해야 한다(이미 검증됨).
  const bloodshot = faceWithCast(IDENTITY);
  const redSclera = castRgb(CLEAN_SCLERA, { r: 1.12, g: 1.0, b: 1.0 });
  bloodshot.regions!.scleraLeft = stats(redSclera, { sampleCount: 120 });
  bloodshot.regions!.scleraRight = stats(redSclera, { sampleCount: 120 });
  const bloodshotOut = deriveIlluminationCorrection(bloodshot);
  expectTrue(!bloodshotOut.report.applied, 'bloodshot: not applied (fail-safe)');
  expectTrue(
    bloodshotOut.report.sclera.reasons.includes('sclera_redness_suspected'),
    'bloodshot reason present',
  );

  // 5. 좌우 불일치 → fail-safe: 이 캡처는 보정하지 않음 (사이드광/오염 판별 불가)
  const disagreeNative = faceWithCast(WARM);
  disagreeNative.regions!.scleraRight = stats(castRgb(CLEAN_SCLERA, { r: 0.9, g: 1.0, b: 1.18 }), {
    sampleCount: 120,
  });
  const disagree = deriveIlluminationCorrection(disagreeNative);
  expectTrue(!disagree.report.applied, 'disagreement: not applied (fail-safe)');
  expectTrue(!disagree.report.sclera.available, 'disagreement: sclera unavailable');
  expectTrue(
    disagree.report.sclera.reasons.includes('sclera_left_right_disagree'),
    'disagreement reason present',
  );

  // 6. 흰자 게이트: 너무 어두움 → 눈 드롭. WB는 추정만 되고(available) 적용은 안 됨(로그 전용).
  const dark = faceWithCast(WARM, { rgbMean: { r: 20, g: 20, b: 20 } });
  dark.regions!.scleraLeft = stats({ r: 20, g: 20, b: 20 }, { sampleCount: 120 });
  dark.regions!.scleraRight = stats({ r: 20, g: 20, b: 20 }, { sampleCount: 120 });
  const darkOut = deriveIlluminationCorrection(dark, {
    whiteBalanceGains: { red: 1.2, green: 1.0, blue: 2.2 },
  });
  expectTrue(!darkOut.report.sclera.available, 'dark sclera unavailable');
  expectTrue(darkOut.report.wb.available, 'wb estimate still collected');
  expectTrue(!darkOut.report.applied && darkOut.report.source === 'none', 'wb NOT applied (log-only)');

  // 6b. 채널 클리핑된 흰자 → 눈 드롭 (복원 불가 정보)
  const clipped = faceWithCast(IDENTITY);
  clipped.regions!.scleraLeft = stats({ r: 252, g: 240, b: 235 }, { sampleCount: 120 });
  clipped.regions!.scleraRight = stats({ r: 253, g: 241, b: 236 }, { sampleCount: 120 });
  const clippedOut = deriveIlluminationCorrection(clipped);
  expectTrue(!clippedOut.report.sclera.available, 'clipped sclera unavailable');
  expectTrue(
    clippedOut.report.sclera.reasons.some(r => r.includes('channel_clipped')),
    'clipped reason present',
  );

  // 7. WB 방향(추정치 검증): 웜광(rg 낮음) → red 게인 < blue 게인 (red 줄이는 방향)
  const noSclera = base({
    skinCheekLeft: stats(CLEAN_SKIN),
    skinCheekRight: stats(CLEAN_SKIN),
    skinForehead: stats(CLEAN_SKIN),
    hair: stats(CLEAN_HAIR),
    lip: stats(CLEAN_LIP, { matteCoverage: 1 }),
  });
  const wbWarm = deriveIlluminationCorrection(noSclera, {
    whiteBalanceGains: { red: 1.2, green: 1.0, blue: 2.4 }, // rg=1.2 << 1.9 → 웜광
  });
  expectTrue(wbWarm.report.wb.available, 'wb estimate available');
  expectTrue(
    wbWarm.report.wb.rawGains!.r < wbWarm.report.wb.rawGains!.b,
    'warm light: reduce red vs blue (raw estimate)',
  );
  expectTrue(!wbWarm.report.applied, 'wb estimate not applied');

  // 7b. NaN/음수 WB gains → 안전하게 무시
  const wbNan = deriveIlluminationCorrection(noSclera, {
    whiteBalanceGains: { red: Number.NaN, green: 1.0, blue: 2.0 },
  });
  expectTrue(!wbNan.report.wb.available && !wbNan.report.applied, 'NaN wb gains rejected');

  // 7c. 저신뢰 입력 → 최종 신뢰도가 입력 품질에 비례해 낮아진다 (코덱스 #246-2).
  // 두 눈 모두 native confidence 0.3(trusted 0.6 의 절반) → 최종 ≈ base·0.5,
  // 고정 0.85 로 승격되지 않는다. 고신뢰(0.85) 대비 확실히 낮아야 한다.
  const lowConf = deriveIlluminationCorrection(
    faceWithCast(IDENTITY, { confidence: 0.3 }),
  );
  const highConf = deriveIlluminationCorrection(faceWithCast(IDENTITY));
  expectTrue(lowConf.report.applied && lowConf.report.source === 'sclera', 'low-conf still applied via sclera');
  expectTrue(
    lowConf.report.confidence < highConf.report.confidence - 0.2,
    `low-conf correction confidence reduced (low=${lowConf.report.confidence.toFixed(
      2,
    )} vs high=${highConf.report.confidence.toFixed(2)})`,
  );
  expectClose(
    lowConf.report.confidence,
    ILLUMINATION_CORRECTION.scleraBaseConfidence * (0.3 / ILLUMINATION_CORRECTION.scleraTrustedConfidence),
    0.02,
    'low-conf correction confidence tracks input quality',
  );

  // 7d. 강화된 클립 임계(0.35): 채널 평균은 정상이나 포화 픽셀 비율이 0.4 인 흰자는
  // 이제 드롭된다 — 종전 0.5 임계에서는 통과하던 저품질 입력(코덱스 #246-2).
  const overexposed = faceWithCast(IDENTITY, { overexposedRatio: 0.4 });
  const overexposedOut = deriveIlluminationCorrection(overexposed);
  expectTrue(
    !overexposedOut.report.sclera.available,
    'sclera with 40% overexposed pixels dropped (tightened clip gate)',
  );

  // --- F5: 게이트 완화 + one-eye 경로 부활 ---
  // 실측 흰자 수율은 눈당 14~17(합 31)이라 종전 per-eye 12·combined 24 게이트는
  // 마진이 면도날이었고, combined 24 때문에 one-eye 경로(oneEyePenalty)는 도달 불가한
  // 사문 코드였다. per-eye 8 / combined(2눈)16 / combined(1눈)12 로 완화.

  // F5a. 두 눈 각 9표본(=18) → 적용 (종전 per-eye 12 미달로 드롭되던 케이스)
  const lowBothEyes = faceWithCast(IDENTITY);
  lowBothEyes.regions!.scleraLeft = stats(CLEAN_SCLERA, { sampleCount: 9 });
  lowBothEyes.regions!.scleraRight = stats(CLEAN_SCLERA, { sampleCount: 9 });
  const lowBothOut = deriveIlluminationCorrection(lowBothEyes);
  expectTrue(lowBothOut.report.applied, 'two eyes 9+9 samples: applied (relaxed per-eye gate)');
  expectTrue(lowBothOut.report.sclera.eyesUsed === 2, 'two eyes used');

  // F5b. 한 눈만 14표본 → 적용 + oneEyePenalty (종전 combined 24 미달로 도달 불가했던
  //      one-eye 경로 부활). 신뢰도가 두 눈 대비 낮아야(penalty 반영).
  const oneEye = faceWithCast(IDENTITY);
  oneEye.regions!.scleraLeft = stats(CLEAN_SCLERA, { sampleCount: 14 });
  oneEye.regions!.scleraRight = stats(CLEAN_SCLERA, { sampleCount: 0 }); // 미검출
  const oneEyeOut = deriveIlluminationCorrection(oneEye);
  expectTrue(oneEyeOut.report.applied && oneEyeOut.report.source === 'sclera', 'one eye 14: applied (revived path)');
  expectTrue(oneEyeOut.report.sclera.eyesUsed === 1, 'one eye used');
  expectTrue(
    oneEyeOut.report.sclera.reasons.includes('sclera_one_eye_only'),
    'one-eye reason recorded',
  );
  const twoEyeHigh = deriveIlluminationCorrection(faceWithCast(IDENTITY));
  expectTrue(
    oneEyeOut.report.confidence < twoEyeHigh.report.confidence,
    `one-eye penalty lowers confidence (one=${oneEyeOut.report.confidence.toFixed(2)} vs two=${twoEyeHigh.report.confidence.toFixed(2)})`,
  );

  // F5c. 한 눈 9표본 → 미적용 (one-eye combined 게이트 12 미달, fail-safe 유지)
  const oneEyeTooFew = faceWithCast(IDENTITY);
  oneEyeTooFew.regions!.scleraLeft = stats(CLEAN_SCLERA, { sampleCount: 9 });
  oneEyeTooFew.regions!.scleraRight = stats(CLEAN_SCLERA, { sampleCount: 0 });
  const oneEyeTooFewOut = deriveIlluminationCorrection(oneEyeTooFew);
  expectTrue(!oneEyeTooFewOut.report.applied, 'one eye 9: not applied (below one-eye combined gate)');

  // 8. 소스 없음 → 미적용
  const nothing = deriveIlluminationCorrection(noSclera);
  expectTrue(!nothing.report.applied && nothing.correctedNative == null, 'no source: not applied');

  // 9. native not ok → 미적용
  const bad = deriveIlluminationCorrection({ status: 'no_face', faceCount: 0 });
  expectTrue(!bad.report.applied, 'native not ok: not applied');

  console.log('[personal-color] illuminationCorrection tests passed');
}

runIlluminationCorrectionTests();
