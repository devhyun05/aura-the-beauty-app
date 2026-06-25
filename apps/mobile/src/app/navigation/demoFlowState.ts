import type {MakeupFeedbackPhotoSelection} from '../../features/makeup-feedback';
import {createMockMakeupFeedback} from '../../features/makeup-feedback/mocks/makeupFeedback.mock';
import {getReferenceMakeupExtractionDataSync} from '../../features/reference-makeup-extraction/services/makeupExtractionService';
import type {MakeupStylePreview} from '../../shared/types/profile';
import type {NavigationFlowState} from './flowState';

const demoSelectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection = {
  source: 'camera',
};

export function getDemoNavigationFlowState(): NavigationFlowState {
  const selectedReferenceMakeupPhoto = getReferenceMakeupExtractionDataSync().photos[0];
  const savedMakeupStyle: MakeupStylePreview = {
    id: 'capture-demo-saved-makeup-style',
    imageSource: selectedReferenceMakeupPhoto.imageSource,
    isSaved: true,
    moodLabel: '데모 저장 스타일',
    shortDescription: '화면 캡처용으로 준비된 저장 메이크업 스타일입니다.',
    title: '캡처 데모 스타일',
  };

  return {
    makeupFeedbackResult: createMockMakeupFeedback(demoSelectedMakeupFeedbackPhoto),
    savedMakeupStyle,
    selectedMakeupFeedbackPhoto: demoSelectedMakeupFeedbackPhoto,
    selectedReferenceMakeupPhoto,
  };
}
