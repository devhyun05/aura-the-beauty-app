import {useState} from 'react';

import {getFiltersByCategory} from '../../../shared/services/makeupGuideService';
import type {
  ARMakeupGuideData,
  ComparisonMode,
  FilterCategoryId,
  GuideMode,
  MakeupArea,
  MakeupFilter,
} from '../../../shared/types/makeupGuide';
import {
  ORIGINAL_OPTION_CARD_ID,
  getARFilterDefaultOptionGroup,
  getARFilterInitialColorId,
  getARFilterOptionGroupAfterMakeupAreaChange,
  getARFilterOptionGroups,
  getARFilterSelectedMakeupFilter,
  getARFilterSelectionAfterOptionEdit,
  getARFilterSelectionAfterOriginalCardPress,
  getARFilterSelectionAfterPointMakeupLookSelect,
  getARFilterSelectionAfterTotalMakeupLookSelect,
  getARFilterShapeOptions,
  getFirstMakeupFilterForCategory,
  getMakeupFiltersForMakeupArea,
  isTotalMakeupArea,
  type ARFilterSelectionState,
  type ARMakeupOptionGroupId,
} from '../services/arFilterOptionRules';

type UseARFilterSelectionStateParams = {
  arGuideData: ARMakeupGuideData;
  defaultFilter: MakeupFilter;
  initialComparisonMode: ComparisonMode;
  initialGuideMode: GuideMode;
};

export function useARFilterSelectionState({
  arGuideData,
  defaultFilter,
  initialComparisonMode,
  initialGuideMode,
}: UseARFilterSelectionStateParams) {
  const [guideMode, setGuideMode] = useState<GuideMode>(initialGuideMode);
  const [selectedComparisonMode, setSelectedComparisonMode] =
    useState<ComparisonMode>(initialComparisonMode);
  const [selectedCategoryId, setSelectedCategoryId] = useState<FilterCategoryId>(
    arGuideData.categories[0].id,
  );
  const [selectedMakeupArea, setSelectedMakeupArea] = useState<MakeupArea>('all');
  const [selectedMakeupOptionGroup, setSelectedMakeupOptionGroup] =
    useState<ARMakeupOptionGroupId>(getARFilterDefaultOptionGroup('all'));
  const [selectionState, setSelectionState] = useState<ARFilterSelectionState>({
    selectedTotalMakeupLookId: defaultFilter.id,
    selectedPointMakeupLookId: defaultFilter.id,
    selectedColorId: getARFilterInitialColorId(defaultFilter.colorOptions),
    selectedTypeId: defaultFilter.typeOptions[0]?.id ?? '',
    selectedTextureId: defaultFilter.textureOptions[0]?.id ?? '',
    selectedShapeId: ORIGINAL_OPTION_CARD_ID,
    hasUnsavedMakeupChanges: false,
  });

  const selectedMakeupFilter = getARFilterSelectedMakeupFilter({
    defaultFilter,
    makeupFilters: arGuideData.filters,
    selectedMakeupArea,
    selectedPointMakeupLookId: selectionState.selectedPointMakeupLookId,
    selectedTotalMakeupLookId: selectionState.selectedTotalMakeupLookId,
  });
  const categoryMakeupFilters = getFiltersByCategory(selectedCategoryId, arGuideData);
  const availableMakeupFilters = getMakeupFiltersForMakeupArea(
    categoryMakeupFilters,
    selectedMakeupArea,
  );
  const availableOptionGroups = getARFilterOptionGroups(selectedMakeupArea);
  const shapeOptions = getARFilterShapeOptions(selectedMakeupArea);

  const markMakeupOptionEdited = (
    updater: (currentState: ARFilterSelectionState) => ARFilterSelectionState,
  ) => {
    setSelectionState(currentState =>
      updater(getARFilterSelectionAfterOptionEdit(currentState)),
    );
  };

  const handleMakeupAreaOptionPress = (makeupAreaId: MakeupArea) => {
    setSelectedMakeupArea(makeupAreaId);
    setSelectedMakeupOptionGroup(currentOptionGroup =>
      getARFilterOptionGroupAfterMakeupAreaChange({
        nextMakeupArea: makeupAreaId,
        selectedMakeupOptionGroup: currentOptionGroup,
      }),
    );
  };

  const handleMakeupFilterPress = (makeupFilter: MakeupFilter) => {
    setSelectionState(currentState =>
      isTotalMakeupArea(selectedMakeupArea)
        ? getARFilterSelectionAfterTotalMakeupLookSelect({
            makeupFilter,
            selectionState: currentState,
          })
        : getARFilterSelectionAfterPointMakeupLookSelect({
            makeupFilter,
            selectionState: currentState,
          }),
    );
  };

  const handleCategoryPress = (categoryId: FilterCategoryId) => {
    const nextMakeupFilter = getFirstMakeupFilterForCategory({
      defaultFilter,
      getCategoryMakeupFilters: nextCategoryId =>
        getFiltersByCategory(nextCategoryId, arGuideData),
      selectedCategoryId: categoryId,
      selectedMakeupArea,
    });

    setSelectedCategoryId(categoryId);
    handleMakeupFilterPress(nextMakeupFilter);
  };

  const handleOriginalOptionPress = () => {
    setSelectionState(currentState =>
      getARFilterSelectionAfterOriginalCardPress({
        selectedMakeupArea,
        selectedMakeupOptionGroup,
        selectionState: currentState,
      }),
    );
  };

  const handleColorOptionPress = (optionId: string) => {
    markMakeupOptionEdited(currentState => ({
      ...currentState,
      selectedColorId: optionId,
    }));
  };

  const handleTypeOptionPress = (optionId: string) => {
    markMakeupOptionEdited(currentState => ({
      ...currentState,
      selectedTypeId: optionId,
    }));
  };

  const handleTextureOptionPress = (optionId: string) => {
    markMakeupOptionEdited(currentState => ({
      ...currentState,
      selectedTextureId: optionId,
    }));
  };

  const handleShapeOptionPress = (optionId: string) => {
    markMakeupOptionEdited(currentState => ({
      ...currentState,
      selectedShapeId: optionId,
    }));
  };

  return {
    availableMakeupFilters,
    availableOptionGroups,
    guideMode,
    handleCategoryPress,
    handleColorOptionPress,
    handleMakeupAreaOptionPress,
    handleMakeupFilterPress,
    handleOriginalOptionPress,
    handleShapeOptionPress,
    handleTextureOptionPress,
    handleTypeOptionPress,
    selectedCategoryId,
    selectedColorId: selectionState.selectedColorId,
    selectedComparisonMode,
    selectedMakeupArea,
    selectedMakeupFilter,
    selectedMakeupOptionGroup,
    selectedPointMakeupLookId: selectionState.selectedPointMakeupLookId,
    selectedShapeId: selectionState.selectedShapeId,
    selectedTextureId: selectionState.selectedTextureId,
    selectedTotalMakeupLookId: selectionState.selectedTotalMakeupLookId,
    selectedTypeId: selectionState.selectedTypeId,
    setGuideMode,
    setSelectedComparisonMode,
    setSelectedMakeupOptionGroup,
    shapeOptions,
    hasUnsavedMakeupChanges: selectionState.hasUnsavedMakeupChanges,
  };
}
