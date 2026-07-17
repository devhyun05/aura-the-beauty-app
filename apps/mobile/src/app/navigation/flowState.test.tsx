import {
  getInitialNavigationFlowState,
  getNavigationFlowStateProviderErrorMessage,
} from './flowState';
import {getDemoNavigationFlowState} from './demoFlowState';
import {getFloatingActionButtonPositionForAnchor} from '../../shared/services/floatingActionAnchorStore';

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
  'makeupRecommendation,makeupFeedback,arFilter',
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
  getInitialNavigationFlowState().floatingActionButtonPosition,
  getFloatingActionButtonPositionForAnchor(
    getInitialNavigationFlowState().floatingActionAnchor,
  ),
  'initial and reset flow state derive the legacy side from the normalized anchor',
);

expectEqual(
  getInitialNavigationFlowState().makeupFeedbackKind,
  'initial',
  'initial makeup feedback kind',
);

expectEqual(
  getInitialNavigationFlowState().makeupFeedbackParentReportId,
  null,
  'initial makeup feedback parent',
);

expectEqual(
  /^\d{4}-\d{2}-\d{2}$/.test(
    getInitialNavigationFlowState().makeupFeedbackEntryDate,
  ),
  true,
  'initial makeup feedback entry date format',
);

expectEqual(
  getInitialNavigationFlowState().floatingActionAnchor.xRatio >= 0 &&
    getInitialNavigationFlowState().floatingActionAnchor.xRatio <= 1,
  true,
  'initial floating action anchor is normalized',
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
  'makeupRecommendation,makeupFeedback,arFilter',
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
