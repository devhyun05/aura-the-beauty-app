import type {MakeupFeedbackPhotoSelection} from '../../features/makeup-feedback';
import {createMockMakeupFeedback} from '../../features/makeup-feedback/mocks/makeupFeedback.mock';
import {getReferenceMakeupExtractionDataSync} from '../../features/reference-makeup-extraction/services/makeupExtractionService';
import type {MakeupLookPreview} from '../../shared/types/profile';
import {
  DEFAULT_FLOATING_ACTION_IDS,
  DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
} from '../../shared/ui';
import type {NavigationFlowState} from './flowState';

const demoSelectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection = {
  photoSource: 'camera',
};

export function getDemoNavigationFlowState(): NavigationFlowState {
  const selectedReferenceMakeupPhoto = getReferenceMakeupExtractionDataSync().photos[0];
  const savedMakeupLook: MakeupLookPreview = {
    id: 'capture-demo-saved-makeup-look',
    imageSource: selectedReferenceMakeupPhoto.imageSource,
    isSaved: true,
    makeupArea: 'all',
    makeupPresetValues: {
      shapeId: 'balanced',
    },
    moodLabel: '데모 저장 룩',
    shortDescription: '화면 캡처용으로 준비된 저장 메이크업 룩입니다.',
    scope: 'totalMakeup',
    title: '캡처 데모 룩',
  };

  return {
    floatingActionButtonPosition: DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
    floatingActionIds: DEFAULT_FLOATING_ACTION_IDS,
    floatingActionInteractionMode: DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
    likedMakeupFilterIds: [],
    makeupFeedbackResult: createMockMakeupFeedback(demoSelectedMakeupFeedbackPhoto),
    savedMakeupLook,
    savedMakeupLooks: [],
    selectedFaceAnalysisReport: null,
    selectedFaceCapture: null,
    selectedFaceVerticalThirds: null,
    selectedPersonalColor: null,
    selectedMakeupFeedbackPhoto: demoSelectedMakeupFeedbackPhoto,
    selectedRecommendedMakeupFilterId: null,
    selectedReferenceMakeupPhoto,
    referenceMakeupUploadedPhotos: [],
    shouldShowBeautyJourneyGuide: false,
  };
}
