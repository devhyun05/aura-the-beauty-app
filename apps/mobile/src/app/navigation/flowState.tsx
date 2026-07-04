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
import {
  DEFAULT_FLOATING_ACTION_IDS,
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  type FloatingActionId,
  type FloatingActionInteractionMode,
} from '../../shared/ui';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  floatingActionIds: readonly FloatingActionId[];
  floatingActionInteractionMode: FloatingActionInteractionMode;
  likedMakeupFilterIds: readonly string[];
  makeupFeedbackResult: MakeupFeedbackResult | null;
  savedMakeupLook: MakeupLookPreview | null;
  savedMakeupLooks: readonly MakeupLookPreview[];
  selectedFaceAnalysisReport: FaceAnalysisReport | null;
  selectedFaceCapture: FaceCaptureUploadResult | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedRecommendedMakeupFilterId: string | null;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
  referenceMakeupUploadedPhotos: readonly ReferenceMakeupPhoto[];
  shouldShowBeautyJourneyGuide: boolean;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setFloatingActionIds: Dispatch<SetStateAction<readonly FloatingActionId[]>>;
  setFloatingActionInteractionMode: Dispatch<SetStateAction<FloatingActionInteractionMode>>;
  setLikedMakeupFilterIds: Dispatch<SetStateAction<readonly string[]>>;
  setMakeupFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupLook: Dispatch<SetStateAction<MakeupLookPreview | null>>;
  setSavedMakeupLooks: Dispatch<SetStateAction<readonly MakeupLookPreview[]>>;
  setSelectedFaceAnalysisReport: Dispatch<SetStateAction<FaceAnalysisReport | null>>;
  setSelectedFaceCapture: Dispatch<SetStateAction<FaceCaptureUploadResult | null>>;
  setSelectedMakeupFeedbackPhoto: Dispatch<SetStateAction<MakeupFeedbackPhotoSelection>>;
  setSelectedRecommendedMakeupFilterId: Dispatch<SetStateAction<string | null>>;
  setSelectedReferenceMakeupPhoto: Dispatch<SetStateAction<ReferenceMakeupPhoto | null>>;
  setReferenceMakeupUploadedPhotos: Dispatch<SetStateAction<readonly ReferenceMakeupPhoto[]>>;
  setShouldShowBeautyJourneyGuide: Dispatch<SetStateAction<boolean>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    floatingActionIds: DEFAULT_FLOATING_ACTION_IDS,
    floatingActionInteractionMode: DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
    likedMakeupFilterIds: [],
    makeupFeedbackResult: null,
    savedMakeupLook: null,
    savedMakeupLooks: [],
    selectedFaceAnalysisReport: null,
    selectedFaceCapture: null,
    selectedMakeupFeedbackPhoto: {
      photoSource: 'camera',
    },
    selectedRecommendedMakeupFilterId: null,
    selectedReferenceMakeupPhoto: null,
    referenceMakeupUploadedPhotos: [],
    shouldShowBeautyJourneyGuide: false,
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
  const [referenceMakeupUploadedPhotos, setReferenceMakeupUploadedPhotos] =
    useState<readonly ReferenceMakeupPhoto[]>(initialState.referenceMakeupUploadedPhotos);
  const [likedMakeupFilterIds, setLikedMakeupFilterIds] =
    useState<readonly string[]>(initialState.likedMakeupFilterIds);
  const [floatingActionIds, setFloatingActionIds] =
    useState<readonly FloatingActionId[]>(initialState.floatingActionIds);
  const [floatingActionInteractionMode, setFloatingActionInteractionMode] =
    useState<FloatingActionInteractionMode>(initialState.floatingActionInteractionMode);
  const [savedMakeupLook, setSavedMakeupLook] =
    useState<MakeupLookPreview | null>(initialState.savedMakeupLook);
  const [savedMakeupLooks, setSavedMakeupLooks] =
    useState<readonly MakeupLookPreview[]>(initialState.savedMakeupLooks);
  const [makeupFeedbackResult, setMakeupFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.makeupFeedbackResult);
  const [shouldShowBeautyJourneyGuide, setShouldShowBeautyJourneyGuide] =
    useState<boolean>(initialState.shouldShowBeautyJourneyGuide);

  const value = useMemo(
    () => ({
      floatingActionIds,
      floatingActionInteractionMode,
      likedMakeupFilterIds,
      makeupFeedbackResult,
      savedMakeupLook,
      savedMakeupLooks,
      selectedFaceAnalysisReport,
      selectedFaceCapture,
      selectedMakeupFeedbackPhoto,
      selectedRecommendedMakeupFilterId,
      selectedReferenceMakeupPhoto,
      referenceMakeupUploadedPhotos,
      shouldShowBeautyJourneyGuide,
      setFloatingActionIds,
      setFloatingActionInteractionMode,
      setLikedMakeupFilterIds,
      setMakeupFeedbackResult,
      setSavedMakeupLook,
      setSavedMakeupLooks,
      setSelectedFaceAnalysisReport,
      setSelectedFaceCapture,
      setSelectedMakeupFeedbackPhoto,
      setSelectedRecommendedMakeupFilterId,
      setSelectedReferenceMakeupPhoto,
      setReferenceMakeupUploadedPhotos,
      setShouldShowBeautyJourneyGuide,
    }),
    [
      floatingActionIds,
      floatingActionInteractionMode,
      likedMakeupFilterIds,
      makeupFeedbackResult,
      savedMakeupLook,
      savedMakeupLooks,
      selectedFaceAnalysisReport,
      selectedFaceCapture,
      selectedMakeupFeedbackPhoto,
      selectedRecommendedMakeupFilterId,
      selectedReferenceMakeupPhoto,
      referenceMakeupUploadedPhotos,
      shouldShowBeautyJourneyGuide,
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
