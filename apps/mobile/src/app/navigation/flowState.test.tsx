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
  getInitialNavigationFlowState().selectedMakeupFeedbackPhoto.source,
  'camera',
  'initial makeup feedback photo source',
);

expectEqual(
  getInitialNavigationFlowState().makeupFeedbackResult,
  null,
  'initial makeup feedback result',
);

expectEqual(
  getInitialNavigationFlowState().savedMakeupStyle,
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
  demoState.selectedMakeupFeedbackPhoto.source,
  'camera',
  'demo makeup feedback photo source',
);

if (!demoState.makeupFeedbackResult) {
  throw new Error('demo makeup feedback result: expected seeded result');
}

if (!demoState.selectedReferenceMakeupPhoto) {
  throw new Error('demo selected reference makeup photo: expected seeded photo');
}

if (!demoState.savedMakeupStyle) {
  throw new Error('demo saved makeup style: expected seeded style');
}

expectEqual(
  demoState.savedMakeupStyle.id,
  'capture-demo-saved-makeup-style',
  'demo saved makeup style id',
);
