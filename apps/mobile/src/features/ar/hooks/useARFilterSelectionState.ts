import {useState} from 'react';

import {
  getFiltersByCategory,
  getRecommendedMakeupFilterById,
  isRecommendedFilterLaunchSource,
} from '../../../shared/services/makeupGuideService';
import type {
  ARFilterLaunchSource,
  ARMakeupGuideData,
  ComparisonMode,
  FilterCategoryId,
  GuideMode,
  MakeupArea,
  MakeupFilter,
  RecommendedMakeupFilter,
} from '../../../shared/types/makeupGuide';
import {
  ORIGINAL_OPTION_CARD_ID,
  getARFilterDefaultOptionGroup,
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

const DEFAULT_VISIBLE_MAKEUP_AREA: MakeupArea = 'lip';

type ARFilterSelectionStatesByArea = Partial<Record<MakeupArea, ARFilterSelectionState>>;

type UseARFilterSelectionStateParams = {
  arGuideData: ARMakeupGuideData;
  defaultFilter: MakeupFilter;
  initialComparisonMode: ComparisonMode;
  initialGuideMode: GuideMode;
  initialMakeupFilterId?: string;
  initialSource?: ARFilterLaunchSource;
};

function createInitialARFilterSelectionState(
  initialMakeupFilter?: RecommendedMakeupFilter,
  initialSource?: ARFilterLaunchSource,
): ARFilterSelectionState {
  if (initialMakeupFilter) {
    return {
      selectedTotalMakeupLookId: initialMakeupFilter.id,
      selectedPointMakeupLookId: ORIGINAL_OPTION_CARD_ID,
      selectedColorId:
        initialMakeupFilter.presetValues.colorId ??
        initialMakeupFilter.colorOptions[0]?.id ??
        ORIGINAL_OPTION_CARD_ID,
      selectedTypeId:
        initialMakeupFilter.presetValues.typeId ??
        initialMakeupFilter.typeOptions[0]?.id ??
        ORIGINAL_OPTION_CARD_ID,
      selectedTextureId:
        initialMakeupFilter.presetValues.textureId ??
        initialMakeupFilter.textureOptions[0]?.id ??
        ORIGINAL_OPTION_CARD_ID,
      selectedShapeId:
        initialMakeupFilter.presetValues.shapeId ?? ORIGINAL_OPTION_CARD_ID,
      hasUnsavedMakeupChanges: isRecommendedFilterLaunchSource(initialSource),
    };
  }

  return {
    selectedTotalMakeupLookId: ORIGINAL_OPTION_CARD_ID,
    selectedPointMakeupLookId: ORIGINAL_OPTION_CARD_ID,
    selectedColorId: ORIGINAL_OPTION_CARD_ID,
    selectedTypeId: ORIGINAL_OPTION_CARD_ID,
    selectedTextureId: ORIGINAL_OPTION_CARD_ID,
    selectedShapeId: ORIGINAL_OPTION_CARD_ID,
    hasUnsavedMakeupChanges: false,
  };
}

function createInitialSelectionStatesByArea(
  makeupAreas: ARMakeupGuideData['makeupAreas'],
  initialMakeupFilter?: RecommendedMakeupFilter,
  initialSource?: ARFilterLaunchSource,
): ARFilterSelectionStatesByArea {
  return makeupAreas.reduce<ARFilterSelectionStatesByArea>(
    (selectionStates, makeupArea) => ({
      ...selectionStates,
      [makeupArea.id]:
        makeupArea.id === 'all'
          ? createInitialARFilterSelectionState(
              initialMakeupFilter,
              initialSource,
            )
          : createInitialARFilterSelectionState(),
    }),
    {
      all: createInitialARFilterSelectionState(
        initialMakeupFilter,
        initialSource,
      ),
    },
  );
}

export function useARFilterSelectionState({
  arGuideData,
  defaultFilter,
  initialComparisonMode,
  initialGuideMode,
  initialMakeupFilterId,
  initialSource,
}: UseARFilterSelectionStateParams) {
  const initialMakeupFilter = initialMakeupFilterId
    ? getRecommendedMakeupFilterById(initialMakeupFilterId)
    : undefined;
  const [guideMode, setGuideMode] = useState<GuideMode>(initialGuideMode);
  const [selectedComparisonMode, setSelectedComparisonMode] =
    useState<ComparisonMode>(initialComparisonMode);
  const [selectedCategoryId, setSelectedCategoryId] = useState<FilterCategoryId>(
    initialMakeupFilter?.categoryId ?? arGuideData.categories[0].id,
  );
  const initialMakeupArea = initialMakeupFilter
    ? 'all'
    : DEFAULT_VISIBLE_MAKEUP_AREA;
  const [selectedMakeupArea, setSelectedMakeupArea] =
    useState<MakeupArea>(initialMakeupArea);
  const [selectedMakeupOptionGroup, setSelectedMakeupOptionGroup] =
    useState<ARMakeupOptionGroupId>(
      getARFilterDefaultOptionGroup(initialMakeupArea),
    );
  const [selectionStatesByArea, setSelectionStatesByArea] =
    useState<ARFilterSelectionStatesByArea>(() =>
      createInitialSelectionStatesByArea(
        arGuideData.makeupAreas,
        initialMakeupFilter,
        initialSource,
      ),
    );
  const getSelectionStateForMakeupArea = (makeupArea: MakeupArea) =>
    selectionStatesByArea[makeupArea] ?? createInitialARFilterSelectionState();
  const selectionState = getSelectionStateForMakeupArea(selectedMakeupArea);

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
    setSelectionStatesByArea(currentStates => {
      const currentState =
        currentStates[selectedMakeupArea] ?? createInitialARFilterSelectionState();

      return {
        ...currentStates,
        [selectedMakeupArea]: updater(
          getARFilterSelectionAfterOptionEdit(currentState),
        ),
      };
    });
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
    setSelectionStatesByArea(currentStates => {
      const currentState =
        currentStates[selectedMakeupArea] ?? createInitialARFilterSelectionState();

      return {
        ...currentStates,
        [selectedMakeupArea]: isTotalMakeupArea(selectedMakeupArea)
          ? getARFilterSelectionAfterTotalMakeupLookSelect({
              makeupFilter,
              selectionState: currentState,
            })
          : getARFilterSelectionAfterPointMakeupLookSelect({
              makeupFilter,
              selectionState: currentState,
            }),
      };
    });
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
    setSelectionStatesByArea(currentStates => {
      const currentState =
        currentStates[selectedMakeupArea] ?? createInitialARFilterSelectionState();

      return {
        ...currentStates,
        [selectedMakeupArea]: getARFilterSelectionAfterOriginalCardPress({
          selectedMakeupArea,
          selectedMakeupOptionGroup,
          selectionState: currentState,
        }),
      };
    });
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
    selectionStatesByArea,
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
    getSelectionStateForMakeupArea,
    hasUnsavedMakeupChanges: selectionState.hasUnsavedMakeupChanges,
  };
}
