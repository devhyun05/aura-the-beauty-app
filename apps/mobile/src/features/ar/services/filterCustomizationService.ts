import type {MakeupArea, MakeupOptionGroupId} from '../../../shared/types/makeupGuide';
import {
  mockFilterShapeState,
  mockMakeupFilterOptionState,
} from '../mocks/filterCustomization.mock';

export type FilterShapeAdjustmentKey =
  | 'horizontal'
  | 'vertical'
  | 'scale'
  | 'rotation';

export type FilterShapeAdjustment = {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: number;
};

export type FilterShapePoint = {
  id: string;
  position: {
    x: number;
    y: number;
  };
  offset: {
    x: number;
    y: number;
  };
};

export type FilterShapeState = {
  selectedMakeupArea: MakeupArea;
  isOverlayVisible: boolean;
  shapePoints: readonly FilterShapePoint[];
  adjustments: Record<FilterShapeAdjustmentKey, FilterShapeAdjustment>;
};

export type MakeupFilterOptionState = {
  selectedMakeupArea: MakeupArea;
  selectedOptionGroup: MakeupOptionGroupId;
  selectedColorId: string;
  selectedTypeId: string;
  selectedTextureId: string;
};

function clampValue(adjustment: FilterShapeAdjustment, nextValue: number) {
  return Math.min(Math.max(nextValue, adjustment.min), adjustment.max);
}

export function getFilterShapeState(): FilterShapeState {
  return mockFilterShapeState;
}

export function updateFilterShapeAdjustment(
  state: FilterShapeState,
  key: FilterShapeAdjustmentKey,
  nextValue: number,
): FilterShapeState {
  const currentAdjustment = state.adjustments[key];

  return {
    ...state,
    adjustments: {
      ...state.adjustments,
      [key]: {
        ...currentAdjustment,
        value: clampValue(currentAdjustment, nextValue),
      },
    },
  };
}

export function getMakeupFilterOptionState(): MakeupFilterOptionState {
  return mockMakeupFilterOptionState;
}

export function updateMakeupFilterOptionSelection(
  state: MakeupFilterOptionState,
  optionGroup: MakeupOptionGroupId,
  optionId: string,
): MakeupFilterOptionState {
  if (optionGroup === 'color') {
    return {
      ...state,
      selectedColorId: optionId,
      selectedOptionGroup: optionGroup,
    };
  }

  if (optionGroup === 'type') {
    return {
      ...state,
      selectedTypeId: optionId,
      selectedOptionGroup: optionGroup,
    };
  }

  return {
    ...state,
    selectedTextureId: optionId,
    selectedOptionGroup: optionGroup,
  };
}
