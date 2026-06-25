import type {FacePartId, StyleOptionGroupId} from '../../../shared/types/makeupGuide';
import {
  mockFilterLocationState,
  mockFilterStyleState,
} from '../mocks/filterCustomization.mock';

export type FilterLocationAdjustmentKey =
  | 'horizontal'
  | 'vertical'
  | 'scale'
  | 'rotation';

export type FilterLocationAdjustment = {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: number;
};

export type FilterLandmarkPoint = {
  id: string;
  x: number;
  y: number;
};

export type FilterLocationState = {
  selectedFacePartId: FacePartId;
  isOverlayVisible: boolean;
  landmarks: readonly FilterLandmarkPoint[];
  adjustments: Record<FilterLocationAdjustmentKey, FilterLocationAdjustment>;
};

export type FilterStyleState = {
  selectedFacePartId: FacePartId;
  selectedOptionGroup: StyleOptionGroupId;
  selectedColorId: string;
  selectedTypeId: string;
  selectedTextureId: string;
};

function clampValue(adjustment: FilterLocationAdjustment, nextValue: number) {
  return Math.min(Math.max(nextValue, adjustment.min), adjustment.max);
}

export function getFilterLocationState(): FilterLocationState {
  return mockFilterLocationState;
}

export function updateFilterLocationAdjustment(
  state: FilterLocationState,
  key: FilterLocationAdjustmentKey,
  nextValue: number,
): FilterLocationState {
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

export function getFilterStyleState(): FilterStyleState {
  return mockFilterStyleState;
}

export function updateFilterStyleSelection(
  state: FilterStyleState,
  optionGroup: StyleOptionGroupId,
  optionId: string,
): FilterStyleState {
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
