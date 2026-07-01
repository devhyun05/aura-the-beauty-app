import {useMemo, useState} from 'react';

import {
  createFullFaceMakeupRecipeFromEditState,
  getFullFaceMakeupAdjustmentFields,
  getFullFaceMakeupCandidateOptions,
  getFullFaceMakeupColorOptions,
  getFullFaceMakeupFinishOptions,
  getInitialFullFaceMakeupEditState,
  selectFullFaceMakeupRegion,
  updateFullFaceMakeupRegionCandidate,
  updateFullFaceMakeupRegionColor,
  updateFullFaceMakeupRegionEnabled,
  updateFullFaceMakeupRegionFinish,
  updateFullFaceMakeupRegionIntensity,
  updateFullFaceMakeupRegionParam,
  type FullFaceMakeupEditState,
} from '../services/fullFaceMakeupEditService';
import type {
  FullFaceMakeupSourceInput,
  MakeupRecipeRegion,
  RegionAdjustmentFieldSchema,
} from '../../../shared/contracts/fullFaceMakeupRecipe';

type UseFullFaceMakeupEditStateParams = {
  initialState?: FullFaceMakeupEditState;
  sourceFrameMetadata?: FullFaceMakeupSourceInput;
};

export function useFullFaceMakeupEditState({
  initialState,
  sourceFrameMetadata,
}: UseFullFaceMakeupEditStateParams = {}) {
  const [fullFaceState, setFullFaceState] = useState<FullFaceMakeupEditState>(
    () => initialState ?? getInitialFullFaceMakeupEditState({sourceFrameMetadata}),
  );

  const fullFaceRecipe = useMemo(
    () => createFullFaceMakeupRecipeFromEditState(fullFaceState),
    [fullFaceState],
  );
  const activeFullFaceControl = fullFaceState.controls[fullFaceState.selectedRegion];
  const activeFullFaceFields = getFullFaceMakeupAdjustmentFields(
    fullFaceState.selectedRegion,
  );
  const activeFullFaceColorOptions = getFullFaceMakeupColorOptions(
    fullFaceState.selectedRegion,
  );
  const activeFullFaceFinishOptions = getFullFaceMakeupFinishOptions(
    fullFaceState.selectedRegion,
  );
  const activeFullFaceCandidateOptions = getFullFaceMakeupCandidateOptions(
    fullFaceState.selectedRegion,
  );

  const handleFullFaceRegionPress = (region: MakeupRecipeRegion) => {
    setFullFaceState(currentState => selectFullFaceMakeupRegion(currentState, region));
  };

  const handleFullFaceParamPress = (
    field: RegionAdjustmentFieldSchema,
    direction: 'decrease' | 'increase',
  ) => {
    setFullFaceState(currentState =>
      updateFullFaceMakeupRegionParam({
        state: currentState,
        region: currentState.selectedRegion,
        fieldName: field.name,
        direction,
      }),
    );
  };

  const handleFullFaceIntensityPress = (direction: 'decrease' | 'increase') => {
    setFullFaceState(currentState =>
      updateFullFaceMakeupRegionIntensity({
        state: currentState,
        region: currentState.selectedRegion,
        direction,
      }),
    );
  };

  const handleFullFaceEnabledToggle = () => {
    setFullFaceState(currentState =>
      updateFullFaceMakeupRegionEnabled(
        currentState,
        currentState.selectedRegion,
        !currentState.controls[currentState.selectedRegion].enabled,
      ),
    );
  };

  const handleFullFaceColorPress = (colorHex: string) => {
    setFullFaceState(currentState =>
      updateFullFaceMakeupRegionColor(currentState, currentState.selectedRegion, colorHex),
    );
  };

  const handleFullFaceFinishPress = (finishId: string) => {
    setFullFaceState(currentState =>
      updateFullFaceMakeupRegionFinish(currentState, currentState.selectedRegion, finishId),
    );
  };

  const handleFullFaceCandidatePress = (candidateOptionId: string) => {
    setFullFaceState(currentState =>
      updateFullFaceMakeupRegionCandidate(
        currentState,
        currentState.selectedRegion,
        candidateOptionId,
      ),
    );
  };

  return {
    activeFullFaceCandidateOptions,
    activeFullFaceColorOptions,
    activeFullFaceControl,
    activeFullFaceFields,
    activeFullFaceFinishOptions,
    fullFaceRecipe,
    fullFaceState,
    handleFullFaceCandidatePress,
    handleFullFaceColorPress,
    handleFullFaceEnabledToggle,
    handleFullFaceFinishPress,
    handleFullFaceIntensityPress,
    handleFullFaceParamPress,
    handleFullFaceRegionPress,
  };
}

export type UseFullFaceMakeupEditStateResult = ReturnType<
  typeof useFullFaceMakeupEditState
>;
