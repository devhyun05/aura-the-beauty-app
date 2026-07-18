// 오케스트레이터(순수): NativePersonalColorResult → AuraPersonalColorResult.
// 3개 skin 패치를 합성 → 5축 → 12톤 → 팔레트 → measurementConfidence/status.

import { computeAxes, effectiveConfidence, toRegionSignal } from './axisModel';
import type { RegionSignal, RegionSignals } from './axisModel';
import { clamp, labToLch, rgb8ToLab } from './colorMath';
import { CLASSIFIER, FIXED_REFS_VERSION, LIP_MAKEUP_CHROMA_MAX, MC_GATE } from './constants';
import { buildPalette } from './palette';
import { computeTone } from './toneClassifier';
import {
  PERSONAL_COLOR_PRIVACY,
  PERSONAL_COLOR_SCHEMA_VERSION,
} from './contracts';
import type {
  AuraPersonalColorResult,
  AuraRegionMeasurement,
  AxisName,
  NativePersonalColorResult,
  NativeRegionStats,
  PersonalColorStatus,
  RegionKey,
} from './contracts';

export type PersonalColorEngineOptions = {
  tau?: number;
  calibrationApplied?: boolean;
  calibrationVersion?: string | null;
  frameCount?: number;
};

const EPS = 1e-6;

// 3개 skin 패치 → 합성 skin NativeRegionStats (총분산 법칙으로 cross-patch 분산 포함)
export function combineSkinPatches(native: NativePersonalColorResult): NativeRegionStats | undefined {
  const regions = native.regions ?? {};
  const patches = [regions.skinCheekLeft, regions.skinCheekRight, regions.skinForehead].filter(
    (p): p is NativeRegionStats => !!p && p.sampleCount > 0,
  );
  if (patches.length === 0) return undefined;

  const weights = patches.map(p => Math.max(EPS, p.confidence) * Math.max(EPS, p.areaRatio));
  const wSum = weights.reduce((a, b) => a + b, 0);

  const mean = { r: 0, g: 0, b: 0 };
  patches.forEach((p, i) => {
    mean.r += (weights[i] * p.rgbMean.r) / wSum;
    mean.g += (weights[i] * p.rgbMean.g) / wSum;
    mean.b += (weights[i] * p.rgbMean.b) / wSum;
  });

  const variance = { r: 0, g: 0, b: 0 };
  patches.forEach((p, i) => {
    const wr = weights[i] / wSum;
    variance.r += wr * (p.rgbVariance.r + Math.pow(p.rgbMean.r - mean.r, 2));
    variance.g += wr * (p.rgbVariance.g + Math.pow(p.rgbMean.g - mean.g, 2));
    variance.b += wr * (p.rgbVariance.b + Math.pow(p.rgbMean.b - mean.b, 2));
  });

  const weightedAvg = (get: (p: NativeRegionStats) => number): number =>
    patches.reduce((acc, p, i) => acc + (weights[i] * get(p)) / wSum, 0);

  // F4 수정(2026-07-18): 3 skin 패치는 같은 얼굴·같은 조명이라 강하게 상관돼 있어
  // 독립 증거가 아니다. 종전 확률적 OR(1-Π(1-c))은 상관된 패치를 독립으로 결합해
  // 신뢰도를 부풀렸고(각 0.5 → 0.875), 저품질 캡처가 measurementConfidence 게이트를
  // 자신 있게 통과했다. 커버리지·신뢰 가중 평균으로 바꿔 과신을 제거한다(fail-safe:
  // mc 하락으로 insufficient 증가 — 의도된 방향).
  const confidence = clamp(
    patches.reduce((acc, p, i) => acc + (weights[i] * clamp(p.confidence, 0, 1)) / wSum, 0),
    0,
    1,
  );

  return {
    rgbMean: mean,
    rgbVariance: variance,
    dominant: mean,
    sampleCount: patches.reduce((a, p) => a + p.sampleCount, 0),
    areaRatio: weightedAvg(p => p.areaRatio), // coverage 비율 → 평균 (합산 아님)
    matteCoverage: weightedAvg(p => p.matteCoverage),
    overexposedRatio: weightedAvg(p => p.overexposedRatio),
    underexposedRatio: weightedAvg(p => p.underexposedRatio),
    specularRejectedRatio: weightedAvg(p => p.specularRejectedRatio),
    confidence,
  };
}

function measurement(stats: NativeRegionStats, region: RegionKey, colorSpace: 'srgb' | 'display-p3'): AuraRegionMeasurement {
  const lab = rgb8ToLab(stats.rgbMean);
  const lch = labToLch(lab);
  const warnings: string[] = [];
  if (stats.overexposedRatio > 0.1) warnings.push(`${region}_overexposed`);
  if (stats.underexposedRatio > 0.1) warnings.push(`${region}_underexposed`);
  if (stats.specularRejectedRatio > 0.3) warnings.push(`${region}_high_specular`);
  return {
    region,
    colorSpace,
    lab,
    lch: { C: lch.C, h: lch.h },
    qNative: clamp(stats.confidence, 0, 1),
    qEff: effectiveConfidence(stats, region),
    areaRatio: stats.areaRatio,
    overExposedRatio: stats.overexposedRatio,
    underExposedRatio: stats.underexposedRatio,
    warnings,
  };
}

function emptyResult(status: PersonalColorStatus, warnings: string[], options: PersonalColorEngineOptions): AuraPersonalColorResult {
  const nullAxis = { value: null, confidence: 0, floored: true, basis: 'within-frame-relative' as const };
  return {
    schemaVersion: PERSONAL_COLOR_SCHEMA_VERSION,
    status,
    colorFrame: 'device-relative-awb-locked',
    calibrationApplied: options.calibrationApplied ?? false,
    preCalibrationHedge: !(options.calibrationApplied ?? false),
    regions: [],
    deferredRegions: ['eye'],
    axes: {
      temperature: nullAxis,
      value: nullAxis,
      chroma: nullAxis,
      clarity: nullAxis,
      contrast: nullAxis,
    },
    relations: { dL_skinHair: null, dL_skinLip: null, dE00_skinHair: null, dE00_skinLip: null },
    tone: null,
    palette: { best: [], worst: [], colorFamilies: [] },
    measurementConfidence: 0,
    warnings,
    artifacts: {
      referencePoints: { neutralSource: 'population', fixedRefsVersion: FIXED_REFS_VERSION },
      calibrationVersion: options.calibrationVersion ?? null,
      frameCount: options.frameCount ?? 1,
    },
    privacy: PERSONAL_COLOR_PRIVACY,
  };
}

export function analyzePersonalColor(
  native: NativePersonalColorResult,
  options: PersonalColorEngineOptions = {},
): AuraPersonalColorResult {
  const warnings = [...(native.warnings ?? [])];
  const calibrationApplied = options.calibrationApplied ?? false;

  if (native.status !== 'ok' || native.faceCount < 1) {
    warnings.push(`native_status_${native.status}`);
    return emptyResult('insufficient', warnings, options);
  }

  const colorSpace = native.colorSpace ?? 'srgb';
  const regions = native.regions ?? {};

  const skinStats = combineSkinPatches(native);
  const hairStats = regions.hair;
  const lipStats = regions.lip;

  if (!skinStats) warnings.push('skin_missing');
  if (!hairStats) warnings.push('hair_missing');
  if (!lipStats) warnings.push('lip_missing');

  // F9: 립 채도가 자연 입술 상한을 넘으면 립스틱 의심 → advisory 경고만(측정 불변).
  // 소비처가 temp/chroma 오염 가능성을 판독하게 한다(비비드 winter 오검출은 감수).
  if (lipStats) {
    const lipC = labToLch(rgb8ToLab(lipStats.rgbMean)).C;
    if (lipC > LIP_MAKEUP_CHROMA_MAX) warnings.push('lip_makeup_suspected');
  }

  const signals: RegionSignals = {};
  const measurements: AuraRegionMeasurement[] = [];
  if (skinStats) {
    signals.skin = toRegionSignal(skinStats, 'skin');
    measurements.push(measurement(skinStats, 'skin', colorSpace));
  }
  if (hairStats) {
    signals.hair = toRegionSignal(hairStats, 'hair');
    measurements.push(measurement(hairStats, 'hair', colorSpace));
  }
  if (lipStats) {
    signals.lip = toRegionSignal(lipStats, 'lip');
    measurements.push(measurement(lipStats, 'lip', colorSpace));
  }

  const { axes, relations } = computeAxes(signals);

  const axisNames: AxisName[] = ['temperature', 'value', 'chroma', 'clarity', 'contrast'];
  const axesPresent = axisNames.filter(n => axes[n].value != null).length;

  const presentSignals = Object.values(signals).filter((s): s is RegionSignal => !!s);
  const meanQEff = presentSignals.length
    ? presentSignals.reduce((a, s) => a + s.qEff, 0) / presentSignals.length
    : 0;

  const globalExp = presentSignals.length
    ? presentSignals.reduce((a, s) => {
        const m = measurements.find(x => x.region === s.region);
        return a + (m ? m.overExposedRatio + m.underExposedRatio : 0);
      }, 0) / presentSignals.length
    : 0;
  const globalExpPenalty = clamp(globalExp - 0.15, 0, 0.5);

  const frameCount = options.frameCount ?? 1;
  const mc = clamp(
    0.5 * meanQEff + 0.3 * (axesPresent / 5) + 0.2 * clamp(frameCount / 3, 0, 1) - globalExpPenalty,
    0,
    1,
  );

  // status 판정
  if (mc < MC_GATE.usable || axesPresent < 4) {
    warnings.push('insufficient_signal');
    const base = emptyResult('insufficient', warnings, options);
    return { ...base, regions: measurements, axes, relations, measurementConfidence: mc };
  }

  const tone = computeTone(axes, { tau: options.tau });
  let status: PersonalColorStatus;
  if (!tone) {
    status = 'insufficient';
  } else if (tone.isMixed) {
    status = 'mixed';
  } else if (mc >= MC_GATE.definitive && tone.typeScore >= CLASSIFIER.neutralMin && calibrationApplied) {
    status = 'definitive';
  } else {
    status = 'provisional';
  }

  const palette = buildPalette(axes);

  return {
    schemaVersion: PERSONAL_COLOR_SCHEMA_VERSION,
    status,
    colorFrame: 'device-relative-awb-locked',
    calibrationApplied,
    preCalibrationHedge: !calibrationApplied,
    regions: measurements,
    deferredRegions: ['eye'],
    axes,
    relations,
    tone: status === 'insufficient' ? null : tone,
    palette,
    measurementConfidence: mc,
    warnings,
    artifacts: {
      referencePoints: { neutralSource: 'population', fixedRefsVersion: FIXED_REFS_VERSION },
      calibrationVersion: options.calibrationVersion ?? null,
      frameCount,
    },
    privacy: PERSONAL_COLOR_PRIVACY,
  };
}
