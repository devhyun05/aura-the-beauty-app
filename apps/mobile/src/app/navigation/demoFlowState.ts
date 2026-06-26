import type {FeedbackPhotoSelection} from '../../features/feedback';
import {createMockMakeupFeedback} from '../../features/feedback/mocks/makeupFeedback.mock';
import {getFilterExtractionDataSync} from '../../features/filter-extraction/services/filterExtractionService';
import type {MakeupLookPreview} from '../../shared/types/profile';
import type {NavigationFlowState} from './flowState';

const demoSelectedFeedbackPhoto: FeedbackPhotoSelection = {
  source: 'camera',
};

export function getDemoNavigationFlowState(): NavigationFlowState {
  const selectedFilterPhoto = getFilterExtractionDataSync().photos[0];
  const savedMakeupLook: MakeupLookPreview = {
    id: 'capture-demo-saved-makeup-look',
    imageSource: selectedFilterPhoto.imageSource,
    isSaved: true,
    moodLabel: '캡처 데모',
    shortDescription: '캡처 화면에서 이어지는 데모 메이크업 룩입니다.',
    title: '캡처 데모 룩',
  };

  return {
    feedbackResult: createMockMakeupFeedback(demoSelectedFeedbackPhoto),
    savedMakeupLook,
    selectedFaceCapture: null,
    selectedFeedbackPhoto: demoSelectedFeedbackPhoto,
    selectedFilterPhoto,
  };
}
