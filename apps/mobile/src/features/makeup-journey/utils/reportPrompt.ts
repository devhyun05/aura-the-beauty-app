import type {MakeupFeedbackContext} from '../../makeup-feedback/types';
import type {MakeupJourneyFeedbackKind} from '../types';

type JourneyGoalContext = Partial<MakeupFeedbackContext> & Record<string, unknown>;

export type MakeupJourneyReportPrompt = {
  isInherited: boolean;
  text: string;
};

function getText(context: JourneyGoalContext, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = context[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Returns only text the user actually entered. Normalized and analysis-only
 * variants are intentionally excluded because they can contain system wording.
 */
export function getMakeupJourneyReportPrompt(
  context: JourneyGoalContext | null | undefined,
  feedbackKind: MakeupJourneyFeedbackKind,
): MakeupJourneyReportPrompt | null {
  if (!context) {
    return null;
  }

  const text = getText(
    context,
    'originalGoalText',
    'original_goal_text',
    'userGoalText',
    'user_goal_text',
  );

  return text
    ? {isInherited: feedbackKind === 'correction', text}
    : null;
}
