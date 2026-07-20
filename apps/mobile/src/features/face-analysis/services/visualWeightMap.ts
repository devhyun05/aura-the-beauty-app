// 2층 시각 무게 지도 합성 — 1층 프로파일의 부위별 대비 관찰 → 부위 간 우세 분포.
// 순수함수, RN·토큰 무의존(계약 러너가 plain node로 실행).
//
// v0 산식(전부 잠정, weightMappingVersion으로 버전): 각 부위의 대비 관찰을 서수
// 무게(low=1, medium=2, high=3)로 바꾸고, 근거가 있는 부위끼리만 정규화한다.
// - 미해소(관찰 null) 부위는 가중치에서 제외(0이 아니다 — '무게 0'과 '판정 보류' 구분).
// - 눈썹은 진짜 대비 관찰이 없어 숱(density)을 프록시로 쓴다(sparse=1..dense=3). basis에 명시.
// - 부위 근거가 2개 미만이면 상대 우세를 말할 수 없어 dominant='insufficient'.

import type {
  ContrastBand,
  DensityBand,
  FaceFeatureProfile,
  VlmObservation,
} from '../../../shared/contracts/faceFeatureProfile';
import {
  VISUAL_WEIGHT_MAP_SCHEMA_VERSION,
  VISUAL_WEIGHT_MAPPING_VERSION,
  type ContrastLevelBand,
  type VisualWeightMap,
  type VisualWeightRegion,
} from '../../../shared/contracts/visualWeightMap';

// 서수 무게(잠정). 낮은 대비 부위도 0이 아닌 무게를 가진다(존재 자체의 시각 비중).
const CONTRAST_ORDINAL: Record<ContrastBand, number> = {low: 1, medium: 2, high: 3};
const DENSITY_ORDINAL: Record<DensityBand, number> = {sparse: 1, medium: 2, dense: 3};

// 우세 판정 마진(정규화 가중치): 1위와 2위 차가 이 값 미만이면 balanced. 잠정.
const DOMINANCE_MARGIN = 0.08;
// 전체 대비 수준 밴드 경계(서수 평균 1..3). 잠정.
const CONTRAST_LEVEL_LOW_MAX = 1.67;
const CONTRAST_LEVEL_MEDIUM_MAX = 2.33;

function contrastOrdinal(obs: VlmObservation<ContrastBand>): number | null {
  return obs ? CONTRAST_ORDINAL[obs.value] : null;
}

function densityOrdinal(obs: VlmObservation<DensityBand>): number | null {
  return obs ? DENSITY_ORDINAL[obs.value] : null;
}

function contrastLevelBand(meanOrdinal: number): ContrastLevelBand {
  if (meanOrdinal < CONTRAST_LEVEL_LOW_MAX) return 'low';
  if (meanOrdinal < CONTRAST_LEVEL_MEDIUM_MAX) return 'medium';
  return 'high';
}

/**
 * 1층 프로파일 → 2층 시각 무게 지도. 대비 근거가 있는 부위끼리만 정규화하고,
 * 근거가 부족하면(부위<2) 우세를 판정하지 않는다(over-claim 방지).
 */
export function buildVisualWeightMap(profile: FaceFeatureProfile): VisualWeightMap {
  const raw: Array<{region: VisualWeightRegion; ordinal: number; basis: string}> = [];

  const eye = contrastOrdinal(profile.eye.contrast);
  if (eye != null) {
    raw.push({region: 'eye', ordinal: eye, basis: `eye←eyeContrast(${profile.eye.contrast?.value})`});
  }
  const brow = densityOrdinal(profile.brow.density);
  if (brow != null) {
    // 진짜 대비 관찰이 없어 숱을 프록시로 사용 — basis에 명시.
    raw.push({region: 'brow', ordinal: brow, basis: `brow←browDensity proxy(${profile.brow.density?.value})`});
  }
  const cheek = contrastOrdinal(profile.cheek.contrast);
  if (cheek != null) {
    raw.push({region: 'cheek', ordinal: cheek, basis: `cheek←cheekContrast(${profile.cheek.contrast?.value})`});
  }
  const lip = contrastOrdinal(profile.lip.colorContrast);
  if (lip != null) {
    raw.push({region: 'lip', ordinal: lip, basis: `lip←lipColorContrast(${profile.lip.colorContrast?.value})`});
  }

  const coverage = raw.length;
  const base = {
    schemaVersion: VISUAL_WEIGHT_MAP_SCHEMA_VERSION,
    weightMappingVersion: VISUAL_WEIGHT_MAPPING_VERSION,
    coverage,
  };

  if (coverage === 0) {
    return {
      ...base,
      weights: {},
      dominantRegion: 'insufficient',
      contrastLevel: null,
      basis: ['no region contrast observations'],
    };
  }

  const total = raw.reduce((sum, r) => sum + r.ordinal, 0);
  const weights: Partial<Record<VisualWeightRegion, number>> = {};
  for (const r of raw) {
    weights[r.region] = r.ordinal / total;
  }

  const meanOrdinal = total / coverage;
  const contrastLevel = contrastLevelBand(meanOrdinal);

  // 우세: 근거 2개 미만이면 상대 비교 불가 → insufficient.
  let dominantRegion: VisualWeightMap['dominantRegion'];
  if (coverage < 2) {
    dominantRegion = 'insufficient';
  } else {
    const sorted = [...raw].sort((a, b) => b.ordinal - a.ordinal);
    const topWeight = weights[sorted[0].region] ?? 0;
    const secondWeight = weights[sorted[1].region] ?? 0;
    dominantRegion =
      topWeight - secondWeight < DOMINANCE_MARGIN ? 'balanced' : sorted[0].region;
  }

  return {
    ...base,
    weights,
    dominantRegion,
    contrastLevel,
    basis: raw.map(r => r.basis),
  };
}
