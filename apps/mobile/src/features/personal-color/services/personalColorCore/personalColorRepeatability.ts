// Phase 2 재현성 게이트 (순수). 같은 얼굴 N회 촬영 결과가 서로 얼마나 흔들리는지 측정.
// 목적: 측정이 12톤 분류를 감당할 만큼 재현되는지 판정 + τ·프로토타입 보정용 분포 수집.
// 하드 게이트: 동일 캡처가 시즌을 뒤집으면(seasonFlip) 분류를 신뢰할 수 없다 → fail.

import { TYPE_TO_SEASON } from './constants';
import type {
  AuraPersonalColorResult,
  AxisName,
  PersonalColor12Type,
  PersonalColorSeason,
} from './contracts';

const AXIS_NAMES: AxisName[] = ['temperature', 'value', 'chroma', 'clarity', 'contrast'];

export type RepeatabilitySample = {
  axes: Record<AxisName, number | null>;
  topType: PersonalColor12Type | null;
  usable: boolean; // status !== 'insufficient'
  hairPresent: boolean;
  skinPresent: boolean;
};

export type AxisSpread = {
  presentCount: number;
  mean: number | null;
  stdev: number | null; // 모집단 표준편차, present>=2일 때만
  spread: number | null; // max - min
};

export type RepeatabilityVerdict = 'pass' | 'marginal' | 'fail';

export type RepeatabilityReport = {
  sampleCount: number;
  usableCount: number;
  usableFraction: number;
  axes: Record<AxisName, AxisSpread>;
  topTypeFlipRate: number | null; // 1 - mode/usableWithTone
  seasonFlipRate: number | null;
  distinctTopTypes: PersonalColor12Type[];
  distinctSeasons: PersonalColorSeason[];
  modeTopType: PersonalColor12Type | null;
  modeSeason: PersonalColorSeason | null;
  matteHitRate: { hair: number; skin: number };
  verdict: RepeatabilityVerdict;
  reasons: string[];
};

// 판정 임계값 — 전부 calibration target. Phase 2 데이터가 쌓이면 조정.
export const REPEATABILITY_THRESHOLDS = {
  minUsableFraction: 0.6,
  axisStdevPass: 0.2, // 이 값 초과(어느 축이든) → marginal
  axisStdevFail: 0.4, // 초과(load-bearing 축) → fail
  // 시즌 flip은 임계값이 아니라 "동일 캡처에서 시즌이 하나라도 갈리면" fail(엄격). 아래 로직 참고.
  topTypeFlipMarginal: 0.5, // 이상(경계 포함) → marginal
  matteHitMarginal: 0.5,
} as const;

// AuraPersonalColorResult → 경량 샘플
export function toRepeatabilitySample(result: AuraPersonalColorResult): RepeatabilitySample {
  const axes = {} as Record<AxisName, number | null>;
  for (const name of AXIS_NAMES) {
    axes[name] = result.axes[name].value;
  }
  return {
    axes,
    topType: result.tone?.top ?? null,
    usable: result.status !== 'insufficient',
    hairPresent: result.regions.some(r => r.region === 'hair'),
    skinPresent: result.regions.some(r => r.region === 'skin'),
  };
}

function populationStdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function axisSpread(values: number[]): AxisSpread {
  if (values.length === 0) {
    return { presentCount: 0, mean: null, stdev: null, spread: null };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.max(...values) - Math.min(...values);
  return { presentCount: values.length, mean, stdev: populationStdev(values), spread };
}

function modeOf<T>(items: T[]): { mode: T | null; count: number; distinct: T[] } {
  const counts = new Map<T, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  let mode: T | null = null;
  let best = 0;
  for (const [k, c] of counts) {
    if (c > best) {
      best = c;
      mode = k;
    }
  }
  return { mode, count: best, distinct: [...counts.keys()] };
}

export function computeRepeatability(samples: RepeatabilitySample[]): RepeatabilityReport {
  const sampleCount = samples.length;
  const usable = samples.filter(s => s.usable);
  const usableCount = usable.length;
  const usableFraction = sampleCount > 0 ? usableCount / sampleCount : 0;

  // 축별 분산 (usable 샘플의 present 값만)
  const axes = {} as Record<AxisName, AxisSpread>;
  for (const name of AXIS_NAMES) {
    const values = usable
      .map(s => s.axes[name])
      .filter((v): v is number => v != null);
    axes[name] = axisSpread(values);
  }

  // 타입/시즌 flip (tone 있는 usable 샘플만)
  const withTone = usable.filter(s => s.topType != null);
  const topTypes = withTone.map(s => s.topType as PersonalColor12Type);
  const seasons = topTypes.map(t => TYPE_TO_SEASON[t]);
  const typeMode = modeOf(topTypes);
  const seasonMode = modeOf(seasons);
  const topTypeFlipRate = withTone.length > 0 ? 1 - typeMode.count / withTone.length : null;
  const seasonFlipRate = withTone.length > 0 ? 1 - seasonMode.count / withTone.length : null;

  // matte hit-rate (전체 샘플 기준)
  const matteHitRate = {
    hair: sampleCount > 0 ? samples.filter(s => s.hairPresent).length / sampleCount : 0,
    skin: sampleCount > 0 ? samples.filter(s => s.skinPresent).length / sampleCount : 0,
  };

  // 판정
  const reasons: string[] = [];
  const t = REPEATABILITY_THRESHOLDS;
  // fail은 season(load-bearing 분류) 안정성이 주도. load-bearing 축 = temperature·value.
  const loadBearingStdev = Math.max(axes.temperature.stdev ?? 0, axes.value.stdev ?? 0);
  // 어떤 축이든(chroma/clarity/contrast 포함) 흔들림이 세부 타입을 좌우하므로 marginal에 반영.
  const maxAxisStdev = Math.max(...AXIS_NAMES.map(n => axes[n].stdev ?? 0));

  let verdict: RepeatabilityVerdict = 'pass';

  if (sampleCount < 2) {
    verdict = 'fail';
    reasons.push('too_few_samples');
    return buildReport();
  }

  // --- FAIL 조건 (fail은 sticky) ---
  if (usableFraction < t.minUsableFraction) {
    verdict = 'fail';
    reasons.push('low_usable_fraction');
  }
  // 동일 얼굴 반복 촬영인데 시즌이 하나라도 갈리면 분류 신뢰 불가 → fail(엄격).
  // 단일 flip이 작은 N에서 임계값에 숨는 문제(false pass)를 원천 차단.
  if (withTone.length >= 2 && seasonMode.distinct.length > 1) {
    verdict = 'fail';
    reasons.push('season_flips');
  }
  if (loadBearingStdev > t.axisStdevFail) {
    verdict = 'fail';
    reasons.push('load_bearing_axis_unstable');
  }

  // --- MARGINAL 조건 ---
  if (verdict !== 'fail') {
    if (topTypeFlipRate != null && topTypeFlipRate >= t.topTypeFlipMarginal) {
      verdict = 'marginal';
      reasons.push('fine_type_flips');
    }
    // load-bearing 뿐 아니라 모든 축의 중간 이상 흔들림을 잡는다(1c 방어).
    if (maxAxisStdev > t.axisStdevPass) {
      verdict = 'marginal';
      reasons.push('axis_moderately_noisy');
    }
    // load-bearing 축이 usable 표본에서 2회 미만만 측정됨(자꾸 null) → 안정성 판단 불가(false pass 방어).
    if (usableCount >= 2 && (axes.temperature.presentCount < 2 || axes.value.presentCount < 2)) {
      verdict = 'marginal';
      reasons.push('insufficient_load_bearing_coverage');
    }
    if (matteHitRate.hair < t.matteHitMarginal) {
      verdict = 'marginal';
      reasons.push('hair_matte_low_hit_rate');
    }
  }

  return buildReport();

  function buildReport(): RepeatabilityReport {
    return {
      sampleCount,
      usableCount,
      usableFraction,
      axes,
      topTypeFlipRate,
      seasonFlipRate,
      distinctTopTypes: typeMode.distinct,
      distinctSeasons: seasonMode.distinct,
      modeTopType: typeMode.mode,
      modeSeason: seasonMode.mode,
      matteHitRate,
      verdict,
      reasons,
    };
  }
}
