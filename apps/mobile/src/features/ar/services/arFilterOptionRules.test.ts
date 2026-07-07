import type {MakeupFilter} from '../../../shared/types/makeupGuide';
import {
  ORIGINAL_OPTION_CARD_ID,
  getARFilterTotalMakeupLookIdAfterOptionEdit,
  getARFilterOptionGroupAfterMakeupAreaChange,
  getARFilterOptionGroupLabels,
  getARFilterSelectionAfterOptionEdit,
  getARFilterSelectionAfterOriginalCardPress,
  getARFilterSelectionAfterPointMakeupLookSelect,
  getARFilterSelectionAfterTotalMakeupLookSelect,
  isARFilterSaveEnabled,
  type ARFilterSelectionState,
} from './arFilterOptionRules';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const baseSelectionState: ARFilterSelectionState = {
  selectedTotalMakeupLookId: 'daily-glow',
  selectedPointMakeupLookId: 'soft-lip',
  selectedColorId: 'rose',
  selectedTypeId: 'lipstick',
  selectedTextureId: 'semi-glow',
  selectedShapeId: 'balanced',
  hasUnsavedMakeupChanges: false,
};

const mockMakeupFilter: MakeupFilter = {
  id: 'clear-rose',
  imageSource: 1,
  categoryId: 'recommended',
  title: '클리어 로즈',
  subtitle: '맑은 로즈 룩',
  intensityLabel: '중간',
  makeupAreas: ['lip'],
  colorOptions: [{id: 'clear-pink', label: '클리어 핑크', hex: '#f5a5b8'}],
  typeOptions: [{id: 'tint', label: '틴트'}],
  textureOptions: [{id: 'glow', label: '글로우'}],
};

expectEqual(
  getARFilterOptionGroupLabels('all').join(','),
  '룩,핏',
  'total makeup option groups',
);
expectEqual(
  getARFilterOptionGroupLabels('lip').join(','),
  '룩,컬러,타입,질감,핏',
  'point makeup option groups',
);
expectEqual(
  getARFilterOptionGroupAfterMakeupAreaChange({
    nextMakeupArea: 'all',
    selectedMakeupOptionGroup: 'color',
  }),
  'makeupLook',
  'invalid total option group fallback',
);
expectEqual(
  getARFilterSelectionAfterOptionEdit(baseSelectionState).selectedTotalMakeupLookId,
  null,
  'option edit clears selected total makeup look',
);
expectEqual(
  getARFilterSelectionAfterOptionEdit(baseSelectionState).hasUnsavedMakeupChanges,
  true,
  'option edit enables save',
);
expectEqual(
  getARFilterSelectionAfterOriginalCardPress({
    selectedMakeupArea: 'all',
    selectedMakeupOptionGroup: 'makeupLook',
    selectionState: baseSelectionState,
  }).selectedTotalMakeupLookId,
  ORIGINAL_OPTION_CARD_ID,
  'original total makeup look selection',
);
expectEqual(
  getARFilterSelectionAfterOriginalCardPress({
    selectedMakeupArea: 'lip',
    selectedMakeupOptionGroup: 'makeupLook',
    selectionState: baseSelectionState,
  }).selectedPointMakeupLookId,
  ORIGINAL_OPTION_CARD_ID,
  'original point makeup look selection',
);
expectEqual(
  getARFilterSelectionAfterOriginalCardPress({
    selectedMakeupArea: 'lip',
    selectedMakeupOptionGroup: 'makeupLook',
    selectionState: baseSelectionState,
  }).selectedTotalMakeupLookId,
  null,
  'original point makeup look clears total makeup look',
);
expectEqual(
  getARFilterSelectionAfterOriginalCardPress({
    selectedMakeupArea: 'all',
    selectedMakeupOptionGroup: 'shape',
    selectionState: baseSelectionState,
  }).hasUnsavedMakeupChanges,
  true,
  'original shape selection is a saveable edit',
);
expectEqual(
  getARFilterSelectionAfterTotalMakeupLookSelect({
    makeupFilter: mockMakeupFilter,
    selectionState: {...baseSelectionState, hasUnsavedMakeupChanges: true},
  }).hasUnsavedMakeupChanges,
  false,
  'total makeup look select disables save',
);
expectEqual(
  getARFilterSelectionAfterPointMakeupLookSelect({
    makeupFilter: mockMakeupFilter,
    selectionState: baseSelectionState,
  }).selectedTotalMakeupLookId,
  null,
  'point makeup look select clears total makeup look',
);
expectEqual(
  getARFilterSelectionAfterPointMakeupLookSelect({
    makeupFilter: mockMakeupFilter,
    selectionState: baseSelectionState,
  }).hasUnsavedMakeupChanges,
  true,
  'point makeup look select enables save',
);
expectEqual(
  getARFilterTotalMakeupLookIdAfterOptionEdit({
    selectedTotalMakeupLookId: 'daily-glow',
  }),
  null,
  'legacy card id helper clears selected total look',
);
expectEqual(
  isARFilterSaveEnabled({hasUnsavedChanges: false}),
  false,
  'save disabled before custom edits',
);
expectEqual(
  isARFilterSaveEnabled({hasUnsavedChanges: true}),
  true,
  'save enabled after custom edits',
);
