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
import type {FilterExtractionPhoto} from '../../features/filter-extraction';
import type {MakeupStylePreview} from '../../shared/types/myPage';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  feedbackResult: MakeupFeedbackResult | null;
  savedMakeupStyle: MakeupStylePreview | null;
  selectedFeedbackPhoto: FeedbackPhotoSelection;
  selectedFilterPhoto: FilterExtractionPhoto | null;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupStyle: Dispatch<SetStateAction<MakeupStylePreview | null>>;
  setSelectedFeedbackPhoto: Dispatch<SetStateAction<FeedbackPhotoSelection>>;
  setSelectedFilterPhoto: Dispatch<SetStateAction<FilterExtractionPhoto | null>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    feedbackResult: null,
    savedMakeupStyle: null,
    selectedFeedbackPhoto: {
      source: 'camera',
    },
    selectedFilterPhoto: null,
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
  const [selectedFilterPhoto, setSelectedFilterPhoto] =
    useState<FilterExtractionPhoto | null>(initialState.selectedFilterPhoto);
  const [savedMakeupStyle, setSavedMakeupStyle] =
    useState<MakeupStylePreview | null>(initialState.savedMakeupStyle);
  const [feedbackResult, setFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.feedbackResult);

  const value = useMemo(
    () => ({
      feedbackResult,
      savedMakeupStyle,
      selectedFeedbackPhoto,
      selectedFilterPhoto,
      setFeedbackResult,
      setSavedMakeupStyle,
      setSelectedFeedbackPhoto,
      setSelectedFilterPhoto,
    }),
    [feedbackResult, savedMakeupStyle, selectedFeedbackPhoto, selectedFilterPhoto],
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
