import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../../features/makeup-feedback';
import type {Face3DProfile} from '../../features/face-3d/types';
import type {FaceCaptureGreenlightReport} from '../../features/face-capture/services/faceCaptureGreenlight';
import type {FaceCaptureUploadResult} from '../../features/face-capture/services/faceCaptureUploadService';
import type {FaceVerticalThirdsResult} from '../../features/face-ratio/types';
import type {
  AuraPersonalColorResult,
  PersonalColorCorrectionStatus,
} from '../../features/personal-color/types';
import type {ReferenceMakeupPhoto} from '../../features/reference-makeup-extraction';
import type {FaceAnalysisReport} from '../../shared/types/faceAnalysis';
import type {MakeupLookPreview} from '../../shared/types/profile';
import {
  DEFAULT_FLOATING_ACTION_IDS,
  DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  type FloatingActionButtonPosition,
  type FloatingActionId,
  type FloatingActionInteractionMode,
} from '../../shared/ui';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  floatingActionButtonPosition: FloatingActionButtonPosition;
  floatingActionIds: readonly FloatingActionId[];
  floatingActionInteractionMode: FloatingActionInteractionMode;
  likedMakeupFilterIds: readonly string[];
  makeupFeedbackResult: MakeupFeedbackResult | null;
  savedMakeupLook: MakeupLookPreview | null;
  savedMakeupLooks: readonly MakeupLookPreview[];
  // 얼굴 분석 세션에서 ARKit 라이브 측정으로 얻은 3D 프로필(온디바이스, 세션 한정).
  // 측정 skip/실패 시 null — 보고서의 3D 섹션은 null이면 렌더하지 않는다.
  selectedFace3DProfile: Face3DProfile | null;
  selectedFaceAnalysisReport: FaceAnalysisReport | null;
  selectedFaceCapture: FaceCaptureUploadResult | null;
  // 촬영 화면이 산출한 그린라이트 리포트 — Face3D 측정 진입 자격 판정용.
  selectedFaceCaptureGreenlight: FaceCaptureGreenlightReport | null;
  selectedHairCapture: FaceCaptureUploadResult | null;
  selectedFaceVerticalThirds: FaceVerticalThirdsResult | null;
  // 얼굴 분석 세션에서 온디바이스로 진단한 퍼스널 컬러(로컬 전용, 업로드 없음).
  // 조명 보정 성공 시 corrected 결과가 담긴다 (보정 우선 표시 정책).
  selectedPersonalColor: AuraPersonalColorResult | null;
  // 위 결과의 조명 보정 상태(적용 여부 + 미적용 사유) — 보고서 카드 배지용.
  selectedPersonalColorCorrection: PersonalColorCorrectionStatus | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedRecommendedMakeupFilterId: string | null;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
  referenceMakeupUploadedPhotos: readonly ReferenceMakeupPhoto[];
  shouldShowBeautyJourneyGuide: boolean;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  resetNavigationFlowState: () => void;
  setFloatingActionButtonPosition: Dispatch<SetStateAction<FloatingActionButtonPosition>>;
  setFloatingActionIds: Dispatch<SetStateAction<readonly FloatingActionId[]>>;
  setFloatingActionInteractionMode: Dispatch<SetStateAction<FloatingActionInteractionMode>>;
  setLikedMakeupFilterIds: Dispatch<SetStateAction<readonly string[]>>;
  setMakeupFeedbackResult: Dispatch<SetStateAction<MakeupFeedbackResult | null>>;
  setSavedMakeupLook: Dispatch<SetStateAction<MakeupLookPreview | null>>;
  setSavedMakeupLooks: Dispatch<SetStateAction<readonly MakeupLookPreview[]>>;
  setSelectedFace3DProfile: Dispatch<SetStateAction<Face3DProfile | null>>;
  setSelectedFaceAnalysisReport: Dispatch<SetStateAction<FaceAnalysisReport | null>>;
  setSelectedFaceCapture: Dispatch<SetStateAction<FaceCaptureUploadResult | null>>;
  setSelectedFaceCaptureGreenlight: Dispatch<SetStateAction<FaceCaptureGreenlightReport | null>>;
  setSelectedHairCapture: Dispatch<SetStateAction<FaceCaptureUploadResult | null>>;
  setSelectedFaceVerticalThirds: Dispatch<SetStateAction<FaceVerticalThirdsResult | null>>;
  setSelectedPersonalColor: Dispatch<SetStateAction<AuraPersonalColorResult | null>>;
  setSelectedPersonalColorCorrection: Dispatch<SetStateAction<PersonalColorCorrectionStatus | null>>;
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
    floatingActionButtonPosition: DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
    floatingActionIds: DEFAULT_FLOATING_ACTION_IDS,
    floatingActionInteractionMode: DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
    likedMakeupFilterIds: [],
    makeupFeedbackResult: null,
    savedMakeupLook: null,
    savedMakeupLooks: [],
    selectedFace3DProfile: null,
    selectedFaceAnalysisReport: null,
    selectedFaceCapture: null,
    selectedFaceCaptureGreenlight: null,
    selectedHairCapture: null,
    selectedFaceVerticalThirds: null,
    selectedPersonalColor: null,
    selectedPersonalColorCorrection: null,
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
  const [selectedFace3DProfile, setSelectedFace3DProfile] =
    useState<Face3DProfile | null>(initialState.selectedFace3DProfile);
  const [selectedFaceCapture, setSelectedFaceCapture] =
    useState<FaceCaptureUploadResult | null>(initialState.selectedFaceCapture);
  const [selectedFaceCaptureGreenlight, setSelectedFaceCaptureGreenlight] =
    useState<FaceCaptureGreenlightReport | null>(
      initialState.selectedFaceCaptureGreenlight,
    );
  const [selectedHairCapture, setSelectedHairCapture] =
    useState<FaceCaptureUploadResult | null>(initialState.selectedHairCapture);
  const [selectedFaceAnalysisReport, setSelectedFaceAnalysisReport] =
    useState<FaceAnalysisReport | null>(initialState.selectedFaceAnalysisReport);
  const [selectedFaceVerticalThirds, setSelectedFaceVerticalThirds] =
    useState<FaceVerticalThirdsResult | null>(initialState.selectedFaceVerticalThirds);
  const [selectedPersonalColor, setSelectedPersonalColor] =
    useState<AuraPersonalColorResult | null>(initialState.selectedPersonalColor);
  const [selectedPersonalColorCorrection, setSelectedPersonalColorCorrection] =
    useState<PersonalColorCorrectionStatus | null>(
      initialState.selectedPersonalColorCorrection,
    );
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
  const [floatingActionButtonPosition, setFloatingActionButtonPosition] =
    useState<FloatingActionButtonPosition>(initialState.floatingActionButtonPosition);
  const [savedMakeupLook, setSavedMakeupLook] =
    useState<MakeupLookPreview | null>(initialState.savedMakeupLook);
  const [savedMakeupLooks, setSavedMakeupLooks] =
    useState<readonly MakeupLookPreview[]>(initialState.savedMakeupLooks);
  const [makeupFeedbackResult, setMakeupFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialState.makeupFeedbackResult);
  const [shouldShowBeautyJourneyGuide, setShouldShowBeautyJourneyGuide] =
    useState<boolean>(initialState.shouldShowBeautyJourneyGuide);

  const resetNavigationFlowState = useCallback(() => {
    const nextState = getInitialNavigationFlowState();

    setFloatingActionButtonPosition(nextState.floatingActionButtonPosition);
    setFloatingActionIds(nextState.floatingActionIds);
    setFloatingActionInteractionMode(nextState.floatingActionInteractionMode);
    setLikedMakeupFilterIds(nextState.likedMakeupFilterIds);
    setMakeupFeedbackResult(nextState.makeupFeedbackResult);
    setSavedMakeupLook(nextState.savedMakeupLook);
    setSavedMakeupLooks(nextState.savedMakeupLooks);
    setSelectedFace3DProfile(nextState.selectedFace3DProfile);
    setSelectedFaceAnalysisReport(nextState.selectedFaceAnalysisReport);
    setSelectedFaceCapture(nextState.selectedFaceCapture);
    setSelectedFaceCaptureGreenlight(nextState.selectedFaceCaptureGreenlight);
    setSelectedHairCapture(nextState.selectedHairCapture);
    setSelectedFaceVerticalThirds(nextState.selectedFaceVerticalThirds);
    setSelectedPersonalColor(nextState.selectedPersonalColor);
    setSelectedPersonalColorCorrection(nextState.selectedPersonalColorCorrection);
    setSelectedMakeupFeedbackPhoto(nextState.selectedMakeupFeedbackPhoto);
    setSelectedRecommendedMakeupFilterId(nextState.selectedRecommendedMakeupFilterId);
    setSelectedReferenceMakeupPhoto(nextState.selectedReferenceMakeupPhoto);
    setReferenceMakeupUploadedPhotos(nextState.referenceMakeupUploadedPhotos);
    setShouldShowBeautyJourneyGuide(nextState.shouldShowBeautyJourneyGuide);
  }, []);

  const value = useMemo(
    () => ({
      floatingActionButtonPosition,
      floatingActionIds,
      floatingActionInteractionMode,
      likedMakeupFilterIds,
      makeupFeedbackResult,
      savedMakeupLook,
      savedMakeupLooks,
      selectedFace3DProfile,
      selectedFaceAnalysisReport,
      selectedFaceCapture,
      selectedFaceCaptureGreenlight,
      selectedHairCapture,
      selectedFaceVerticalThirds,
      selectedPersonalColor,
      selectedPersonalColorCorrection,
      selectedMakeupFeedbackPhoto,
      selectedRecommendedMakeupFilterId,
      selectedReferenceMakeupPhoto,
      referenceMakeupUploadedPhotos,
      resetNavigationFlowState,
      shouldShowBeautyJourneyGuide,
      setFloatingActionButtonPosition,
      setFloatingActionIds,
      setFloatingActionInteractionMode,
      setLikedMakeupFilterIds,
      setMakeupFeedbackResult,
      setSavedMakeupLook,
      setSavedMakeupLooks,
      setSelectedFace3DProfile,
      setSelectedFaceAnalysisReport,
      setSelectedFaceCapture,
      setSelectedFaceCaptureGreenlight,
      setSelectedHairCapture,
      setSelectedFaceVerticalThirds,
      setSelectedPersonalColor,
      setSelectedPersonalColorCorrection,
      setSelectedMakeupFeedbackPhoto,
      setSelectedRecommendedMakeupFilterId,
      setSelectedReferenceMakeupPhoto,
      setReferenceMakeupUploadedPhotos,
      setShouldShowBeautyJourneyGuide,
    }),
    [
      floatingActionIds,
      floatingActionButtonPosition,
      floatingActionInteractionMode,
      likedMakeupFilterIds,
      makeupFeedbackResult,
      savedMakeupLook,
      savedMakeupLooks,
      selectedFace3DProfile,
      selectedFaceAnalysisReport,
      selectedFaceCapture,
      selectedFaceCaptureGreenlight,
      selectedHairCapture,
      selectedFaceVerticalThirds,
      selectedPersonalColor,
      selectedPersonalColorCorrection,
      selectedMakeupFeedbackPhoto,
      selectedRecommendedMakeupFilterId,
      selectedReferenceMakeupPhoto,
      referenceMakeupUploadedPhotos,
      resetNavigationFlowState,
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
