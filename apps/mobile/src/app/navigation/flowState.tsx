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
import {createMockMakeupFeedback} from '../../features/feedback/mocks/makeupFeedback.mock';
import type {FilterExtractionPhoto} from '../../features/filter-extraction';
import {getFilterExtractionDataSync} from '../../features/filter-extraction/services/filterExtractionService';
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

const initialSelectedFeedbackPhoto: FeedbackPhotoSelection = {
  source: 'camera',
};

const initialSelectedFilterPhoto = getFilterExtractionDataSync().photos[0];

const initialSavedMakeupStyle: MakeupStylePreview = {
  id: 'capture-demo-saved-makeup-look',
  imageSource: initialSelectedFilterPhoto.imageSource,
  isSaved: true,
  moodLabel: '데모 저장룩',
  shortDescription: '화면 캡처용으로 준비된 저장 메이크업 룩입니다.',
  title: '캡처 데모 룩',
};

const initialNavigationFlowState: NavigationFlowState = {
  feedbackResult: createMockMakeupFeedback(initialSelectedFeedbackPhoto),
  savedMakeupStyle: initialSavedMakeupStyle,
  selectedFeedbackPhoto: initialSelectedFeedbackPhoto,
  selectedFilterPhoto: initialSelectedFilterPhoto,
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return initialNavigationFlowState;
}

export function getNavigationFlowStateProviderErrorMessage() {
  return NAVIGATION_FLOW_STATE_PROVIDER_ERROR;
}

export function NavigationFlowStateProvider({children}: {children: ReactNode}) {
  const [selectedFeedbackPhoto, setSelectedFeedbackPhoto] =
    useState<FeedbackPhotoSelection>(initialNavigationFlowState.selectedFeedbackPhoto);
  const [selectedFilterPhoto, setSelectedFilterPhoto] =
    useState<FilterExtractionPhoto | null>(initialNavigationFlowState.selectedFilterPhoto);
  const [savedMakeupStyle, setSavedMakeupStyle] =
    useState<MakeupStylePreview | null>(initialNavigationFlowState.savedMakeupStyle);
  const [feedbackResult, setFeedbackResult] =
    useState<MakeupFeedbackResult | null>(initialNavigationFlowState.feedbackResult);

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
