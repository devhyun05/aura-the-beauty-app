import {
  applyMakeupFeedbackJourneyContext,
  clearMakeupFeedbackJourneyContext,
  getInitialMakeupFeedbackJourneyFlowContext,
  getLocalMakeupFeedbackEntryDate,
} from './makeupFeedbackJourneyContext';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getLocalMakeupFeedbackEntryDate(new Date(2026, 0, 2, 23, 59)),
  '2026-01-02',
  'entry date uses local calendar fields',
);

const initialContext = getInitialMakeupFeedbackJourneyFlowContext(
  new Date(2026, 6, 17),
);
expectEqual(initialContext.entryDate, '2026-07-17', 'initial entry date');
expectEqual(initialContext.feedbackKind, 'initial', 'initial feedback kind');
expectEqual(initialContext.parentFeedbackReportId, null, 'initial parent is empty');

const inheritedGoalContext = {
  goalIntentType: 'valid_context' as const,
  userGoalText: '데일리 메이크업 균형',
};
const correction = applyMakeupFeedbackJourneyContext(
  {photoSource: 'gallery'},
  {
    entryDate: '2026-07-12',
    feedbackKind: 'correction',
    inheritedGoalContext,
    origin: 'journeyDay',
    parentFeedbackReportId: 'report-1',
    parentScore: 72,
  },
);

expectEqual(correction.entryDate, '2026-07-12', 'correction inherits entry date');
expectEqual(correction.feedbackKind, 'correction', 'correction kind');
expectEqual(
  correction.feedbackContext?.userGoalText,
  inheritedGoalContext.userGoalText,
  'correction inherits goal context',
);
expectEqual(
  correction.parentFeedbackReportId,
  'report-1',
  'correction keeps parent report',
);

(['success', 'failure', 'cancel'] as const).forEach(terminalReason => {
  const clearedCorrection = clearMakeupFeedbackJourneyContext(correction);
  expectEqual(
    clearedCorrection.photoSource,
    'gallery',
    `${terminalReason} cleanup preserves the photo source`,
  );
  expectEqual(
    clearedCorrection.entryDate,
    undefined,
    `${terminalReason} cleanup removes entry date`,
  );
  expectEqual(
    clearedCorrection.feedbackKind,
    undefined,
    `${terminalReason} cleanup removes feedback kind`,
  );
  expectEqual(
    clearedCorrection.parentFeedbackReportId,
    undefined,
    `${terminalReason} cleanup removes the correction parent`,
  );
  expectEqual(
    clearedCorrection.feedbackContext,
    undefined,
    `${terminalReason} cleanup removes inherited goal data`,
  );
});
