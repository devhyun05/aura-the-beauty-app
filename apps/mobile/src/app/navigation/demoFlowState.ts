import type {FeedbackPhotoSelection} from '../../features/feedback';
import {createMockMakeupFeedback} from '../../features/feedback/mocks/makeupFeedback.mock';
import {getFilterExtractionDataSync} from '../../features/filter-extraction/services/filterExtractionService';
import type {MakeupStylePreview} from '../../shared/types/myPage';
import type {NavigationFlowState} from './flowState';

const demoSelectedFeedbackPhoto: FeedbackPhotoSelection = {
  source: 'camera',
};

export function getDemoNavigationFlowState(): NavigationFlowState {
  const selectedFilterPhoto = getFilterExtractionDataSync().photos[0];
  const savedMakeupStyle: MakeupStylePreview = {
    id: 'capture-demo-saved-makeup-look',
    imageSource: selectedFilterPhoto.imageSource,
    isSaved: true,
    moodLabel: '데모 저장룩',
    shortDescription: '화면 캡처용으로 준비된 저장 메이크업 룩입니다.',
    title: '캡처 데모 룩',
  };

  return {
    feedbackResult: createMockMakeupFeedback(demoSelectedFeedbackPhoto),
    savedMakeupStyle,
    selectedFeedbackPhoto: demoSelectedFeedbackPhoto,
    selectedFilterPhoto,
  };
}
