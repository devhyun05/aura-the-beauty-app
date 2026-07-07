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

export type FilterShapePreviewSize = {
  width: number;
  height: number;
};

export type FilterShapePresetPoint = FilterShapePoint & {
  resolvedPosition: FilterShapePointCoordinate;
};

export type FilterShapePreset = {
  selectedMakeupArea: MakeupArea;
  shapePoints: readonly FilterShapePresetPoint[];
  adjustments: FilterShapeState['adjustments'];
};

export type MakeupFilterShapePresetSaveValue = {
  makeupFilterId: string;
  makeupLookId?: string;
  shapePreset: FilterShapePreset;
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

const SHAPE_POINT_SYMMETRY_PAIR_IDS: Readonly<Record<string, string>> = {
  'left-brow': 'right-brow',
  'right-brow': 'left-brow',
  'left-cheek': 'right-cheek',
  'right-cheek': 'left-cheek',
};

function clampValue(adjustment: FilterShapeAdjustment, nextValue: number) {
  return Math.min(Math.max(nextValue, adjustment.min), adjustment.max);
}

function clampCoordinate(value: number) {
  return Math.min(Math.max(value, 0), 100);
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

export function getFilterShapeAdjustmentValueFromRatio(
  adjustment: FilterShapeAdjustment,
  ratio: number,
): number {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const rawValue = adjustment.min + (adjustment.max - adjustment.min) * clampedRatio;
  const steppedValue = Math.round(rawValue / adjustment.step) * adjustment.step;

  return clampValue(adjustment, Number(steppedValue.toFixed(4)));
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

export function getShapePointSymmetryPairId(shapePointId: string): string | undefined {
  return SHAPE_POINT_SYMMETRY_PAIR_IDS[shapePointId];
}

export function getMirroredShapePointOffset(
  offset: FilterShapePointCoordinate,
): FilterShapePointCoordinate {
  return {
    x: -offset.x,
    y: offset.y,
  };
}

export function updateFilterShapePointOffsetWithSymmetry(
  state: FilterShapeState,
  shapePointId: string,
  offset: FilterShapePointCoordinate,
  isSymmetryEnabled: boolean,
): FilterShapeState {
  const nextState = updateFilterShapePointOffset(state, shapePointId, offset);
  const pairedShapePointId = getShapePointSymmetryPairId(shapePointId);

  if (!isSymmetryEnabled || !pairedShapePointId) {
    return nextState;
  }

  return updateFilterShapePointOffset(
    nextState,
    pairedShapePointId,
    getMirroredShapePointOffset(offset),
  );
}

export function resetFilterShapePointOffset(
  state: FilterShapeState,
  shapePointId: string,
): FilterShapeState {
  return updateFilterShapePointOffset(state, shapePointId, {x: 0, y: 0});
}

export function resetFilterShapePointOffsetWithSymmetry(
  state: FilterShapeState,
  shapePointId: string,
  isSymmetryEnabled: boolean,
): FilterShapeState {
  return updateFilterShapePointOffsetWithSymmetry(
    state,
    shapePointId,
    {x: 0, y: 0},
    isSymmetryEnabled,
  );
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

export function getShapePointOffsetFromDrag({
  shapePoint,
  translation,
  previewSize,
}: {
  shapePoint: FilterShapePoint;
  translation: FilterShapePointCoordinate;
  previewSize: FilterShapePreviewSize;
}): FilterShapePointCoordinate {
  if (previewSize.width <= 0 || previewSize.height <= 0) {
    return shapePoint.offset;
  }

  const nextResolvedPosition = {
    x: clampCoordinate(
      shapePoint.position.x + shapePoint.offset.x + (translation.x / previewSize.width) * 100,
    ),
    y: clampCoordinate(
      shapePoint.position.y + shapePoint.offset.y + (translation.y / previewSize.height) * 100,
    ),
  };

  return {
    x: nextResolvedPosition.x - shapePoint.position.x,
    y: nextResolvedPosition.y - shapePoint.position.y,
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

export function createMakeupFilterShapePresetSaveValue({
  state,
  makeupFilterId,
  makeupLookId,
}: {
  state: FilterShapeState;
  makeupFilterId: string;
  makeupLookId?: string;
}): MakeupFilterShapePresetSaveValue {
  return {
    makeupFilterId,
    makeupLookId,
    shapePreset: createShapePresetFromState(state),
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
