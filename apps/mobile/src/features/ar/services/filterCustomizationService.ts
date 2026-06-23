import type {FacePartId} from '../../../shared/types/makeupGuide';
import {mockFilterLocationState} from '../mocks/filterCustomization.mock';

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

function clampValue(adjustment: FilterLocationAdjustment, nextValue: number) {
  return Math.min(Math.max(nextValue, adjustment.min), adjustment.max);
}

export function getMockFilterLocationState(): FilterLocationState {
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
