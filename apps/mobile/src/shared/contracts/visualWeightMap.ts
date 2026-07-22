// 2층 — 시각 무게 지도(VisualWeightMap). 1층 프로파일의 부위별 대비 관찰을
// 부위 간 자기참조 우세 분포로 합성한다("내 얼굴 안 어디에 시각 요소가 쏠렸나").
//
// 근거(리서치 W-1/W-2/W-3): 이목구비-피부 간 대비는 부위별로 측정 가능한 얼굴
// 속성이고, 대비가 인상(부드러운↔또렷한)을 인과적으로 바꾼다. 여기서는 모집단
// 절대 기준이 아니라 '내 얼굴 안 상대 우세'만 만든다(자기참조 원칙).
// RN·토큰 무의존(계약 러너가 plain node로 실행).

export const VISUAL_WEIGHT_MAP_SCHEMA_VERSION = 'aura-visual-weight.v0' as const;

// 가중치 산식(밴드→서수, 정규화, 우세 마진·대비 밴드 경계)의 버전. 튜닝은 이 버전만
// 증가(schemaVersion과 분리). 초기값은 전부 잠정.
export const VISUAL_WEIGHT_MAPPING_VERSION = 'weights-v0-provisional' as const;

export type VisualWeightRegion = 'brow' | 'eye' | 'cheek' | 'lip';

// 우세 판정: 특정 부위 / 균형(뚜렷한 우세 없음) / insufficient(근거 부족으로 판정 보류).
export type VisualWeightDominant = VisualWeightRegion | 'balanced' | 'insufficient';

export type ContrastLevelBand = 'low' | 'medium' | 'high';

export type VisualWeightMap = {
  schemaVersion: typeof VISUAL_WEIGHT_MAP_SCHEMA_VERSION;
  weightMappingVersion: string;
  // 대비 근거가 있던 부위에 대한 정규화 가중치(합 1.0). 미해소 부위는 키 없음 —
  // 0이 아니다(판정 보류와 '무게 0'을 구분).
  weights: Partial<Record<VisualWeightRegion, number>>;
  dominantRegion: VisualWeightDominant;
  // 전체 이목구비 대비 수준 → 인상(부드러운↔또렷한)의 근거(W-2). null = 근거 없음.
  contrastLevel: ContrastLevelBand | null;
  // 4부위 중 대비 근거가 있던 부위 수(0..4) — 신뢰도. <2면 dominant='insufficient'.
  coverage: number;
  // provenance — 각 부위 무게가 어떤 관찰에서 나왔나(감사·재현).
  basis: string[];
};
