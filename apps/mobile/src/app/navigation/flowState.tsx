import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type {FeedbackPhotoSelection, MakeupFeedbackResult} from '../../features/feedback';
import type {ReferenceMakeupPhoto} from '../../features/reference-makeup-extraction';
import type {MakeupLookPreview} from '../../shared/types/profile';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  feedbackResult: MakeupFeedbackResult | null;
  savedMakeupLook: MakeupLookPreview | null;
  selectedFeedbackPhoto: FeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupLook: Dispatch<SetStateAction<MakeupLookPreview | null>>;
  setSelectedFeedbackPhoto: Dispatch<SetStateAction<FeedbackPhotoSelection>>;
  setSelectedReferenceMakeupPhoto: Dispatch<SetStateAction<ReferenceMakeupPhoto | null>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    feedbackResult: null,
    savedMakeupLook: null,
    selectedFeedbackPhoto: {
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
  const [selectedFeedbackPhoto, setSelectedFeedbackPhoto] =
    useState<FeedbackPhotoSelection>(initialState.selectedFeedbackPhoto);
  const [selectedReferenceMakeupPhoto, setSelectedReferenceMakeupPhoto] =
    useState<ReferenceMakeupPhoto | null>(initialState.selectedReferenceMakeupPhoto);
  const [savedMakeupLook, setSavedMakeupLook] =
    useState<MakeupLookPreview | null>(initialState.savedMakeupLook);
  const [feedbackResult, setFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.feedbackResult);

  const value = useMemo(
    () => ({
      feedbackResult,
      savedMakeupLook,
      selectedFeedbackPhoto,
      selectedReferenceMakeupPhoto,
      setFeedbackResult,
      setSavedMakeupLook,
      setSelectedFeedbackPhoto,
      setSelectedReferenceMakeupPhoto,
    }),
    [feedbackResult, savedMakeupLook, selectedFeedbackPhoto, selectedReferenceMakeupPhoto],
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
