import {
  DEFAULT_FULL_FACE_REGION_CONTROLS,
  MAKEUP_RECIPE_REGIONS,
  PRODUCT_REGION_LABELS,
  REGION_CANDIDATE_OPTIONS,
  REGION_COLOR_OPTIONS,
  REGION_ADJUSTMENT_FIELD_SCHEMAS,
  REGION_FINISH_OPTIONS,
  buildFullFaceMakeupRecipe,
  createDefaultRegionParams,
  type FullFaceMakeupRecipe,
  type FullFaceMakeupSourceInput,
  type FullFaceRegionCandidateOption,
  type FullFaceRegionColorOption,
  type FullFaceRegionControl,
  type FullFaceRegionControls,
  type FullFaceRegionFinishOption,
  type MakeupRecipeRegion,
  type RegionAdjustmentFieldSchema,
} from '../../../shared/contracts/fullFaceMakeupRecipe';
import type {BrowThicknessProfile} from '../stencil/src/bridge/types';

// 추천 룩이 controls(7부위) 밖의 세부 레인을 스텐실 번역에 전달하는 사이드채널.
// controls는 MAKEUP_RECIPE_REGIONS 고정 키라 립글로스·아래 섀도·애교살 전용
// 슬롯이 없다 — createRecommendedStencilLook만 소비하고,
// createFullFaceMakeupRecipeFromEditState는 controls만 읽으므로 레시피
// 와이어(ApplyRecipeJson)에는 절대 실리지 않는다(미지 region 와이프 리스크 0).
export type RecommendedLookLanes = {
  /** 립 가이드 존재 시 항상 유효 hex(플랜 '광택' 색 또는 '#FFFFFF' 클리어).
   *  shape: 글로스 존 0=전체 1=중앙 도트 2=아랫입술만 — 텍스트 신호로 파생. */
  lipGloss?: {colorHex: string; shape: number};
  /** 립 가이드 존재 시 프리셋 표준 소프트 경계(0.35). innerColorHex는 플랜
   *  '안쪽 포인트' 색 — 있으면 그라데 립(lipColor2 + lipGradient 0.75). */
  lipStyle?: {edgeFeather: number; innerColorHex?: string};
  /** cheek 가이드 존재 시 블러셔 모양(AR_BLUSH_SHAPES value + 카탈로그 lift/spread). */
  blushShape?: {value: number; lift: number; spread: number};
  /** brow 가이드 존재 시 눈썹룩(sys:var:brow:*) 파라미터 — 레퍼런스 알파
   *  browStyle 한 겹 계약. 절차 축(browIntensity/파우더/펜슬/라이트너)은 개편으로
   *  폐지됐고 알파 마스크 위에 기하 밴드를 덧그려 어긋나므로 싣지 않는다(BARE가
   *  명시 0이라 생략으로 충분). 모양은 에셋(styleTemplate)이 소유하므로 두께·
   *  정의감은 두께 축과 강도로 표현한다. shape는 컴포저 눈썹 UI 되읽기 키. */
  brow?: {
    shape: number;
    styleTemplate: number;
    styleIntensity: number;
    thicknessProfile: BrowThicknessProfile;
    thickness: number;
    arch: number;
  };
  /** eye 가이드 존재 표식. colorHex는 플랜 '깊이' 색만(없으면 가이드 색 폴백).
   *  '깊이' 색은 아래 밴드와 위 딥 포인트 밴드(눈꼬리 V)가 공유한다. */
  lowerShadow?: {colorHex?: string};
  /** eye 플랜 '베이스' 색 — 위 섀도 다층의 베이스 워시 밴드(넓고 높게, 매트). */
  upperBaseColorHex?: string;
  /** 섀도 실루엣 = 카탈로그 마스크. 절차 프로파일의 각진 양옆 경계 대신 마스크가
   *  실루엣을 소유한다(위 마스크는 프로파일 커버리지에 곱해지는 게이트, 아래는
   *  profile 6 실루엣 정본). 파일명만 담고 streaming URI는 번역층이 조립하며,
   *  위/아래는 검증된 페어링(lookVariants·생성기 접미사 규칙)으로만 짝짓는다. */
  shadowMask?: {upper: string; lower: string};
  /** 애교살 — 항상 동반(룩 언급 무관). shimmer·height는 셰이더가 참조하지 않는
   *  죽은 축이라 레인에서 제외한다(finish는 새틴 0이 최대 발색). */
  aegyo?: {
    colorHex: string;
    intensity: number;
    finish: number;
  };
  /** 플랜 '라인' 색 중 딥(저휘도) 통과분만 — 밝은 색 세탁 방지. */
  eyelinerColorHex?: string;
};

export type FullFaceMakeupEditState = {
  selectedRegion: MakeupRecipeRegion;
  controls: FullFaceRegionControls;
  sourceFrameMetadata?: FullFaceMakeupSourceInput;
  lookLanes?: RecommendedLookLanes;
};

export type FullFaceMakeupSavedContract = {
  editState: FullFaceMakeupEditState;
  recipe: FullFaceMakeupRecipe;
  savedPackageId: string;
  source: SavedArLookSource;
};

export type SavedArLookSource =
  | 'face-analysis-full-face'
  | 'ar_editor'
  | 'preset';

export const FULL_FACE_MAKEUP_EDIT_REGIONS = MAKEUP_RECIPE_REGIONS;

export function getInitialFullFaceMakeupEditState({
  sourceFrameMetadata,
}: {
  sourceFrameMetadata?: FullFaceMakeupSourceInput;
} = {}): FullFaceMakeupEditState {
  return {
    selectedRegion: 'lip',
    controls: cloneFullFaceRegionControls(DEFAULT_FULL_FACE_REGION_CONTROLS),
    sourceFrameMetadata,
  };
}

export function selectFullFaceMakeupRegion(
  state: FullFaceMakeupEditState,
  region: MakeupRecipeRegion,
): FullFaceMakeupEditState {
  return {
    ...state,
    selectedRegion: region,
  };
}

export function updateFullFaceMakeupRegionParam({
  state,
  region,
  fieldName,
  direction,
}: {
  state: FullFaceMakeupEditState;
  region: MakeupRecipeRegion;
  fieldName: string;
  direction: 'decrease' | 'increase';
}): FullFaceMakeupEditState {
  const field = getFullFaceMakeupAdjustmentFields(region).find(
    candidate => candidate.name === fieldName,
  );

  if (!field) {
    return state;
  }

  const currentRegionControl = state.controls[region];
  const currentValue =
    currentRegionControl.params[fieldName] ?? field.defaultValue;
  const nextValue = clampToField(
    currentValue + (direction === 'increase' ? field.step : -field.step),
    field,
  );

  return updateFullFaceMakeupRegionControl(state, region, {
    ...currentRegionControl,
    params: {
      ...currentRegionControl.params,
      [fieldName]: nextValue,
    },
  });
}

export function updateFullFaceMakeupRegionEnabled(
  state: FullFaceMakeupEditState,
  region: MakeupRecipeRegion,
  enabled: boolean,
): FullFaceMakeupEditState {
  return updateFullFaceMakeupRegionControl(state, region, {
    ...state.controls[region],
    enabled,
  });
}

export function updateFullFaceMakeupRegionIntensity({
  state,
  region,
  direction,
}: {
  state: FullFaceMakeupEditState;
  region: MakeupRecipeRegion;
  direction: 'decrease' | 'increase';
}): FullFaceMakeupEditState {
  const currentRegionControl = state.controls[region];
  const nextIntensity = clampNumber(
    roundToStep(
      currentRegionControl.intensity + (direction === 'increase' ? 0.05 : -0.05),
      0.05,
    ),
    0,
    1,
  );

  return updateFullFaceMakeupRegionControl(state, region, {
    ...currentRegionControl,
    intensity: nextIntensity,
  });
}

export function updateFullFaceMakeupRegionColor(
  state: FullFaceMakeupEditState,
  region: MakeupRecipeRegion,
  colorHex: string,
): FullFaceMakeupEditState {
  const knownColor = getFullFaceMakeupColorOptions(region).some(
    option => option.hex === colorHex,
  );

  if (!knownColor) {
    return state;
  }

  return updateFullFaceMakeupRegionControl(state, region, {
    ...state.controls[region],
    colorHex,
  });
}

export function updateFullFaceMakeupRegionFinish(
  state: FullFaceMakeupEditState,
  region: MakeupRecipeRegion,
  finishId: string,
): FullFaceMakeupEditState {
  const finishOption = getFullFaceMakeupFinishOptions(region).find(
    option => option.id === finishId,
  );

  if (!finishOption) {
    return state;
  }

  return updateFullFaceMakeupRegionControl(state, region, {
    ...state.controls[region],
    finish: finishOption.finish,
    textureAmount: finishOption.textureAmount,
    roughness: finishOption.roughness,
    specular: finishOption.specular,
    specularPower: finishOption.specularPower,
    glossBoost: finishOption.glossBoost,
    shimmer: finishOption.shimmer,
  });
}

export function updateFullFaceMakeupRegionCandidate(
  state: FullFaceMakeupEditState,
  region: MakeupRecipeRegion,
  candidateOptionId: string,
): FullFaceMakeupEditState {
  const candidateOption = getFullFaceMakeupCandidateOptions(region).find(
    option => option.id === candidateOptionId,
  );

  if (!candidateOption) {
    return state;
  }

  return updateFullFaceMakeupRegionControl(state, region, {
    ...state.controls[region],
    candidateId: candidateOption.candidateId,
    maskTextureId: candidateOption.maskTextureId,
  });
}

export function createFullFaceMakeupRecipeFromEditState(
  state: FullFaceMakeupEditState,
  sentAtMs = Date.now(),
): FullFaceMakeupRecipe {
  return buildFullFaceMakeupRecipe({
    controls: state.controls,
    recipeId: `full-face-adjusted-${sentAtMs}`,
    recipeBatchId: `full-face-adjusted-${sentAtMs}-batch`,
    sentAtMs,
    sourceFrameMetadata: state.sourceFrameMetadata,
  });
}

export function createFullFaceMakeupSavedContract({
  editState,
  recipe,
  savedAtMs = Date.now(),
  source = 'face-analysis-full-face',
}: {
  editState: FullFaceMakeupEditState;
  recipe: FullFaceMakeupRecipe;
  savedAtMs?: number;
  source?: SavedArLookSource;
}): FullFaceMakeupSavedContract {
  return {
    editState,
    recipe,
    savedPackageId: `full-face-saved-${savedAtMs}`,
    source,
  };
}

export function getFullFaceMakeupRegionLabel(
  region: MakeupRecipeRegion,
): string {
  return PRODUCT_REGION_LABELS[region];
}

export function getFullFaceMakeupAdjustmentFields(
  region: MakeupRecipeRegion,
): readonly RegionAdjustmentFieldSchema[] {
  return REGION_ADJUSTMENT_FIELD_SCHEMAS[region];
}

export function getFullFaceMakeupColorOptions(
  region: MakeupRecipeRegion,
): readonly FullFaceRegionColorOption[] {
  return REGION_COLOR_OPTIONS[region];
}

export function getFullFaceMakeupFinishOptions(
  region: MakeupRecipeRegion,
): readonly FullFaceRegionFinishOption[] {
  return REGION_FINISH_OPTIONS[region];
}

export function getFullFaceMakeupCandidateOptions(
  region: MakeupRecipeRegion,
): readonly FullFaceRegionCandidateOption[] {
  return REGION_CANDIDATE_OPTIONS[region];
}

function updateFullFaceMakeupRegionControl(
  state: FullFaceMakeupEditState,
  region: MakeupRecipeRegion,
  control: FullFaceRegionControl,
): FullFaceMakeupEditState {
  return {
    ...state,
    controls: {
      ...state.controls,
      [region]: {
        ...control,
        params: {
          ...control.params,
        },
      },
    },
  };
}

function cloneFullFaceRegionControls(
  controls: FullFaceRegionControls,
): FullFaceRegionControls {
  return MAKEUP_RECIPE_REGIONS.reduce((clonedControls, region) => {
    const control = controls[region];

    return {
      ...clonedControls,
      [region]: {
        ...control,
        params: {
          ...createDefaultRegionParams(region),
          ...control.params,
        },
      },
    };
  }, {} as FullFaceRegionControls);
}

function clampToField(value: number, field: RegionAdjustmentFieldSchema): number {
  return clampNumber(roundToStep(value, field.step), field.min, field.max);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToStep(value: number, step: number): number {
  const decimalPlaces = (step.toString().split('.')[1] ?? '').length;

  return Number(value.toFixed(decimalPlaces));
}
