import {
  IMAGE_ANALYSIS_LOADING_TOTAL_MS,
  getImageAnalysisProgressState,
  mockImageAnalysisLoadingSteps,
} from './imageAnalysisLoadingService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const firstProgressState = getImageAnalysisProgressState(0);

expectEqual(
  firstProgressState.activeStep.id,
  mockImageAnalysisLoadingSteps[0].id,
  'first active step',
);
expectEqual(firstProgressState.progressLabel, '0%', 'initial progress label');
expectEqual(firstProgressState.isComplete, false, 'initial completion state');

const lastProgressState = getImageAnalysisProgressState(IMAGE_ANALYSIS_LOADING_TOTAL_MS);

expectEqual(
  lastProgressState.activeStep.id,
  mockImageAnalysisLoadingSteps[mockImageAnalysisLoadingSteps.length - 1].id,
  'last active step',
);
expectEqual(lastProgressState.progressLabel, '100%', 'complete progress label');
expectEqual(lastProgressState.isComplete, true, 'complete state');
