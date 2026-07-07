import {
  createMakeupFilterShapePresetSaveValue,
  createShapePresetFromState,
  getFilterShapeAdjustmentValueFromRatio,
  getShapePointOffsetFromDrag,
  getFilterShapeState,
  getMirroredShapePointOffset,
  getResolvedShapePointPosition,
  getMakeupFilterOptionState,
  resetFilterShapePointOffset,
  resetFilterShapePointOffsetWithSymmetry,
  resetFilterShapePoints,
  updateMakeupFilterOptionSelection,
  updateFilterShapeAdjustment,
  updateFilterShapePointOffset,
  updateFilterShapePointOffsetWithSymmetry,
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

const offsetState = updateFilterShapePointOffset(initialState, 'left-brow', {x: 4, y: -2});
const offsetPoint = offsetState.shapePoints[0];

if (!offsetPoint) {
  throw new Error('offset shape point should exist');
}

expectEqual(initialState.shapePoints[0]?.offset.x, 0, 'initial shape point offset stays immutable');
expectEqual(offsetPoint.position.x, 38, 'shape point position remains coordinate');
expectEqual(offsetPoint.offset.x, 4, 'updated shape point offset x');
expectEqual(offsetPoint.offset.y, -2, 'updated shape point offset y');
expectEqual(
  getResolvedShapePointPosition(offsetPoint).x,
  42,
  'resolved shape point position x',
);
expectEqual(
  getResolvedShapePointPosition(offsetPoint).y,
  29,
  'resolved shape point position y',
);

const resetOnePointState = resetFilterShapePointOffset(offsetState, 'left-brow');

expectEqual(
  resetOnePointState.shapePoints[0]?.offset.x,
  0,
  'reset one shape point offset x',
);

const symmetryOffsetState = updateFilterShapePointOffsetWithSymmetry(
  initialState,
  'left-brow',
  {x: 4, y: -2},
  true,
);

expectEqual(
  symmetryOffsetState.shapePoints[0]?.offset.x,
  4,
  'symmetry edit keeps selected point offset x',
);
expectEqual(
  symmetryOffsetState.shapePoints[1]?.offset.x,
  -4,
  'symmetry edit mirrors paired point offset x',
);
expectEqual(
  symmetryOffsetState.shapePoints[1]?.offset.y,
  -2,
  'symmetry edit mirrors paired point offset y',
);
expectEqual(
  getMirroredShapePointOffset({x: 6, y: 3}).x,
  -6,
  'mirrored shape point offset flips x',
);

const resetSymmetryState = resetFilterShapePointOffsetWithSymmetry(
  symmetryOffsetState,
  'left-brow',
  true,
);

expectEqual(
  resetSymmetryState.shapePoints[1]?.offset.x,
  0,
  'symmetry reset clears paired point offset x',
);

const resetAllPointsState = resetFilterShapePoints(
  updateFilterShapePointOffset(offsetState, 'right-brow', {x: -3, y: 1}),
);

expectEqual(
  resetAllPointsState.shapePoints.every(shapePoint => shapePoint.offset.x === 0),
  true,
  'reset all shape point offset x values',
);
expectEqual(
  resetAllPointsState.shapePoints.every(shapePoint => shapePoint.offset.y === 0),
  true,
  'reset all shape point offset y values',
);

const shapePreset = createShapePresetFromState(offsetState);

expectEqual(shapePreset.selectedMakeupArea, 'lip', 'shape preset makeup area');
expectEqual(
  shapePreset.shapePoints[0]?.resolvedPosition.x,
  42,
  'shape preset resolved position x',
);
expectEqual(
  shapePreset.shapePoints[0]?.position.x,
  38,
  'shape preset keeps shape point coordinate',
);

const dragOffset = getShapePointOffsetFromDrag({
  shapePoint: initialState.shapePoints[0],
  translation: {x: 20, y: -10},
  previewSize: {width: 200, height: 100},
});

expectEqual(dragOffset.x, 10, 'drag x converts pixels to preview percentage');
expectEqual(dragOffset.y, -10, 'drag y converts pixels to preview percentage');

const clampedDragOffset = getShapePointOffsetFromDrag({
  shapePoint: initialState.shapePoints[0],
  translation: {x: -1000, y: 1000},
  previewSize: {width: 200, height: 100},
});

expectEqual(clampedDragOffset.x, -38, 'drag x clamps resolved shape point to left edge');
expectEqual(clampedDragOffset.y, 69, 'drag y clamps resolved shape point to bottom edge');

expectEqual(
  getFilterShapeAdjustmentValueFromRatio(initialState.adjustments.horizontal, 0.75),
  12,
  'slider ratio maps to stepped adjustment value',
);
expectEqual(
  getFilterShapeAdjustmentValueFromRatio(initialState.adjustments.horizontal, 2),
  24,
  'slider ratio clamps max adjustment value',
);

const shapePresetSaveValue = createMakeupFilterShapePresetSaveValue({
  state: offsetState,
  makeupFilterId: 'filter-rose',
  makeupLookId: 'look-daily-rose',
});

expectEqual(shapePresetSaveValue.makeupFilterId, 'filter-rose', 'shape preset save filter id');
expectEqual(shapePresetSaveValue.makeupLookId, 'look-daily-rose', 'shape preset save look id');
expectEqual(
  shapePresetSaveValue.shapePreset.shapePoints[0]?.resolvedPosition.x,
  42,
  'shape preset save keeps resolved position',
);

const initialOptionState = getMakeupFilterOptionState();
const updatedOptionState = updateMakeupFilterOptionSelection(initialOptionState, 'color', 'nude');

expectEqual(initialOptionState.selectedColorId, 'rose', 'initial selected color');
expectEqual(updatedOptionState.selectedColorId, 'nude', 'updated selected color');
expectEqual(updatedOptionState.selectedOptionGroup, 'color', 'updated option group');
