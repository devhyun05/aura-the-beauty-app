import type {
  FilterCategoryId,
  FilterColorOption,
  MakeupArea,
  MakeupFilter,
} from '../../../shared/types/makeupGuide';

export type ARMakeupOptionGroupId =
  | 'makeupLook'
  | 'color'
  | 'type'
  | 'texture'
  | 'shape';

export type ARMakeupOptionGroup = {
  id: ARMakeupOptionGroupId;
  label: string;
};

export type ShapeOption = {
  id: string;
  label: string;
};

export type ARFilterSelectedColor = Pick<FilterColorOption, 'hex' | 'label'>;

export type ARFilterSelectionState = {
  selectedTotalMakeupLookId: string | null;
  selectedPointMakeupLookId: string;
  selectedColorId: string;
  selectedTypeId: string;
  selectedTextureId: string;
  selectedShapeId: string;
  hasUnsavedMakeupChanges: boolean;
};

export const ORIGINAL_OPTION_CARD_ID = 'original';
export const ORIGINAL_OPTION_CARD_LABEL = '원본';

const POINT_MAKEUP_OPTION_GROUPS: readonly ARMakeupOptionGroup[] = [
  {id: 'makeupLook', label: '룩'},
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
  {id: 'shape', label: '형태'},
];

const TOTAL_MAKEUP_OPTION_GROUPS: readonly ARMakeupOptionGroup[] = [
  {id: 'makeupLook', label: '룩'},
  {id: 'shape', label: '형태'},
];

const SHAPE_OPTIONS_BY_MAKEUP_AREA: Record<MakeupArea, readonly ShapeOption[]> = {
  all: [
    {id: 'balanced', label: '기본 밸런스'},
    {id: 'soft-focus', label: '소프트 확장'},
    {id: 'defined', label: '윤곽 강조'},
  ],
  base: [
    {id: 'base-default', label: '기본 베이스'},
    {id: 'base-center', label: '중앙 집중'},
    {id: 'base-wide', label: '광대 확장'},
  ],
  eye: [
    {id: 'eye-default', label: '기본 아이'},
    {id: 'eye-tail', label: '눈꼬리 확장'},
    {id: 'eye-under', label: '언더 포인트'},
  ],
  brow: [
    {id: 'brow-default', label: '기본 눈썹'},
    {id: 'brow-soft-arch', label: '소프트 아치'},
    {id: 'brow-straight', label: '일자 눈썹'},
  ],
  lip: [
    {id: 'lip-default', label: '기본 립'},
    {id: 'lip-over', label: '오버 립'},
    {id: 'lip-gradient', label: '그라데이션'},
  ],
  cheek: [
    {id: 'cheek-default', label: '기본 치크'},
    {id: 'cheek-diagonal', label: '사선 치크'},
    {id: 'cheek-round', label: '라운드 치크'},
  ],
  contour: [
    {id: 'contour-default', label: '기본 윤곽'},
    {id: 'contour-jaw', label: '턱선 강조'},
    {id: 'contour-nose', label: '코 쉐딩'},
  ],
};

export function isTotalMakeupArea(selectedMakeupArea: MakeupArea): boolean {
  return selectedMakeupArea === 'all';
}

export function getARFilterOptionGroups(
  selectedMakeupArea: MakeupArea,
): readonly ARMakeupOptionGroup[] {
  return isTotalMakeupArea(selectedMakeupArea)
    ? TOTAL_MAKEUP_OPTION_GROUPS
    : POINT_MAKEUP_OPTION_GROUPS;
}

export function getARFilterOptionGroupLabels(
  selectedMakeupArea: MakeupArea,
): readonly string[] {
  return getARFilterOptionGroups(selectedMakeupArea).map(group => group.label);
}

export function getARFilterDefaultOptionGroup(
  selectedMakeupArea: MakeupArea,
): ARMakeupOptionGroupId {
  return getARFilterOptionGroups(selectedMakeupArea)[0].id;
}

export function getARFilterOptionGroupAfterMakeupAreaChange({
  nextMakeupArea,
  selectedMakeupOptionGroup,
}: {
  nextMakeupArea: MakeupArea;
  selectedMakeupOptionGroup: ARMakeupOptionGroupId;
}): ARMakeupOptionGroupId {
  const nextOptionGroups = getARFilterOptionGroups(nextMakeupArea);

  return nextOptionGroups.some(group => group.id === selectedMakeupOptionGroup)
    ? selectedMakeupOptionGroup
    : nextOptionGroups[0].id;
}

export function getARFilterShapeOptions(
  selectedMakeupArea: MakeupArea,
): readonly ShapeOption[] {
  return SHAPE_OPTIONS_BY_MAKEUP_AREA[selectedMakeupArea];
}

export function getARFilterShapeOptionLabels(
  selectedMakeupArea: MakeupArea,
): readonly string[] {
  return getARFilterShapeOptions(selectedMakeupArea).map(option => option.label);
}

export function getARFilterOriginalCardLabel(): string {
  return ORIGINAL_OPTION_CARD_LABEL;
}

export function getMakeupFiltersForMakeupArea(
  makeupFilters: readonly MakeupFilter[],
  selectedMakeupArea: MakeupArea,
): readonly MakeupFilter[] {
  if (isTotalMakeupArea(selectedMakeupArea)) {
    return makeupFilters;
  }

  const areaMakeupFilters = makeupFilters.filter(makeupFilter =>
    makeupFilter.makeupAreas.includes(selectedMakeupArea),
  );

  return areaMakeupFilters.length > 0 ? areaMakeupFilters : makeupFilters;
}

export function getARFilterSelectedMakeupFilter({
  defaultFilter,
  makeupFilters,
  selectedMakeupArea,
  selectedPointMakeupLookId,
  selectedTotalMakeupLookId,
}: {
  defaultFilter: MakeupFilter;
  makeupFilters: readonly MakeupFilter[];
  selectedMakeupArea: MakeupArea;
  selectedPointMakeupLookId: string;
  selectedTotalMakeupLookId: string | null;
}): MakeupFilter {
  const selectedMakeupFilterId = isTotalMakeupArea(selectedMakeupArea)
    ? selectedTotalMakeupLookId
    : selectedPointMakeupLookId;

  return (
    makeupFilters.find(makeupFilter => makeupFilter.id === selectedMakeupFilterId) ??
    defaultFilter
  );
}

export function getARFilterInitialColorId(
  colorOptions: readonly FilterColorOption[],
): string {
  return colorOptions[0]?.id ?? '';
}

export function getARFilterSelectedColor({
  colorOptions,
  fallbackColor,
  selectedColorId,
}: {
  colorOptions: readonly FilterColorOption[];
  fallbackColor: ARFilterSelectedColor;
  selectedColorId: string;
}): ARFilterSelectedColor {
  if (selectedColorId === ORIGINAL_OPTION_CARD_ID) {
    return fallbackColor;
  }

  return colorOptions.find(option => option.id === selectedColorId) ?? colorOptions[0] ?? fallbackColor;
}

export function getARFilterSelectionAfterTotalMakeupLookSelect({
  makeupFilter,
  selectionState,
}: {
  makeupFilter: MakeupFilter;
  selectionState: ARFilterSelectionState;
}): ARFilterSelectionState {
  return {
    ...selectionState,
    selectedTotalMakeupLookId: makeupFilter.id,
    selectedColorId: getARFilterInitialColorId(makeupFilter.colorOptions),
    selectedTypeId: makeupFilter.typeOptions[0]?.id ?? '',
    selectedTextureId: makeupFilter.textureOptions[0]?.id ?? '',
    hasUnsavedMakeupChanges: false,
  };
}

export function getARFilterSelectionAfterPointMakeupLookSelect({
  makeupFilter,
  selectionState,
}: {
  makeupFilter: MakeupFilter;
  selectionState: ARFilterSelectionState;
}): ARFilterSelectionState {
  return {
    ...selectionState,
    selectedTotalMakeupLookId: null,
    selectedPointMakeupLookId: makeupFilter.id,
    selectedColorId: getARFilterInitialColorId(makeupFilter.colorOptions),
    selectedTypeId: makeupFilter.typeOptions[0]?.id ?? '',
    selectedTextureId: makeupFilter.textureOptions[0]?.id ?? '',
    hasUnsavedMakeupChanges: true,
  };
}

export function getARFilterSelectionAfterOptionEdit(
  selectionState: ARFilterSelectionState,
): ARFilterSelectionState {
  return {
    ...selectionState,
    selectedTotalMakeupLookId: null,
    hasUnsavedMakeupChanges: true,
  };
}

export function getARFilterSelectionAfterOriginalCardPress({
  selectedMakeupArea,
  selectedMakeupOptionGroup,
  selectionState,
}: {
  selectedMakeupArea: MakeupArea;
  selectedMakeupOptionGroup: ARMakeupOptionGroupId;
  selectionState: ARFilterSelectionState;
}): ARFilterSelectionState {
  if (selectedMakeupOptionGroup === 'makeupLook' && isTotalMakeupArea(selectedMakeupArea)) {
    return {
      ...selectionState,
      selectedTotalMakeupLookId: ORIGINAL_OPTION_CARD_ID,
      hasUnsavedMakeupChanges: false,
    };
  }

  const editedSelectionState = getARFilterSelectionAfterOptionEdit(selectionState);

  if (selectedMakeupOptionGroup === 'makeupLook') {
    return {
      ...editedSelectionState,
      selectedPointMakeupLookId: ORIGINAL_OPTION_CARD_ID,
    };
  }

  if (selectedMakeupOptionGroup === 'color') {
    return {
      ...editedSelectionState,
      selectedColorId: ORIGINAL_OPTION_CARD_ID,
    };
  }

  if (selectedMakeupOptionGroup === 'type') {
    return {
      ...editedSelectionState,
      selectedTypeId: ORIGINAL_OPTION_CARD_ID,
    };
  }

  if (selectedMakeupOptionGroup === 'texture') {
    return {
      ...editedSelectionState,
      selectedTextureId: ORIGINAL_OPTION_CARD_ID,
    };
  }

  return {
    ...editedSelectionState,
    selectedShapeId: ORIGINAL_OPTION_CARD_ID,
  };
}

export function getARFilterTotalMakeupLookIdAfterOptionEdit({
  selectedTotalMakeupLookId,
}: {
  selectedTotalMakeupLookId: string | null;
}): string | null {
  return selectedTotalMakeupLookId ? null : selectedTotalMakeupLookId;
}

export function isARFilterSaveEnabled({
  hasUnsavedChanges,
}: {
  hasUnsavedChanges: boolean;
}): boolean {
  return hasUnsavedChanges;
}

export function getFirstMakeupFilterForCategory({
  defaultFilter,
  getCategoryMakeupFilters,
  selectedCategoryId,
  selectedMakeupArea,
}: {
  defaultFilter: MakeupFilter;
  getCategoryMakeupFilters: (categoryId: FilterCategoryId) => readonly MakeupFilter[];
  selectedCategoryId: FilterCategoryId;
  selectedMakeupArea: MakeupArea;
}): MakeupFilter {
  return (
    getMakeupFiltersForMakeupArea(
      getCategoryMakeupFilters(selectedCategoryId),
      selectedMakeupArea,
    )[0] ?? defaultFilter
  );
}
