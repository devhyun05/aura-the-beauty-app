import {getMakeupJourneyReportPrompt} from './reportPrompt';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const initial = getMakeupJourneyReportPrompt({
  analysisGoalText: '내부 분석용으로 바뀐 문구',
  normalizedGoalText: '정규화된 문구',
  originalGoalText: '장마철에도 번지지 않는 메이크업을 하고 싶어요',
  userGoalText: '대체 문구',
}, 'initial');

expect(
  initial?.text === '장마철에도 번지지 않는 메이크업을 하고 싶어요' &&
    initial.isInherited === false,
  'the report prompt displays the original user text before any internal variants',
);

const correction = getMakeupJourneyReportPrompt({
  userGoalText: '눈썹 결을 더 자연스럽게 정리하고 싶어요',
}, 'correction');

expect(
  correction?.text === '눈썹 결을 더 자연스럽게 정리하고 싶어요' &&
    correction.isInherited === true,
  'correction reports identify an inherited user prompt',
);

expect(
  getMakeupJourneyReportPrompt({analysisGoalText: '내부 문구만 있음'}, 'initial') === null,
  'analysis-only text is never exposed as the user prompt',
);

expect(
  getMakeupJourneyReportPrompt({user_goal_text: '  구형 기록의 요청  '}, 'initial')?.text ===
    '구형 기록의 요청',
  'legacy user goal text remains visible after trimming surrounding whitespace',
);

expect(
  getMakeupJourneyReportPrompt({originalGoalText: '   ', normalizedGoalText: '내부 정규화'}, 'initial') === null,
  'blank original text does not fall through to an internal normalized value',
);
