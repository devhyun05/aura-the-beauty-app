import {
  MAKEUP_FEEDBACK_DEFAULT_GOAL_TEXT,
  classifyMakeupFeedbackGoalText,
} from './makeupFeedbackGoalIntentService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

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
  expectEqual(result.normalizedGoalText, MAKEUP_FEEDBACK_DEFAULT_GOAL_TEXT, `${value} normalized goal`);
  expectEqual(result.originalGoalText, value, `${value} original goal`);
}

for (const value of [
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