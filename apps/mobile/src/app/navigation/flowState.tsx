import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type {FaceCaptureUploadResult} from '../../features/face-capture/services/faceCaptureUploadService';
import type {FeedbackPhotoSelection, MakeupFeedbackResult} from '../../features/feedback';
import type {FilterExtractionPhoto} from '../../features/filter-extraction';
import type {MakeupLookPreview} from '../../shared/types/profile';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  feedbackResult: MakeupFeedbackResult | null;
  savedMakeupLook: MakeupLookPreview | null;
  selectedFaceCapture: FaceCaptureUploadResult | null;
  selectedFeedbackPhoto: FeedbackPhotoSelection;
  selectedFilterPhoto: FilterExtractionPhoto | null;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupLook: Dispatch<SetStateAction<MakeupLookPreview | null>>;
  setSelectedFaceCapture: Dispatch<SetStateAction<FaceCaptureUploadResult | null>>;
  setSelectedFeedbackPhoto: Dispatch<SetStateAction<FeedbackPhotoSelection>>;
  setSelectedFilterPhoto: Dispatch<SetStateAction<FilterExtractionPhoto | null>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    feedbackResult: null,
    savedMakeupLook: null,
    selectedFaceCapture: null,
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
  const [selectedFaceCapture, setSelectedFaceCapture] =
    useState<FaceCaptureUploadResult | null>(initialState.selectedFaceCapture);
  const [selectedFeedbackPhoto, setSelectedFeedbackPhoto] =
    useState<FeedbackPhotoSelection>(initialState.selectedFeedbackPhoto);
  const [selectedFilterPhoto, setSelectedFilterPhoto] =
    useState<FilterExtractionPhoto | null>(initialState.selectedFilterPhoto);
  const [savedMakeupLook, setSavedMakeupLook] =
    useState<MakeupLookPreview | null>(initialState.savedMakeupLook);
  const [feedbackResult, setFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.feedbackResult);

  const value = useMemo(
    () => ({
      feedbackResult,
      savedMakeupLook,
      selectedFaceCapture,
      selectedFeedbackPhoto,
      selectedFilterPhoto,
      setFeedbackResult,
      setSavedMakeupLook,
      setSelectedFaceCapture,
      setSelectedFeedbackPhoto,
      setSelectedFilterPhoto,
    }),
    [feedbackResult, savedMakeupLook, selectedFaceCapture, selectedFeedbackPhoto, selectedFilterPhoto],
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
