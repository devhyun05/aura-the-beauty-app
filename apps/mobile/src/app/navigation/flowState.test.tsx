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
  getInitialNavigationFlowState().selectedFeedbackPhoto.source,
  'camera',
  'initial feedback photo source',
);

expectEqual(
  getInitialNavigationFlowState().feedbackResult,
  null,
  'initial feedback result',
);

expectEqual(
  getInitialNavigationFlowState().savedMakeupLook,
  null,
  'initial saved makeup style',
);

expectEqual(
  getInitialNavigationFlowState().selectedReferenceMakeupPhoto,
  null,
  'initial selected reference makeup photo',
);

const demoState = getDemoNavigationFlowState();

expectEqual(
  demoState.selectedFeedbackPhoto.source,
  'camera',
  'demo feedback photo source',
);

if (!demoState.feedbackResult) {
  throw new Error('demo feedback result: expected seeded result');
}

if (!demoState.selectedReferenceMakeupPhoto) {
  throw new Error('demo selected reference makeup photo: expected seeded photo');
}

if (!demoState.savedMakeupLook) {
  throw new Error('demo saved makeup style: expected seeded style');
}

expectEqual(
  demoState.savedMakeupLook.id,
  'capture-demo-saved-makeup-look',
  'demo saved makeup style id',
);
