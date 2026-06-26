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

export type FilterShapePointCoordinate = FilterShapePoint['position'];

export type FilterShapePresetPoint = FilterShapePoint & {
  resolvedPosition: FilterShapePointCoordinate;
};

export type FilterShapePreset = {
  selectedMakeupArea: MakeupArea;
  shapePoints: readonly FilterShapePresetPoint[];
  adjustments: FilterShapeState['adjustments'];
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

export function updateFilterShapePointOffset(
  state: FilterShapeState,
  shapePointId: string,
  offset: FilterShapePointCoordinate,
): FilterShapeState {
  return {
    ...state,
    shapePoints: state.shapePoints.map(shapePoint =>
      shapePoint.id === shapePointId
        ? {
            ...shapePoint,
            offset,
          }
        : shapePoint,
    ),
  };
}

export function resetFilterShapePointOffset(
  state: FilterShapeState,
  shapePointId: string,
): FilterShapeState {
  return updateFilterShapePointOffset(state, shapePointId, {x: 0, y: 0});
}

export function resetFilterShapePoints(state: FilterShapeState): FilterShapeState {
  return {
    ...state,
    shapePoints: state.shapePoints.map(shapePoint => ({
      ...shapePoint,
      offset: {x: 0, y: 0},
    })),
  };
}

export function getResolvedShapePointPosition(
  shapePoint: FilterShapePoint,
): FilterShapePointCoordinate {
  return {
    x: shapePoint.position.x + shapePoint.offset.x,
    y: shapePoint.position.y + shapePoint.offset.y,
  };
}

export function createShapePresetFromState(
  state: FilterShapeState,
): FilterShapePreset {
  return {
    selectedMakeupArea: state.selectedMakeupArea,
    shapePoints: state.shapePoints.map(shapePoint => ({
      ...shapePoint,
      offset: {...shapePoint.offset},
      position: {...shapePoint.position},
      resolvedPosition: getResolvedShapePointPosition(shapePoint),
    })),
    adjustments: state.adjustments,
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
