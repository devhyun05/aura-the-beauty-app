import {
  getFilterLocationState,
  getFilterStyleState,
  updateFilterStyleSelection,
  updateFilterLocationAdjustment,
} from './filterCustomizationService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const initialState = getFilterLocationState();
const movedState = updateFilterLocationAdjustment(initialState, 'horizontal', 12);

expectEqual(initialState.adjustments.horizontal.value, 0, 'initial horizontal adjustment');
expectEqual(movedState.adjustments.horizontal.value, 12, 'updated horizontal adjustment');
expectEqual(initialState.landmarks.length, 6, 'mock landmark count');

const initialStyleState = getFilterStyleState();
const updatedStyleState = updateFilterStyleSelection(initialStyleState, 'color', 'nude');

expectEqual(initialStyleState.selectedColorId, 'rose', 'initial selected color');
expectEqual(updatedStyleState.selectedColorId, 'nude', 'updated selected color');
expectEqual(updatedStyleState.selectedOptionGroup, 'color', 'updated option group');
