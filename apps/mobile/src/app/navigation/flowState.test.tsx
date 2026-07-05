import {
  getInitialNavigationFlowState,
  getNavigationFlowStateProviderErrorMessage,
} from './flowState';
import {getDemoNavigationFlowState} from './demoFlowState';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getNavigationFlowStateProviderErrorMessage(),
  'useNavigationFlowState must be used inside NavigationFlowStateProvider',
  'flow state provider guard message',
);

expectEqual(
  getInitialNavigationFlowState().likedMakeupFilterIds.length,
  0,
  'initial liked makeup filter count',
);

expectEqual(
  getInitialNavigationFlowState().floatingActionIds.join(','),
  'arFilter,makeupExtraction,makeupFeedback',
  'initial floating action ids',
);

expectEqual(
  getInitialNavigationFlowState().floatingActionInteractionMode,
  'drag',
  'initial floating action interaction mode',
);

expectEqual(
  getInitialNavigationFlowState().floatingActionButtonPosition,
  'right',
  'initial floating action button position',
);

expectEqual(
  getInitialNavigationFlowState().selectedMakeupFeedbackPhoto.photoSource,
  'camera',
  'initial makeup feedback photoSource',
);

expectEqual(
  getInitialNavigationFlowState().makeupFeedbackResult,
  null,
  'initial makeup feedback result',
);

expectEqual(
  getInitialNavigationFlowState().savedMakeupLook,
  null,
  'initial saved makeup look',
);

expectEqual(
  getInitialNavigationFlowState().savedMakeupLooks.length,
  0,
  'initial saved makeup looks',
);

expectEqual(
  getInitialNavigationFlowState().shouldShowBeautyJourneyGuide,
  false,
  'initial beauty journey guide visibility',
);

expectEqual(
  getInitialNavigationFlowState().selectedFaceAnalysisReport,
  null,
  'initial selected face analysis report',
);

expectEqual(
  getInitialNavigationFlowState().selectedReferenceMakeupPhoto,
  null,
  'initial selected reference makeup photo',
);

expectEqual(
  getInitialNavigationFlowState().selectedRecommendedMakeupFilterId,
  null,
  'initial selected recommended makeup filter id',
);

const demoState = getDemoNavigationFlowState();

expectEqual(
  demoState.likedMakeupFilterIds.length,
  0,
  'demo liked makeup filter count',
);

expectEqual(
  demoState.floatingActionIds.join(','),
  'arFilter,makeupExtraction,makeupFeedback',
  'demo floating action ids',
);

expectEqual(
  demoState.floatingActionInteractionMode,
  'drag',
  'demo floating action interaction mode',
);

expectEqual(
  demoState.floatingActionButtonPosition,
  'right',
  'demo floating action button position',
);

expectEqual(
  demoState.selectedMakeupFeedbackPhoto.photoSource,
  'camera',
  'demo makeup feedback photoSource',
);

expectEqual(
  demoState.shouldShowBeautyJourneyGuide,
  false,
  'demo beauty journey guide visibility',
);

if (!demoState.makeupFeedbackResult) {
  throw new Error('demo makeup feedback result: expected seeded result');
}

if (!demoState.selectedReferenceMakeupPhoto) {
  throw new Error('demo selected reference makeup photo: expected seeded photo');
}

if (!demoState.savedMakeupLook) {
  throw new Error('demo saved makeup look: expected seeded look');
}

expectEqual(
  demoState.savedMakeupLook.id,
  'capture-demo-saved-makeup-look',
  'demo saved makeup look id',
);

expectEqual(
  demoState.savedMakeupLooks.length,
  0,
  'demo saved makeup looks',
);

expectEqual(
  demoState.selectedRecommendedMakeupFilterId,
  null,
  'demo selected recommended makeup filter id',
);
