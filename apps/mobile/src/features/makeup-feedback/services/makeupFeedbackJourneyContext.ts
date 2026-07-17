import type {
  MakeupFeedbackContext,
  MakeupFeedbackFlowOrigin,
  MakeupFeedbackKind,
  MakeupFeedbackPhotoSelection,
} from '../types';

export type MakeupFeedbackJourneyFlowContext = {
  entryDate: string;
  feedbackKind: MakeupFeedbackKind;
  inheritedGoalContext: MakeupFeedbackContext | null;
  origin: MakeupFeedbackFlowOrigin;
  parentFeedbackReportId: string | null;
  parentScore: number | null;
};

export function getLocalMakeupFeedbackEntryDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getInitialMakeupFeedbackJourneyFlowContext(
  date = new Date(),
): MakeupFeedbackJourneyFlowContext {
  return {
    entryDate: getLocalMakeupFeedbackEntryDate(date),
    feedbackKind: 'initial',
    inheritedGoalContext: null,
    origin: 'general',
    parentFeedbackReportId: null,
    parentScore: null,
  };
}

export function applyMakeupFeedbackJourneyContext(
  selection: MakeupFeedbackPhotoSelection,
  context: MakeupFeedbackJourneyFlowContext,
): MakeupFeedbackPhotoSelection {
  return {
    ...selection,
    entryDate: context.entryDate,
    feedbackContext:
      context.feedbackKind === 'correction'
        ? context.inheritedGoalContext ?? selection.feedbackContext
        : selection.feedbackContext,
    feedbackKind: context.feedbackKind,
    parentFeedbackReportId: context.parentFeedbackReportId,
  };
}

export function clearMakeupFeedbackJourneyContext(
  selection: MakeupFeedbackPhotoSelection,
): MakeupFeedbackPhotoSelection {
  return {
    ...selection,
    entryDate: undefined,
    feedbackContext: undefined,
    feedbackKind: undefined,
    parentFeedbackReportId: undefined,
  };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeInheritedMakeupFeedbackContext(
  value: Record<string, unknown>,
): MakeupFeedbackContext {
  const normalizedGoalText = optionalText(value.normalizedGoalText);
  const originalGoalText = optionalText(value.originalGoalText);
  const userGoalText =
    optionalText(value.userGoalText) ?? normalizedGoalText ?? originalGoalText ?? '';
  const goalIntentType =
    value.goalIntentType === 'generic_default' || value.goalIntentType === 'valid_context'
      ? value.goalIntentType
      : undefined;

  return {
    goalIntentType,
    normalizedGoalText,
    originalGoalText,
    profileGender:
      typeof value.profileGender === 'string' || value.profileGender === null
        ? value.profileGender
        : undefined,
    userGoalText,
  };
}
