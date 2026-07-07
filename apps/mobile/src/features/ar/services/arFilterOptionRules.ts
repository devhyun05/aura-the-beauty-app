import type {
  FilterCategoryId,
  FilterColorOption,
  FilterTextOption,
  MakeupArea,
  MakeupFilter,
} from '../../../shared/types/makeupGuide';
import {
  MAKEUP_REGION_ALIASES,
  REGION_COLOR_OPTIONS,
  type MakeupRecipeRegion,
} from '../../../shared/contracts/fullFaceMakeupRecipe';

// Base/lip/cheek (and eye/brow) color swatches come from OUR branch's region
// palettes (REGION_COLOR_OPTIONS) instead of the dev filter's flat cosmetic
// color list, so each makeup-area tab shows the correct palette: base ->
// foundation shades, lip -> lip colors, cheek -> blush colors. Areas with no
// region mapping ('all', 'contour') keep the filter's own colorOptions. This
// MUST be applied at every color read site (swatch render, preview color,
// recipe-build color lookup) so the shown swatch and the applied colorHex
// never diverge.
export function resolveAreaColorOptions(
  makeupAreaId: MakeupArea,
  fallbackColorOptions: readonly FilterColorOption[],
): readonly FilterColorOption[] {
  const region = (
    MAKEUP_REGION_ALIASES as Record<string, MakeupRecipeRegion | undefined>
  )[makeupAreaId];
  const palette = region ? REGION_COLOR_OPTIONS[region] : undefined;
  return palette && palette.length > 0 ? palette : fallbackColorOptions;
}

// Lip 질감(texture/finish) is a FIXED, area-based set (매트/글로우) rather than the
// per-filter textureOptions, mirroring resolveAreaColorOptions. 매트 => matte
// finish (no gloss highlight); 글로우 => light-reactive gloss highlight. The ids
// are consumed by unityMakeupBridge.ts (resolveLipFinishParams) to drive
// glossBoost/specular/texture. Other areas keep the filter's own textureOptions.
const TEXTURE_OPTIONS_BY_MAKEUP_AREA: Partial<
  Record<MakeupArea, readonly FilterTextOption[]>
> = {
  lip: [
    {id: 'lip-matte', label: '매트'},
    {id: 'lip-glow', label: '글로우'},
  ],
};

// Lip 타입(type) is a FIXED, area-based set. 소프트 스모키 => soft darkened smoky
// gradient; 얇은 라인 => thin inner-lip / lip-line emphasis; 뮤트 립 => muted,
// blurred, lower-saturation lip. The ids are consumed by unityMakeupBridge.ts
// (resolveLipTypeParams) to drive opacity/feather/coverage/saturation combos.
const TYPE_OPTIONS_BY_MAKEUP_AREA: Partial<
  Record<MakeupArea, readonly FilterTextOption[]>
> = {
  lip: [
    {id: 'lip-soft-smoky', label: '소프트 스모키'},
    {id: 'lip-thin-line', label: '얇은 라인'},
    {id: 'lip-mute', label: '뮤트 립'},
  ],
};

// Area-based override for 질감 options. Lip gets the fixed 매트/글로우 set; every
// other area falls back to the selected filter's own textureOptions. MUST be
// used at both the render site (ARFilterOptionCardList) and the seed/default
// sites so the shown card set and the applied recipe never diverge.
export function resolveAreaTextureOptions(
  makeupAreaId: MakeupArea,
  fallbackTextureOptions: readonly FilterTextOption[],
): readonly FilterTextOption[] {
  return TEXTURE_OPTIONS_BY_MAKEUP_AREA[makeupAreaId] ?? fallbackTextureOptions;
}

// Area-based override for 타입 options. Same contract as resolveAreaTextureOptions.
export function resolveAreaTypeOptions(
  makeupAreaId: MakeupArea,
  fallbackTypeOptions: readonly FilterTextOption[],
): readonly FilterTextOption[] {
  return TYPE_OPTIONS_BY_MAKEUP_AREA[makeupAreaId] ?? fallbackTypeOptions;
}

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
    {id: 'brow-natural', label: '내추럴'},
    {id: 'brow-daily', label: '데일리'},
    {id: 'brow-soft-arch', label: '소프트 아치'},
    {id: 'brow-arch', label: '아치'},
    {id: 'brow-straight', label: '일자'},
    {id: 'brow-slim', label: '슬림'},
  ],
  lip: [
    {id: 'lip-over', label: '오버 립'},
    {id: 'lip-gradient', label: '그라데이션'},
  ],
  cheek: [
    {id: 'cheek-daily', label: '데일리'},
    {id: 'cheek-lovely', label: '러블리'},
    {id: 'cheek-under', label: '언더'},
    {id: 'cheek-sunkiss1', label: '선키스 1'},
    {id: 'cheek-sunkiss2', label: '선키스 2'},
  ],
  // 렌즈는 색(COLOR)이 주 선택 수단이라 형태는 최소 세트만 노출합니다. 비비드는
  // 진한 컬러를 더 선명하게(높은 opacity 프리셋의 색을 선택하도록 안내)하는 표시용.
  lens: [
    {id: 'lens-natural', label: '내추럴'},
    {id: 'lens-vivid', label: '비비드'},
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
  selectedMakeupArea,
  selectionState,
}: {
  makeupFilter: MakeupFilter;
  selectedMakeupArea?: MakeupArea;
  selectionState: ARFilterSelectionState;
}): ARFilterSelectionState {
  // Seed 타입/질감 from the area-based override set (lip => fixed 매트·글로우 /
  // 소프트 스모키·얇은 라인·뮤트 립) so the seeded id is always a valid card id for
  // the shown set. Other areas keep the filter's own first option.
  const typeOptions = selectedMakeupArea
    ? resolveAreaTypeOptions(selectedMakeupArea, makeupFilter.typeOptions)
    : makeupFilter.typeOptions;
  const textureOptions = selectedMakeupArea
    ? resolveAreaTextureOptions(selectedMakeupArea, makeupFilter.textureOptions)
    : makeupFilter.textureOptions;

  return {
    ...selectionState,
    selectedTotalMakeupLookId: null,
    selectedPointMakeupLookId: makeupFilter.id,
    selectedColorId: getARFilterInitialColorId(makeupFilter.colorOptions),
    selectedTypeId: typeOptions[0]?.id ?? '',
    selectedTextureId: textureOptions[0]?.id ?? '',
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
