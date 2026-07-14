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

export type FullFaceMakeupEditState = {
  selectedRegion: MakeupRecipeRegion;
  controls: FullFaceRegionControls;
  sourceFrameMetadata?: FullFaceMakeupSourceInput;
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
