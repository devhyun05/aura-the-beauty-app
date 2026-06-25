import {
  getFilterShapeState,
  getMakeupFilterOptionState,
  updateMakeupFilterOptionSelection,
  updateFilterShapeAdjustment,
} from './filterCustomizationService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const initialState = getFilterShapeState();
const movedState = updateFilterShapeAdjustment(initialState, 'horizontal', 12);

expectEqual(initialState.adjustments.horizontal.value, 0, 'initial horizontal adjustment');
expectEqual(movedState.adjustments.horizontal.value, 12, 'updated horizontal adjustment');
expectEqual(initialState.shapePoints.length, 6, 'mock shape point count');
expectEqual(initialState.shapePoints[0]?.position.x, 38, 'mock shape point position x');
expectEqual(initialState.shapePoints[0]?.offset.x, 0, 'mock shape point offset x');

const initialOptionState = getMakeupFilterOptionState();
const updatedOptionState = updateMakeupFilterOptionSelection(initialOptionState, 'color', 'nude');

expectEqual(initialOptionState.selectedColorId, 'rose', 'initial selected color');
expectEqual(updatedOptionState.selectedColorId, 'nude', 'updated selected color');
expectEqual(updatedOptionState.selectedOptionGroup, 'color', 'updated option group');
