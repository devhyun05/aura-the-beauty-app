// 5축 계산. within-frame 상대 신호만 사용.
// bug #1 수정: Value/Chroma를 고정 ref 기준으로 센터링·스케일 → 진짜 [-1,1].
// bug #2 수정: q_region을 재정규화 aggregate(Σwvq/Σwq)로 결합 → 저신뢰가 축을
//   0으로 수축시키거나 고신뢰 소수 부위가 부호를 탈취하지 못함.

import { clamp, deltaE00, labToLch, rgb8ToLab } from './colorMath';
import {
  AREA_MIN,
  AXIS_Q_FLOOR,
  AXIS_WEIGHTS,
  CONTRAST,
  EXPOSURE_TOLERANCE,
  REFS,
} from './constants';
import type {
  AuraAxis,
  AxisName,
  Lab,
  NativeRegionStats,
  RegionKey,
} from './contracts';

export type RegionSignal = {
  region: RegionKey;
  lab: Lab;
  sigma: number; // 평균 채널 표준편차 (8-bit)
  qEff: number;
};

export type RegionSignals = Partial<Record<RegionKey, RegionSignal>>;

export type AxisComputation = {
  axes: Record<AxisName, AuraAxis>;
  relations: {
    dL_skinHair: number | null;
    dL_skinLip: number | null;
    dE00_skinHair: number | null;
    dE00_skinLip: number | null;
  };
};

const RELATIVE: AuraAxis['basis'] = 'within-frame-relative';

function stdevFromVariance(v: { r: number; g: number; b: number }): number {
  const sr = Math.sqrt(Math.max(0, v.r));
  const sg = Math.sqrt(Math.max(0, v.g));
  const sb = Math.sqrt(Math.max(0, v.b));
  return (sr + sg + sb) / 3;
}

// 네이티브 부위 통계 → 유효 confidence
export function effectiveConfidence(stats: NativeRegionStats, region: RegionKey): number {
  const expPenalty = clamp(
    1 -
      2 * Math.max(0, stats.overexposedRatio - EXPOSURE_TOLERANCE) -
      2 * Math.max(0, stats.underexposedRatio - EXPOSURE_TOLERANCE),
    0,
    1,
  );
  const areaPenalty = clamp(stats.areaRatio / AREA_MIN[region], 0, 1);
  return clamp(stats.confidence, 0, 1) * expPenalty * areaPenalty;
}

// 네이티브 통계 → RegionSignal (Lab 변환 포함)
export function toRegionSignal(stats: NativeRegionStats, region: RegionKey): RegionSignal {
  return {
    region,
    lab: rgb8ToLab(stats.rgbMean),
    sigma: stdevFromVariance(stats.rgbVariance),
    qEff: effectiveConfidence(stats, region),
  };
}

type Entry = { w: number; v: number; qEff: number };

// bug #2 수정의 핵심: q 재정규화 결합
export function aggregate(
  entries: Entry[],
  qFloor = AXIS_Q_FLOOR,
): { value: number | null; floored: boolean; support: number } {
  let W = 0;
  let acc = 0;
  for (const e of entries) {
    W += e.w * e.qEff;
    acc += e.w * e.v * e.qEff;
  }
  if (W < qFloor) return { value: null, floored: true, support: W };
  return { value: clamp(acc / W, -1, 1), floored: false, support: W };
}

function axisFrom(result: { value: number | null; floored: boolean; support: number }): AuraAxis {
  return {
    value: result.value,
    confidence: clamp(result.support, 0, 1),
    floored: result.floored,
    basis: RELATIVE,
  };
}

// ---- 부위별 정규화 sub-feature ----
function tempFeature(lab: Lab, ref: number, scale: number): number {
  return clamp((lab.b - lab.a - ref) / scale, -1, 1);
}
function valueFeature(L: number, dRef: number, dScale: number): number {
  return clamp((1 - L / 100 - dRef) / dScale, -1, 1);
}
function chromaFeature(lab: Lab, cRef: number, cScale: number): number {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  return clamp((C - cRef) / cScale, -1, 1);
}

export function computeAxes(signals: RegionSignals): AxisComputation {
  const skin = signals.skin;
  const hair = signals.hair;
  const lip = signals.lip;

  // Temperature
  const tempEntries: Entry[] = [];
  if (skin) {
    tempEntries.push({
      w: AXIS_WEIGHTS.temperature.skin,
      v: tempFeature(skin.lab, REFS.uRefSkin, REFS.uScaleSkin),
      qEff: skin.qEff,
    });
  }
  if (hair) {
    tempEntries.push({
      w: AXIS_WEIGHTS.temperature.hair,
      v: tempFeature(hair.lab, REFS.uRefHair, REFS.uScaleHair),
      qEff: hair.qEff,
    });
  }
  if (lip) {
    tempEntries.push({
      w: AXIS_WEIGHTS.temperature.lip,
      v: tempFeature(lip.lab, REFS.uRefLip, REFS.uScaleLip),
      qEff: lip.qEff,
    });
  }
  const temperature = axisFrom(aggregate(tempEntries));

  // Value
  const valueEntries: Entry[] = [];
  if (skin) {
    valueEntries.push({
      w: AXIS_WEIGHTS.value.skin,
      v: valueFeature(skin.lab.L, REFS.dRefSkin, REFS.dScaleSkin),
      qEff: skin.qEff,
    });
  }
  if (hair) {
    valueEntries.push({
      w: AXIS_WEIGHTS.value.hair,
      v: valueFeature(hair.lab.L, REFS.dRefHair, REFS.dScaleHair),
      qEff: hair.qEff,
    });
  }
  if (lip) {
    valueEntries.push({
      w: AXIS_WEIGHTS.value.lip,
      v: valueFeature(lip.lab.L, REFS.dRefLip, REFS.dScaleLip),
      qEff: lip.qEff,
    });
  }
  const value = axisFrom(aggregate(valueEntries));

  // Chroma (hair 제외)
  const chromaEntries: Entry[] = [];
  if (skin) {
    chromaEntries.push({
      w: AXIS_WEIGHTS.chroma.skin,
      v: chromaFeature(skin.lab, REFS.cRefSkin, REFS.cScaleSkin),
      qEff: skin.qEff,
    });
  }
  if (lip) {
    chromaEntries.push({
      w: AXIS_WEIGHTS.chroma.lip,
      v: chromaFeature(lip.lab, REFS.cRefLip, REFS.cScaleLip),
      qEff: lip.qEff,
    });
  }
  const chroma = axisFrom(aggregate(chromaEntries));

  // Relations
  const dL_skinHair = skin && hair ? skin.lab.L - hair.lab.L : null;
  const dL_skinLip = skin && lip ? skin.lab.L - lip.lab.L : null;
  const dE00_skinHair = skin && hair ? deltaE00(skin.lab, hair.lab) : null;
  const dE00_skinLip = skin && lip ? deltaE00(skin.lab, lip.lab) : null;

  // Contrast (관계식 + min q)
  const contrast = computeContrast(skin, hair, lip, {
    dL_skinHair,
    dL_skinLip,
    dE00_skinHair,
    dE00_skinLip,
  });

  // Clarity (복합; skin 필수)
  const clarity = computeClarity(skin, lip, contrast);

  return {
    axes: { temperature, value, chroma, clarity, contrast },
    relations: { dL_skinHair, dL_skinLip, dE00_skinHair, dE00_skinLip },
  };
}

// pair별로 물리 기준에 센터링된 명도/색 대비 (±1). 검은 머리라는 상수 요인이
// 축을 +1로 박지 않도록, "보통" 명도차/색차를 0으로 둔다.
function pairContrast(delta: number, ref: number, scale: number): number {
  return clamp((Math.abs(delta) - ref) / scale, -1, 1);
}

function computeContrast(
  skin: RegionSignal | undefined,
  hair: RegionSignal | undefined,
  lip: RegionSignal | undefined,
  rel: {
    dL_skinHair: number | null;
    dL_skinLip: number | null;
    dE00_skinHair: number | null;
    dE00_skinLip: number | null;
  },
): AuraAxis {
  const nullAxis: AuraAxis = { value: null, confidence: 0, floored: true, basis: RELATIVE };
  // 대비는 skin↔hair 관계가 지배적·신뢰 가능. hair가 없으면 lip 단독은 부호가
  // 뒤집혀 시즌을 흔들므로(적대 검증 확정) 축을 null 처리해 분류에서 드롭한다.
  if (!skin || !hair || rel.dL_skinHair == null || rel.dE00_skinHair == null) return nullAxis;

  // 필수 pair: skin↔hair (자기 물리 기준에 센터링).
  let lumNum = CONTRAST.pairWeightSkinHair * pairContrast(rel.dL_skinHair, CONTRAST.lRefSkinHair, CONTRAST.lScaleSkinHair);
  let lumDen = CONTRAST.pairWeightSkinHair;
  let colNum = CONTRAST.pairWeightSkinHair * pairContrast(rel.dE00_skinHair, CONTRAST.eRefSkinHair, CONTRAST.eScaleSkinHair);
  let colDen = CONTRAST.pairWeightSkinHair;

  // 선택 pair: skin↔lip — lip 자체 신뢰가 충분할 때만 가산(약한 lip이 축을 veto하지 못하게).
  if (lip && lip.qEff >= AXIS_Q_FLOOR && rel.dL_skinLip != null && rel.dE00_skinLip != null) {
    lumNum += CONTRAST.pairWeightSkinLip * pairContrast(rel.dL_skinLip, CONTRAST.lRefSkinLip, CONTRAST.lScaleSkinLip);
    lumDen += CONTRAST.pairWeightSkinLip;
    colNum += CONTRAST.pairWeightSkinLip * pairContrast(rel.dE00_skinLip, CONTRAST.eRefSkinLip, CONTRAST.eScaleSkinLip);
    colDen += CONTRAST.pairWeightSkinLip;
  }

  const lumTerm = lumNum / lumDen;
  const colTerm = colNum / colDen;
  const value = clamp(CONTRAST.weightLum * lumTerm + CONTRAST.weightColor * colTerm, -1, 1);
  // 신뢰도는 필수 pair(skin·hair)에서만 — 약한 lip이 축 전체를 veto하지 않도록.
  const qContrast = Math.min(skin.qEff, hair.qEff);
  if (qContrast < AXIS_Q_FLOOR) return nullAxis;
  return { value, confidence: clamp(qContrast, 0, 1), floored: false, basis: RELATIVE };
}

// Clarity = 채도 선명함 + (센터링된) 대비. 이전의 −varSkin 항은 matte 평균이 피부
// 분산을 늘 낮게 만들어 모두를 '클리어'로 박아버려 제거했다.
function computeClarity(
  skin: RegionSignal | undefined,
  lip: RegionSignal | undefined,
  contrast: AuraAxis,
): AuraAxis {
  const nullAxis: AuraAxis = { value: null, confidence: 0, floored: true, basis: RELATIVE };
  if (!skin || skin.qEff < AXIS_Q_FLOOR) return nullAxis;
  const chrSkin = chromaFeature(skin.lab, REFS.cRefSkin, REFS.cScaleSkin);
  const chrLip = lip ? chromaFeature(lip.lab, REFS.cRefLip, REFS.cScaleLip) : null;
  const contrastTerm = contrast.value ?? 0;
  const value =
    chrLip != null
      ? clamp(0.45 * chrSkin + 0.35 * chrLip + 0.2 * contrastTerm, -1, 1)
      : clamp(0.7 * chrSkin + 0.3 * contrastTerm, -1, 1);
  const qClarity = contrast.value != null ? Math.min(skin.qEff, contrast.confidence) : skin.qEff;
  return { value, confidence: clamp(qClarity, 0, 1), floored: false, basis: RELATIVE };
}
