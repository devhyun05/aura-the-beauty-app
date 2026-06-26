import {
  FACE_ANALYSIS_LOADING_TOTAL_MS,
  getFaceAnalysisProgressState,
  faceAnalysisLoadingSteps,
} from './faceAnalysisLoadingService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const firstProgressState = getFaceAnalysisProgressState(0);

expectEqual(
  firstProgressState.activeStep.id,
  faceAnalysisLoadingSteps[0].id,
  'first active step',
);
expectEqual(firstProgressState.progressLabel, '0%', 'initial progress label');
expectEqual(firstProgressState.isComplete, false, 'initial completion state');

const lastProgressState = getFaceAnalysisProgressState(FACE_ANALYSIS_LOADING_TOTAL_MS);

expectEqual(
  lastProgressState.activeStep.id,
  faceAnalysisLoadingSteps[faceAnalysisLoadingSteps.length - 1].id,
  'last active step',
);
expectEqual(lastProgressState.progressLabel, '100%', 'complete progress label');
expectEqual(lastProgressState.isComplete, true, 'complete state');
