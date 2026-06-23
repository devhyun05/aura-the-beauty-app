import {
  getMockFilterLocationState,
  updateFilterLocationAdjustment,
} from './filterCustomizationService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const initialState = getMockFilterLocationState();
const movedState = updateFilterLocationAdjustment(initialState, 'horizontal', 12);

expectEqual(initialState.adjustments.horizontal.value, 0, 'initial horizontal adjustment');
expectEqual(movedState.adjustments.horizontal.value, 12, 'updated horizontal adjustment');
expectEqual(initialState.landmarks.length, 6, 'mock landmark count');
