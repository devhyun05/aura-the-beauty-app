import {
  buildMakeupFeedbackGoalContext,
  classifyMakeupFeedbackGoalText,
  localizeMakeupFeedbackIntensityTerms,
} from './makeupFeedbackGoalIntentService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  localizeMakeupFeedbackIntensityTerms('사진에서 표현이 관찰되어 light로 요약했습니다.'),
  '사진에서 표현이 관찰되어 가벼운 표현으로 요약했습니다.',
  'light intensity copy',
);
expectEqual(
  localizeMakeupFeedbackIntensityTerms('현재 강도는 medium입니다.'),
  '현재 강도는 적당한 강도입니다.',
  'medium intensity copy',
);
expectEqual(
  localizeMakeupFeedbackIntensityTerms('bold한 색조지만 highlight는 유지합니다.'),
  '선명한 색조지만 highlight는 유지합니다.',
  'bold copy without replacing a substring',
);

const emptyGoal = classifyMakeupFeedbackGoalText('   ');
expectEqual(emptyGoal.intentType, 'generic_default', 'empty goal intent');
expectEqual(emptyGoal.normalizedGoalText, '', 'empty normalized goal');
const emptyGoalContext = buildMakeupFeedbackGoalContext(emptyGoal);
if (!emptyGoalContext) {
  throw new Error('empty goal should build the expert review context');
}
expectEqual(emptyGoalContext.userGoalText, '', 'empty context user goal');

for (const value of ['ㅗㅗㅗㅗㅗㅗ', 'ㅋㅋㅋㅋㅋㅋ', 'ㅎㅎㅎㅎㅎㅎ', 'ㄱㄱㄱㄱ', '....', '!!!', 'asdfasdf', 'qwerqwer', 'qwerty', 'sdfghj', '123123', 'a', '.']) {
  const result = classifyMakeupFeedbackGoalText(value);
  expectEqual(result.intentType, 'noise', `${value} intent`);
  expectEqual(result.normalizedGoalText, '', `${value} normalized goal`);
}


for (const value of ['여친', '여자친구', '여자친구랑', '이거', '그거', '나 어떻게', '어떡할건데 에베베', '몰라', '몰라 ㅋㅋ', '저렇게']) {
  const result = classifyMakeupFeedbackGoalText(value);
  expectEqual(result.intentType, 'needs_detail', `${value} intent`);
  expectEqual(result.normalizedGoalText, '', `${value} normalized goal`);
}

for (const value of ['평가해줘', '분석해줘', '알아서 해줘', '아무거나', '그냥', '봐줘', '어때', '전체적으로 봐줘', '나 어떻게 보여?']) {
  const result = classifyMakeupFeedbackGoalText(value);
  expectEqual(result.intentType, 'generic_default', `${value} intent`);
  expectEqual(result.normalizedGoalText, value, `${value} normalized goal`);
  expectEqual(result.originalGoalText, value, `${value} original goal`);
}
const genericGoalText = '\uC804\uCCB4\uC801\uC73C\uB85C \uBD10\uC918';
const genericContext = buildMakeupFeedbackGoalContext(
  classifyMakeupFeedbackGoalText(genericGoalText),
);

if (!genericContext) {
  throw new Error('generic request should build a feedback context');
}

expectEqual(genericContext.userGoalText, genericGoalText, 'generic context user goal');
expectEqual(genericContext.normalizedGoalText, genericGoalText, 'generic context normalized goal');


for (const value of [
  '청순',
  '글로우',
  '시크한 느낌',
  '립이 너무 진한지 봐줘',
  '데일리로 자연스럽게 보이는지',
  '피부 전체적으로 봐줘',
  '면접용으로 깔끔한지',
  '여자친구랑 카페가야하는 상황',
  '여친이랑 카페',
  '여친 만나러 감',
  '회식',
  '카페',
  '친구 만나러 감',
  '회사 회식',
  '오랜만에 외출',
  '사진 찍을 예정',
  '오늘 중요한 약속',
  '이거 자연스러워?',
  '나 어떻게 하면 데일리로 좋아?',
  '립 추천해줘',
  '카페 메이크업 추천',
  'cafe date',
  'job interview',
  'id photo',
]) {
  const result = classifyMakeupFeedbackGoalText(value);
  expectEqual(result.intentType, 'valid_context', `${value} intent`);
  expectEqual(result.normalizedGoalText, value, `${value} normalized goal`);
  expectEqual(result.originalGoalText, value, `${value} original goal`);
}
