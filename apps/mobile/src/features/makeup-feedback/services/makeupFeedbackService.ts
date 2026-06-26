import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

const MOCK_ANALYSIS_DELAY_MS = 900;

export async function analyzeMakeupForFeedback(
  selection: MakeupFeedbackPhotoSelection,
): Promise<MakeupFeedbackResult> {
  await new Promise((resolve) => {
    setTimeout(resolve, MOCK_ANALYSIS_DELAY_MS);
  });

  return createMockMakeupFeedback(selection);
}
