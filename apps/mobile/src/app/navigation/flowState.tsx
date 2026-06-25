import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../../features/makeup-feedback';
import type {ReferenceMakeupPhoto} from '../../features/reference-makeup-extraction';
import type {MakeupStylePreview} from '../../shared/types/profile';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  makeupFeedbackResult: MakeupFeedbackResult | null;
  savedMakeupStyle: MakeupStylePreview | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setMakeupFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupStyle: Dispatch<SetStateAction<MakeupStylePreview | null>>;
  setSelectedMakeupFeedbackPhoto: Dispatch<SetStateAction<MakeupFeedbackPhotoSelection>>;
  setSelectedReferenceMakeupPhoto: Dispatch<SetStateAction<ReferenceMakeupPhoto | null>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    makeupFeedbackResult: null,
    savedMakeupStyle: null,
    selectedMakeupFeedbackPhoto: {
      source: 'camera',
    },
    selectedReferenceMakeupPhoto: null,
  };
}

export function getNavigationFlowStateProviderErrorMessage() {
  return NAVIGATION_FLOW_STATE_PROVIDER_ERROR;
}

type NavigationFlowStateProviderProps = {
  children: ReactNode;
  initialState?: NavigationFlowState;
};

export function NavigationFlowStateProvider({
  children,
  initialState = getInitialNavigationFlowState(),
}: NavigationFlowStateProviderProps) {
  const [selectedMakeupFeedbackPhoto, setSelectedMakeupFeedbackPhoto] =
    useState<MakeupFeedbackPhotoSelection>(initialState.selectedMakeupFeedbackPhoto);
  const [selectedReferenceMakeupPhoto, setSelectedReferenceMakeupPhoto] =
    useState<ReferenceMakeupPhoto | null>(initialState.selectedReferenceMakeupPhoto);
  const [savedMakeupStyle, setSavedMakeupStyle] =
    useState<MakeupStylePreview | null>(initialState.savedMakeupStyle);
  const [makeupFeedbackResult, setMakeupFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.makeupFeedbackResult);

  const value = useMemo(
    () => ({
      makeupFeedbackResult,
      savedMakeupStyle,
      selectedMakeupFeedbackPhoto,
      selectedReferenceMakeupPhoto,
      setMakeupFeedbackResult,
      setSavedMakeupStyle,
      setSelectedMakeupFeedbackPhoto,
      setSelectedReferenceMakeupPhoto,
    }),
    [makeupFeedbackResult, savedMakeupStyle, selectedMakeupFeedbackPhoto, selectedReferenceMakeupPhoto],
  );

  return (
    <NavigationFlowStateContext.Provider value={value}>
      {children}
    </NavigationFlowStateContext.Provider>
  );
}

export function useNavigationFlowState() {
  const context = useContext(NavigationFlowStateContext);

  if (!context) {
    throw new Error(NAVIGATION_FLOW_STATE_PROVIDER_ERROR);
  }

  return context;
}
