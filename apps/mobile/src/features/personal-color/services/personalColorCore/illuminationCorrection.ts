// 조명 캐스트 보정 (실험 레이어, A/B 비교 전용). baseline 파이프라인은 불변 —
// 이 모듈은 native 결과의 복사본에 von Kries 채널 게인을 적용한 correctedNative를
// 만들고, 서비스가 엔진을 두 번(원본/보정) 돌려 결과를 나란히 비교한다.
//
// 소스 1 — 흰자(sclera): 사람 간 색차가 작은 준-중립 프레임 내 기준. 좌우 흰자
//   RGB의 채널 불균형 = 조명 캐스트로 보고 역게인 추정. (직접 증거 → 우선)
// 소스 2 — WB gains 잔여 보정: AWB가 강한 캐스트를 under-correct한다는 가정의
//   부분(log-공간 k배) 보정. 기기 캘리브레이션 없인 약한 신호 → 설계상 저신뢰·저강도.
//
// 모든 상수는 calibration target. 실측 A/B로 효과 입증 전 baseline 승격 금지.

import { clamp, linearToSrgb8, rgb8ToLab, srgb8ToLinear } from './colorMath';
import type { Lab, NativePersonalColorResult, NativeRegionStats, Rgb } from './contracts';

export type WhiteBalanceGains = { red?: number; green?: number; blue?: number };

export type ChannelGains = { r: number; g: number; b: number };

export type IlluminationSource = 'sclera' | 'wb' | 'none';

export type IlluminationCorrectionReport = {
  applied: boolean;
  source: IlluminationSource;
  gains: ChannelGains | null; // 실제 적용된(캡 후) 게인
  strength: number; // 캡 전 max|rawGain-1| — 캐스트 크기 지표
  capped: boolean;
  confidence: number; // 0..1
  sclera: {
    available: boolean;
    eyesUsed: number; // 0..2
    sampleCount: number;
    leftRightAgreement: number | null; // 좌우 log-게인 최대 불일치(작을수록 일치)
    rawGains: ChannelGains | null;
    // 실측 흰자 색 — 편향 진단·scleraReferenceRgb 재보정용. a*가 기준(+1.5)보다
    // 크게 붉으면 오염 또는 충혈 → red-cut 편향의 직접 증거.
    measuredRgb: Rgb | null;
    measuredLab: Lab | null;
    reasons: string[];
  };
  wb: {
    available: boolean;
    rg: number | null;
    bg: number | null;
    rawGains: ChannelGains | null;
    reasons: string[];
  };
  reasons: string[];
};

// 전부 calibration target — 실측 raw 로그로 재보정 대상.
export const ILLUMINATION_CORRECTION = {
  // sclera 게이트 — 실측 재보정(2026-07-18): 정상적으로 뜬 눈의 실제 흰자 수율이
  // 눈당 14~17(합 31)로, 종전 25/60 은 물리적으로 도달 불가한 값이었다(specular·
  // 노출 문제 아님, ROI 게이트 통과 픽셀 자체가 적음). 흰자 면적이 작아 해상도를
  // 올려도 늘지 않는다. 낮은 표본은 confidence(kMinSamplesForFullConfidence=40)와
  // scleraMinNativeConfidence 게이트가 down-weight/차단하므로 과신 위험은 없다.
  // F5 완화(2026-07-18): 실측 흰자 수율이 눈당 14~17(합 31)이라 종전 per-eye 12·
  // combined 24 게이트는 마진이 2~5표본으로 면도날이었고 — 살짝 감은 눈·작은 눈 하나로
  // 보정이 꺼져 웜 캐스트가 그대로 통과했다. 게다가 combined 24 ≥ 2×(one-eye 통과 상한)
  // 이라 한쪽 눈만 잡힌 케이스는 combined 를 절대 못 넘어 oneEyePenalty 경로가 사문화돼
  // 있었다. per-eye 8 로 낮추고 combined 를 눈 수에 연동해 one-eye 경로를 되살린다.
  // 낮은 표본의 과신은 아래 confidence 스케일(kMinSamplesForFullConfidence=40,
  // scleraTrustedConfidence)이 down-weight 하므로 위험은 통제된다. calibration target.
  scleraMinSamplesPerEye: 8,
  scleraMinCombinedSamplesTwoEyes: 16,
  scleraMinCombinedSamplesOneEye: 12,
  scleraMinNativeConfidence: 0.25,
  scleraMinLinearLuma: 0.04, // 그늘진 흰자 제외
  scleraMaxLinearLuma: 0.92, // 날아간 흰자 제외
  scleraChannelClipMax: 249.5, // 채널 평균이 이 이상이면 클리핑 → 그 눈 드롭(복원 불가 정보)
  // 채널 평균만 보면, 서로 다른 픽셀이 서로 다른 채널에서 255로 포화된 경우
  // (overexposedRatio=1 인데 평균은 249 미만) 클리핑을 놓친다(코덱스 F14). 포화
  // 픽셀 비율이 이 값 이상이면 그 눈을 드롭 — 복원 불가 정보로 게인 추정이 무의미.
  // 0.5(절반 포화)는 너무 헐거워 게인의 절반이 복원 불가 데이터에서 나왔다(코덱스
  // #246-2). fail-safe 방향으로 강화 — 초과 시 스킵→baseline 표시(재보정 대상).
  scleraMaxOverexposedRatio: 0.35,
  // 실제 흰자는 회색이 아니라 약간 웜한 생체 조직(혈관·황색조). 회색 타깃을 쓰면
  // 흰자의 자연 웜기를 "조명 캐스트"로 오인해 전역 red-cut 편향이 생긴다(실기기 확인).
  // ≈ Lab(76, +4, +6), D65. 1차 실측(주광 창가, n=1: a*6.7~7.0/b*5.9~6.2, 단 촬영자
  // 밤샘 충혈 상태 → 비충혈 추정치로 a*+4 부분 반영. b*+6은 실측 명중). 재적합 대상.
  scleraReferenceRgb: { r: 200, g: 185, b: 177 },
  // 충혈 감지: 조명 캐스트는 a*·b*를 함께 움직이지만(웜광=빨강+노랑) 충혈은 a*만
  // 끌어올린다. 기준 대비 초과가 red-dominant면 캐스트가 아니라 충혈 → fail-safe 스킵.
  scleraRednessExcessMax: 2.5, // (Δa* − 0.5·max(0,Δb*)) 이 이상이면 충혈 의심
  scleraRednessBSlope: 0.5,
  scleraGainCap: 0.35, // per-channel |g-1| 캡
  eyeAgreementMax: 0.1, // 좌우 log-게인 불일치 허용(초과 = 사이드광/오염 → fail-safe 스킵)
  scleraBaseConfidence: 0.85,
  // 입력 눈의 native confidence 가 이 값 이상이면 base 신뢰도를 온전히 인정하고,
  // 그 아래로는 비례해서 깎는다(코덱스 #246-2: 두 눈 0.25 여도 최종 0.85 로 고정되던
  // 문제). 게이트 하한(scleraMinNativeConfidence 0.25)과 '신뢰할 만한' 흰자 사이의
  // 기준선 — 재보정 대상.
  scleraTrustedConfidence: 0.6,
  oneEyePenalty: 0.7,
  // WB 잔여 보정 — 합성·실측 모두 개선 효과 미입증 + 불필요한 오차 주입 확인(적대 검증)
  // → 적용은 끄고 추정치만 로그로 수집(추후 기기 캘리브레이션 데이터 확보용).
  wbApplyEnabled: false,
  wbNeutralRg: 1.9, // greenlight 정상 밴드(red/green 1.6~2.2) 중심
  wbNeutralBg: 1.9, // (blue/green 1.5~2.3) 중심
  wbResidualStrength: 0.25, // 부분 보정 계수 k (log-공간)
  wbGainCap: 0.18,
  wbBaseConfidence: 0.35, // 기기 캘리브레이션 부재 → 설계상 저신뢰
  wbExtremePenalty: 0.7, // greenlight 캐스트 밴드 밖(혼합광 의심)
  wbExtremeRgBand: [0.6, 2.4] as const,
  wbExtremeBgBand: [0.6, 2.6] as const,
  // 적용 최소 신뢰
  minConfidenceToApply: 0.3,
} as const;

const EPS = 1e-6;

// 축 계산에 참여하는(=보정 대상) 부위만. sclera 자신은 소비처가 없어 제외.
const CORRECTED_REGION_KEYS = [
  'skinCheekLeft',
  'skinCheekRight',
  'skinForehead',
  'hair',
  'lip',
] as const;

function toLinear(rgb: Rgb): { r: number; g: number; b: number } {
  return { r: srgb8ToLinear(rgb.r), g: srgb8ToLinear(rgb.g), b: srgb8ToLinear(rgb.b) };
}

function linearLuma(lin: { r: number; g: number; b: number }): number {
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

// 측정된 흰자를 "기준 흰자 색"으로 끌어오는 게인 (평균 밝기 보존).
// 기준 흰자가 중립광 아래 있으면 게인 ≈ 1 (항등); 캐스트가 곱해졌으면 정확히 역게인.
function gainsTowardReference(lin: { r: number; g: number; b: number }): ChannelGains {
  const ref = ILLUMINATION_CORRECTION.scleraReferenceRgb;
  const refLin = {
    r: srgb8ToLinear(ref.r),
    g: srgb8ToLinear(ref.g),
    b: srgb8ToLinear(ref.b),
  };
  const refMean = (refLin.r + refLin.g + refLin.b) / 3;
  const mean = (lin.r + lin.g + lin.b) / 3;
  return {
    r: (refLin.r / refMean) * (mean / Math.max(EPS, lin.r)),
    g: (refLin.g / refMean) * (mean / Math.max(EPS, lin.g)),
    b: (refLin.b / refMean) * (mean / Math.max(EPS, lin.b)),
  };
}

function maxAbsLogDiff(a: ChannelGains, b: ChannelGains): number {
  return Math.max(
    Math.abs(Math.log(a.r) - Math.log(b.r)),
    Math.abs(Math.log(a.g) - Math.log(b.g)),
    Math.abs(Math.log(a.b) - Math.log(b.b)),
  );
}

function rawStrength(g: ChannelGains): number {
  return Math.max(Math.abs(g.r - 1), Math.abs(g.g - 1), Math.abs(g.b - 1));
}

function capGains(g: ChannelGains, cap: number): { gains: ChannelGains; capped: boolean } {
  const lo = 1 - cap;
  const hi = 1 + cap;
  const capped = g.r < lo || g.r > hi || g.g < lo || g.g > hi || g.b < lo || g.b > hi;
  return {
    gains: { r: clamp(g.r, lo, hi), g: clamp(g.g, lo, hi), b: clamp(g.b, lo, hi) },
    capped,
  };
}

type ScleraEstimate = IlluminationCorrectionReport['sclera'] & {
  confidence: number;
};

function estimateSclera(native: NativePersonalColorResult): ScleraEstimate {
  const c = ILLUMINATION_CORRECTION;
  const reasons: string[] = [];
  const regions = native.regions ?? {};
  const candidates: {
    stats: NativeRegionStats;
    color: Rgb;
    gains: ChannelGains;
  }[] = [];

  for (const key of ['scleraLeft', 'scleraRight'] as const) {
    const stats = regions[key];
    if (!stats || stats.sampleCount <= 0) {
      reasons.push(`${key}_missing`);
      continue;
    }
    if (stats.sampleCount < c.scleraMinSamplesPerEye) {
      reasons.push(`${key}_too_few_samples`);
      continue;
    }
    if (stats.confidence < c.scleraMinNativeConfidence) {
      reasons.push(`${key}_low_confidence`);
      continue;
    }
    // 흰자 대표색 = 채널별 중앙값(rgbMedian). 소수 국소 실핏줄에 강건하다.
    // 구버전 네이티브(중앙값 미제공)면 rgbMean 으로 폴백.
    const scleraRgb = stats.rgbMedian ?? stats.rgbMean;
    // 채널 클리핑: 255 근처로 날아간 채널은 원 정보가 소실돼 게인 추정이 무의미.
    // (a) 채널값 포화 (b) 포화 픽셀 비율 — 채널마다 다른 픽셀이 포화되면 대표색은
    // 낮아도 데이터는 전부 클리핑이라 overexposedRatio 로 함께 잡는다(F14).
    if (
      scleraRgb.r >= c.scleraChannelClipMax ||
      scleraRgb.g >= c.scleraChannelClipMax ||
      scleraRgb.b >= c.scleraChannelClipMax ||
      stats.overexposedRatio >= c.scleraMaxOverexposedRatio
    ) {
      reasons.push(`${key}_channel_clipped`);
      continue;
    }
    const lin = toLinear(scleraRgb);
    const luma = linearLuma(lin);
    if (luma < c.scleraMinLinearLuma || luma > c.scleraMaxLinearLuma) {
      reasons.push(`${key}_luma_out_of_range`);
      continue;
    }
    candidates.push({ stats, color: scleraRgb, gains: gainsTowardReference(lin) });
  }

  // 실측 흰자 색(가중 평균) — 게이트 통과 눈이 있으면 항상 기록(진단·재보정용)
  const measured = (() => {
    if (candidates.length === 0) return { rgb: null as Rgb | null, lab: null as Lab | null };
    let w = 0;
    const acc = { r: 0, g: 0, b: 0 };
    for (const e of candidates) {
      const ew = Math.max(EPS, e.stats.sampleCount * clamp(e.stats.confidence, 0, 1));
      w += ew;
      acc.r += ew * e.color.r;
      acc.g += ew * e.color.g;
      acc.b += ew * e.color.b;
    }
    const rgb = { r: acc.r / w, g: acc.g / w, b: acc.b / w };
    return { rgb, lab: rgb8ToLab(rgb) };
  })();

  if (candidates.length === 0) {
    return {
      available: false,
      eyesUsed: 0,
      sampleCount: 0,
      leftRightAgreement: null,
      rawGains: null,
      measuredRgb: null,
      measuredLab: null,
      reasons,
      confidence: 0,
    };
  }

  const sampleCount = candidates.reduce((a, e) => a + e.stats.sampleCount, 0);
  // 눈 수 연동 combined 게이트 — 한쪽 눈만 잡혀도(one-eye) 도달 가능하게 분리한다.
  const combinedGate =
    candidates.length === 2 ? c.scleraMinCombinedSamplesTwoEyes : c.scleraMinCombinedSamplesOneEye;
  if (sampleCount < combinedGate) {
    reasons.push('sclera_combined_too_few_samples');
    return {
      available: false,
      eyesUsed: candidates.length,
      sampleCount,
      leftRightAgreement: null,
      rawGains: null,
      measuredRgb: measured.rgb,
      measuredLab: measured.lab,
      reasons,
      confidence: 0,
    };
  }

  // 좌우를 sampleCount·confidence 가중 log-평균으로 결합
  let wSum = 0;
  const logAcc = { r: 0, g: 0, b: 0 };
  for (const e of candidates) {
    const w = Math.max(EPS, e.stats.sampleCount * clamp(e.stats.confidence, 0, 1));
    wSum += w;
    logAcc.r += w * Math.log(e.gains.r);
    logAcc.g += w * Math.log(e.gains.g);
    logAcc.b += w * Math.log(e.gains.b);
  }
  const rawGains: ChannelGains = {
    r: Math.exp(logAcc.r / wSum),
    g: Math.exp(logAcc.g / wSum),
    b: Math.exp(logAcc.b / wSum),
  };

  // 최종 신뢰도를 입력 눈 품질에 연동한다 — 게이트 통과만으로 base 를 그대로 주면
  // 두 눈이 모두 하한(0.25)에 걸친 저신뢰 흰자여도 0.85 로 승격돼, 의심스러운
  // 보정본이 '메인'으로 표시된다(코덱스 #246-2). sample 가중 native confidence 를
  // trusted 기준으로 정규화해 곱한다(단조 감소·fail-safe: 나쁜 입력일수록 낮아져
  // minConfidenceToApply 아래로 떨어지면 baseline 으로 폴백).
  const weightedInputConf = clamp(wSum / Math.max(EPS, sampleCount), 0, 1);
  const inputQualityFactor = clamp(weightedInputConf / c.scleraTrustedConfidence, 0, 1);
  let confidence = c.scleraBaseConfidence * inputQualityFactor;
  let agreement: number | null = null;
  if (candidates.length === 2) {
    agreement = maxAbsLogDiff(candidates[0].gains, candidates[1].gains);
    if (agreement > c.eyeAgreementMax) {
      // 좌우가 다른 캐스트를 보고함 = 사이드광 또는 한쪽 눈 오염(눈꺼풀/눈물언덕).
      // 어느 쪽이 맞는지 판별 불가 → fail-safe로 이 캡처는 보정하지 않는다.
      // (실기기에서 신뢰도 43% 상태로 strength 0.51짜리 의심 보정이 적용된 사례 확인)
      reasons.push('sclera_left_right_disagree');
      return {
        available: false,
        eyesUsed: candidates.length,
        sampleCount,
        leftRightAgreement: agreement,
        rawGains,
        measuredRgb: measured.rgb,
        measuredLab: measured.lab,
        reasons,
        confidence: 0,
      };
    }
  } else {
    reasons.push('sclera_one_eye_only');
    confidence *= c.oneEyePenalty;
  }

  // 충혈 감지 — 조명 캐스트는 a*·b*를 함께 움직이지만(웜광=빨강+노랑) 충혈은
  // a*만 끌어올린다(실기기: a* +5.5 초과·b* 기준 명중 = 충혈 시그니처).
  // red-dominant 초과를 캐스트로 "보정"하면 얼굴 전체가 오염되므로 fail-safe 스킵.
  if (measured.lab) {
    const refLab = rgb8ToLab(c.scleraReferenceRgb);
    const dA = measured.lab.a - refLab.a;
    const dB = measured.lab.b - refLab.b;
    const rednessExcess = dA - c.scleraRednessBSlope * Math.max(0, dB);
    if (rednessExcess > c.scleraRednessExcessMax) {
      reasons.push('sclera_redness_suspected');
      return {
        available: false,
        eyesUsed: candidates.length,
        sampleCount,
        leftRightAgreement: agreement,
        rawGains,
        measuredRgb: measured.rgb,
        measuredLab: measured.lab,
        reasons,
        confidence: 0,
      };
    }
  }

  return {
    available: true,
    eyesUsed: candidates.length,
    sampleCount,
    leftRightAgreement: agreement,
    rawGains,
    measuredRgb: measured.rgb,
    measuredLab: measured.lab,
    reasons,
    confidence,
  };
}

type WbEstimate = IlluminationCorrectionReport['wb'] & { confidence: number };

function estimateWb(gains: WhiteBalanceGains | null | undefined): WbEstimate {
  const c = ILLUMINATION_CORRECTION;
  const reasons: string[] = [];
  const red = gains?.red;
  const green = gains?.green;
  const blue = gains?.blue;
  if (
    typeof red !== 'number' || !Number.isFinite(red) || red <= 0 ||
    typeof green !== 'number' || !Number.isFinite(green) || green <= 0 ||
    typeof blue !== 'number' || !Number.isFinite(blue) || blue <= 0
  ) {
    reasons.push('wb_gains_missing_or_invalid');
    return { available: false, rg: null, bg: null, rawGains: null, reasons, confidence: 0 };
  }

  const rg = red / green;
  const bg = blue / green;
  // AWB 게인 해석: 웜광 → red 풍부 → red 게인 낮음(rg < 중심). AWB가 under-correct
  // 했다면 이미지에 웜 잔여 캐스트 → red를 살짝 줄이는 방향(g_r < 1)이 맞다:
  // g_r = (rg/중심)^k 는 rg<중심에서 <1. blue 동일 논리.
  let rawGains: ChannelGains = {
    r: Math.pow(rg / c.wbNeutralRg, c.wbResidualStrength),
    g: 1,
    b: Math.pow(bg / c.wbNeutralBg, c.wbResidualStrength),
  };
  // 평균 밝기 보존 정규화
  const mean = (rawGains.r + rawGains.g + rawGains.b) / 3;
  rawGains = { r: rawGains.r / mean, g: rawGains.g / mean, b: rawGains.b / mean };

  let confidence = c.wbBaseConfidence;
  if (
    rg < c.wbExtremeRgBand[0] ||
    rg > c.wbExtremeRgBand[1] ||
    bg < c.wbExtremeBgBand[0] ||
    bg > c.wbExtremeBgBand[1]
  ) {
    reasons.push('wb_extreme_cast');
    confidence *= c.wbExtremePenalty;
  }

  return { available: true, rg, bg, rawGains, reasons, confidence };
}

function applyGainsToRgb(rgb: Rgb, gains: ChannelGains): Rgb {
  const lin = toLinear(rgb);
  return {
    r: linearToSrgb8(clamp(lin.r * gains.r, 0, 1)),
    g: linearToSrgb8(clamp(lin.g * gains.g, 0, 1)),
    b: linearToSrgb8(clamp(lin.b * gains.b, 0, 1)),
  };
}

function applyGainsToNative(
  native: NativePersonalColorResult,
  gains: ChannelGains,
): NativePersonalColorResult {
  const regions = { ...(native.regions ?? {}) };
  for (const key of CORRECTED_REGION_KEYS) {
    const stats = regions[key];
    if (!stats) continue;
    // rgbMean/dominant만 보정. 분산·노출비·confidence 등 품질 신호는 원본 유지.
    regions[key] = {
      ...stats,
      rgbMean: applyGainsToRgb(stats.rgbMean, gains),
      dominant: applyGainsToRgb(stats.dominant, gains),
    };
  }
  return { ...native, regions };
}

export type IlluminationCorrectionInput = {
  whiteBalanceGains?: WhiteBalanceGains | null;
};

export function deriveIlluminationCorrection(
  native: NativePersonalColorResult,
  input: IlluminationCorrectionInput = {},
): { correctedNative: NativePersonalColorResult | null; report: IlluminationCorrectionReport } {
  const c = ILLUMINATION_CORRECTION;
  const sclera = estimateSclera(native);
  const wb = estimateWb(input.whiteBalanceGains);

  const emptyReport = (reasons: string[]): IlluminationCorrectionReport => ({
    applied: false,
    source: 'none',
    gains: null,
    strength: 0,
    capped: false,
    confidence: 0,
    sclera,
    wb,
    reasons,
  });

  if (native.status !== 'ok') {
    return { correctedNative: null, report: emptyReport(['native_not_ok']) };
  }

  // 소스 선택: 직접 증거(sclera)만 적용. WB 잔여는 개선 효과 미입증이라 추정치를
  // 로그로만 수집하고 적용하지 않는다(wbApplyEnabled) — 켜면 폴백으로 동작.
  let source: IlluminationSource = 'none';
  let rawGains: ChannelGains | null = null;
  let confidence = 0;
  let cap = 0;
  if (sclera.available && sclera.confidence >= c.minConfidenceToApply && sclera.rawGains) {
    source = 'sclera';
    rawGains = sclera.rawGains;
    confidence = sclera.confidence;
    cap = c.scleraGainCap;
  } else if (c.wbApplyEnabled && wb.available && wb.confidence >= c.minConfidenceToApply && wb.rawGains) {
    source = 'wb';
    rawGains = wb.rawGains;
    confidence = wb.confidence;
    cap = c.wbGainCap;
  }

  if (source === 'none' || !rawGains) {
    return { correctedNative: null, report: emptyReport(['no_usable_source']) };
  }

  const strength = rawStrength(rawGains);
  const { gains, capped } = capGains(rawGains, cap);
  const correctedNative = applyGainsToNative(native, gains);

  return {
    correctedNative,
    report: {
      applied: true,
      source,
      gains,
      strength,
      capped,
      confidence,
      sclera,
      wb,
      reasons: capped ? ['gain_capped'] : [],
    },
  };
}
