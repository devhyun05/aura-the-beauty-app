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
import type {MakeupLookPreview} from '../../shared/types/profile';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  makeupFeedbackResult: MakeupFeedbackResult | null;
  savedMakeupLook: MakeupLookPreview | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setMakeupFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupLook: Dispatch<SetStateAction<MakeupLookPreview | null>>;
  setSelectedMakeupFeedbackPhoto: Dispatch<SetStateAction<MakeupFeedbackPhotoSelection>>;
  setSelectedReferenceMakeupPhoto: Dispatch<SetStateAction<ReferenceMakeupPhoto | null>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    makeupFeedbackResult: null,
    savedMakeupLook: null,
    selectedMakeupFeedbackPhoto: {
      photoSource: 'camera',
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
  const [savedMakeupLook, setSavedMakeupLook] =
    useState<MakeupLookPreview | null>(initialState.savedMakeupLook);
  const [makeupFeedbackResult, setMakeupFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.makeupFeedbackResult);

  const value = useMemo(
    () => ({
      makeupFeedbackResult,
      savedMakeupLook,
      selectedMakeupFeedbackPhoto,
      selectedReferenceMakeupPhoto,
      setMakeupFeedbackResult,
      setSavedMakeupLook,
      setSelectedMakeupFeedbackPhoto,
      setSelectedReferenceMakeupPhoto,
    }),
    [makeupFeedbackResult, savedMakeupLook, selectedMakeupFeedbackPhoto, selectedReferenceMakeupPhoto],
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
