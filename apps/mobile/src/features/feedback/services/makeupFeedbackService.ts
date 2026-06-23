import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import type {FeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

const MOCK_ANALYSIS_DELAY_MS = 900;

export async function requestMakeupFeedback(
  selection: FeedbackPhotoSelection,
): Promise<MakeupFeedbackResult> {
  await new Promise((resolve) => {
    setTimeout(resolve, MOCK_ANALYSIS_DELAY_MS);
  });

  return createMockMakeupFeedback(selection);
}
