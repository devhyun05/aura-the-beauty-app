// 1층 프로파일 조립 — 결정론 밴드(deriveMeasuredFeatureBands) + 사진 판정(VLM)
// 슬롯 채우기. 순수함수, RN·토큰 무의존(계약 러너가 plain node로 실행).
//
// 생략 규칙(설계 원칙): VLM 관찰이 'unclear'이거나, 정해진 enum 밖 값이거나,
// confidence가 임계 미만이면 슬롯을 null(판정 보류)로 둔다 — 0으로 치지 않는다.
// 백엔드는 확신이 없으면 'unclear'를 내도록 지시받으므로, 여기서 그걸 생략으로
// 번역하는 것이 "저confidence 생략" 규칙의 실체다.

import type {
  CheekHeightBand,
  CheekVolumeBand,
  ContrastBand,
  DensityBand,
  DoubleEyelidType,
  FaceFeatureObservationRaw,
  FaceFeatureObservations,
  FaceFeatureProfile,
  PresenceBand,
  SaggingBand,
  VlmObservation,
} from '../../../shared/contracts/faceFeatureProfile';
import {
  deriveMeasuredFeatureBands,
  type DeriveFeatureBandsInput,
} from './faceFeatureProfileDerive';

// VLM 관찰을 슬롯으로 승격하는 confidence 임계(잠정). 백엔드 코어 프롬프트의
// "confidence<0.5면 완화" 관례와 맞춘다. 오판정 샘플 수집 후 조정.
export const VLM_OBSERVATION_CONFIDENCE_THRESHOLD = 0.5;

// enum 유효값(런타임). 백엔드 FEATURE_OBSERVATION_ENUMS와 대응하되 'unclear'는
// 제외 — 'unclear'는 슬롯 null로 번역되기 때문. 파생 원천은 동일 설계 문서.
const EYELID_TYPES: readonly DoubleEyelidType[] = [
  'monolid',
  'inner',
  'outer',
  'hooded',
];
const SAGGING_BANDS: readonly SaggingBand[] = ['none', 'mild', 'pronounced'];
const PRESENCE_BANDS: readonly PresenceBand[] = ['present', 'absent'];
const DENSITY_BANDS: readonly DensityBand[] = ['sparse', 'medium', 'dense'];
const CHEEK_HEIGHT_BANDS: readonly CheekHeightBand[] = ['low', 'mid', 'high'];
const CHEEK_VOLUME_BANDS: readonly CheekVolumeBand[] = ['flat', 'medium', 'full'];
const CONTRAST_BANDS: readonly ContrastBand[] = ['low', 'medium', 'high'];

// 원본 관찰 → 타입된 VLM 슬롯. enum 밖 값('unclear' 포함)이거나 저confidence면 null.
function resolveObservation<B extends string>(
  raw: FaceFeatureObservationRaw | undefined,
  allowed: readonly B[],
  threshold: number,
): VlmObservation<B> {
  if (!raw) return null;
  if (raw.confidence < threshold) return null;
  const match = allowed.find(option => option === raw.value);
  if (!match) return null;
  return {value: match, confidence: raw.confidence, evidence: raw.evidence};
}

export type BuildFaceFeatureProfileInput = DeriveFeatureBandsInput & {
  observations?: FaceFeatureObservations | null;
  // 슬롯 승격 confidence 임계(기본 VLM_OBSERVATION_CONFIDENCE_THRESHOLD).
  vlmConfidenceThreshold?: number;
};

/**
 * 전체 1층 프로파일 조립: 측정 밴드 + VLM 슬롯. 측정은 결정론, VLM은 생략 규칙 적용.
 */
export function buildFaceFeatureProfile(
  input: BuildFaceFeatureProfileInput,
): FaceFeatureProfile {
  const base = deriveMeasuredFeatureBands(input);
  const obs = input.observations ?? undefined;
  if (!obs) {
    return base;
  }
  const t = input.vlmConfidenceThreshold ?? VLM_OBSERVATION_CONFIDENCE_THRESHOLD;

  return {
    ...base,
    eye: {
      ...base.eye,
      doubleEyelid: resolveObservation(obs.eyelidType, EYELID_TYPES, t),
      upperLidHooding: resolveObservation(obs.upperLidHooding, SAGGING_BANDS, t),
      lowerLidSagging: resolveObservation(obs.lowerLidSagging, SAGGING_BANDS, t),
      aegyoSal: resolveObservation(obs.aegyoSal, PRESENCE_BANDS, t),
    },
    brow: {
      ...base.brow,
      density: resolveObservation(obs.browDensity, DENSITY_BANDS, t),
    },
    lip: {
      ...base.lip,
      colorContrast: resolveObservation(obs.lipColorContrast, CONTRAST_BANDS, t),
    },
    cheek: {
      ...base.cheek,
      cheekboneHeight: resolveObservation(obs.cheekboneHeight, CHEEK_HEIGHT_BANDS, t),
      volume: resolveObservation(obs.cheekVolume, CHEEK_VOLUME_BANDS, t),
    },
  };
}
