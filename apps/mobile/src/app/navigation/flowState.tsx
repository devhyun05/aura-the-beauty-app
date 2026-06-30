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
import type {FaceCaptureUploadResult} from '../../features/face-capture/services/faceCaptureUploadService';
import type {ReferenceMakeupPhoto} from '../../features/reference-makeup-extraction';
import type {FaceAnalysisReport} from '../../shared/types/faceAnalysis';
import type {MakeupLookPreview} from '../../shared/types/profile';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  likedMakeupFilterIds: readonly string[];
  makeupFeedbackResult: MakeupFeedbackResult | null;
  savedMakeupLook: MakeupLookPreview | null;
  selectedFaceAnalysisReport: FaceAnalysisReport | null;
  selectedFaceCapture: FaceCaptureUploadResult | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedRecommendedMakeupFilterId: string | null;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setLikedMakeupFilterIds: Dispatch<SetStateAction<readonly string[]>>;
  setMakeupFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupLook: Dispatch<SetStateAction<MakeupLookPreview | null>>;
  setSelectedFaceAnalysisReport: Dispatch<SetStateAction<FaceAnalysisReport | null>>;
  setSelectedFaceCapture: Dispatch<SetStateAction<FaceCaptureUploadResult | null>>;
  setSelectedMakeupFeedbackPhoto: Dispatch<SetStateAction<MakeupFeedbackPhotoSelection>>;
  setSelectedRecommendedMakeupFilterId: Dispatch<SetStateAction<string | null>>;
  setSelectedReferenceMakeupPhoto: Dispatch<SetStateAction<ReferenceMakeupPhoto | null>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    likedMakeupFilterIds: [],
    makeupFeedbackResult: null,
    savedMakeupLook: null,
    selectedFaceAnalysisReport: null,
    selectedFaceCapture: null,
    selectedMakeupFeedbackPhoto: {
      photoSource: 'camera',
    },
    selectedRecommendedMakeupFilterId: null,
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
  const [selectedFaceCapture, setSelectedFaceCapture] =
    useState<FaceCaptureUploadResult | null>(initialState.selectedFaceCapture);
  const [selectedFaceAnalysisReport, setSelectedFaceAnalysisReport] =
    useState<FaceAnalysisReport | null>(initialState.selectedFaceAnalysisReport);
  const [selectedMakeupFeedbackPhoto, setSelectedMakeupFeedbackPhoto] =
    useState<MakeupFeedbackPhotoSelection>(initialState.selectedMakeupFeedbackPhoto);
  const [selectedRecommendedMakeupFilterId, setSelectedRecommendedMakeupFilterId] =
    useState<string | null>(initialState.selectedRecommendedMakeupFilterId);
  const [selectedReferenceMakeupPhoto, setSelectedReferenceMakeupPhoto] =
    useState<ReferenceMakeupPhoto | null>(initialState.selectedReferenceMakeupPhoto);
  const [likedMakeupFilterIds, setLikedMakeupFilterIds] =
    useState<readonly string[]>(initialState.likedMakeupFilterIds);
  const [savedMakeupLook, setSavedMakeupLook] =
    useState<MakeupLookPreview | null>(initialState.savedMakeupLook);
  const [makeupFeedbackResult, setMakeupFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.makeupFeedbackResult);

  const value = useMemo(
    () => ({
      likedMakeupFilterIds,
      makeupFeedbackResult,
      savedMakeupLook,
      selectedFaceAnalysisReport,
      selectedFaceCapture,
      selectedMakeupFeedbackPhoto,
      selectedRecommendedMakeupFilterId,
      selectedReferenceMakeupPhoto,
      setLikedMakeupFilterIds,
      setMakeupFeedbackResult,
      setSavedMakeupLook,
      setSelectedFaceAnalysisReport,
      setSelectedFaceCapture,
      setSelectedMakeupFeedbackPhoto,
      setSelectedRecommendedMakeupFilterId,
      setSelectedReferenceMakeupPhoto,
    }),
    [
      likedMakeupFilterIds,
      makeupFeedbackResult,
      savedMakeupLook,
      selectedFaceAnalysisReport,
      selectedFaceCapture,
      selectedMakeupFeedbackPhoto,
      selectedRecommendedMakeupFilterId,
      selectedReferenceMakeupPhoto,
    ],
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
