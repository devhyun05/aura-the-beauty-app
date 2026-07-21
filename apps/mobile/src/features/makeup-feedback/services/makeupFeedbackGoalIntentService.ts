import type {MakeupFeedbackContext} from '../types';

export type MakeupFeedbackGoalIntentType =
  | 'generic_default'
  | 'needs_detail'
  | 'noise'
  | 'valid_context';

export type MakeupFeedbackGoalIntentResult = {
  errorMessage?: string;
  intentType: MakeupFeedbackGoalIntentType;
  normalizedGoalText: string;
  originalGoalText: string;
};

const userFacingIntensityTerms = [
  {raw: 'light', adjective: '가벼운', noun: '가벼운 표현', instrumental: '가벼운 표현으로'},
  {raw: 'medium', adjective: '적당한', noun: '적당한 강도', instrumental: '적당한 강도로'},
  {raw: 'bold', adjective: '선명한', noun: '선명한 표현', instrumental: '선명한 표현으로'},
] as const;

/**
 * Keeps the API intensity enum intact while preventing its raw English value
 * from leaking into Korean copy generated for users.
 */
export function localizeMakeupFeedbackIntensityTerms(value: string): string {
  return userFacingIntensityTerms.reduce((localized, term) => {
    const prefix = '(^|[^A-Za-z0-9_])';
    const suffix = '(?=$|[^A-Za-z0-9_])';

    return localized
      .replace(
        new RegExp(`${prefix}${term.raw}(?:으)?로${suffix}`, 'gi'),
        `$1${term.instrumental}`,
      )
      .replace(
        new RegExp(`${prefix}${term.raw}한${suffix}`, 'gi'),
        `$1${term.adjective}`,
      )
      .replace(
        new RegExp(`${prefix}${term.raw}인${suffix}`, 'gi'),
        `$1${term.noun}인`,
      )
      .replace(
        new RegExp(`${prefix}${term.raw}${suffix}`, 'gi'),
        `$1${term.noun}`,
      );
  }, value);
}


const noiseGoalMessage = '의미 있는 상황을 한 문장으로 적어주세요.';
const needsDetailGoalMessage = '어떤 상황에서 보일 메이크업인지 한 문장만 더 적어주세요.';

const genericRequestKeywords = [
  '괜찮',
  '고쳐',
  '균형',
  '그냥',
  '대충',
  '문제',
  '봐줘',
  '봐 줘',
  '봐달',
  '보여',
  '분석',
  '아무거나',
  '알아서',
  '어때',
  '어떤지',
  '전체',
  '전반',
  '평가',
  '피드백',
];

const contextAnchorKeywords = [
  '가볍',
  '강렬',
  '글램',
  '글로우',
  '결혼식',
  '공연',
  '과하',
  '깔끔',
  '꾸안꾸',
  '내추럴',
  '눈',
  '눈썹',
  '데이트',
  '데일리',
  '들떠',
  '러블리',
  '립',
  '맑',
  '매트',
  '마스카라',
  '면접',
  '모임',
  '무대',
  '발색',
  '발표',
  '부드러',
  '블러셔',
  '사진',
  '색감',
  '생기',
  '섀도',
  '소개팅',
  '수업',
  '약속',
  '은은',
  '여행',
  '연말',
  '예식',
  '오피스',
  '외출',
  '운동',
  '입학',
  '자연',
  '증명',
  '차분',
  '청순',
  '촬영',
  '출근',
  '축제',
  '치크',
  '촉촉',
  '카페',
  '커버',
  '톤',
  '투명',
  '파티',
  '피부',
  '학교',
  '화사',
  '화려',
  '시크',
  '힙',
  '회사',
  '회식',
  'cafe',
  'date',
  'daily',
  'interview',
  'office',
  'party',
  'photo',
];

const vagueExactTerms = new Set([
  '그거',
  '그것',
  '그냥해',
  '글쎄',
  '나어떻게',
  '남친',
  '남자친구',
  '몰라',
  '모르겠어',
  '모르겠음',
  '모름',
  '뭐',
  '뭐하지',
  '여자친구',
  '여친',
  '애인',
  '어떡해',
  '어떻게',
  '어떻게해',
  '어쩌라고',
  '이거',
  '이것',
  '이렇게',
  '저거',
  '저것',
  '저렇게',
  '친구',
]);

const vagueFragments = ['에베베', '메롱', '몰라', '모르겠', '어쩌라고', '어떡할건데', '나 어떻게', '나어떻게'];
const relationWords = ['여친', '남친', '여자친구', '남자친구', '친구', '애인', '썸남', '썸녀'];
const actionOrPlaceFragments = [
  '가',
  '감',
  '갈',
  '가는',
  '가야',
  '나가',
  '만나',
  '만남',
  '보기',
  '볼',
  '찍',
  '카페',
  '회식',
  '약속',
  '데이트',
  '외출',
];

function normalizeGoalText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function compactGoalText(value: string) {
  return value.replace(/\s/g, '').toLowerCase();
}

function hasKeyword(value: string, keywords: readonly string[]) {
  return keywords.some(keyword => value.includes(keyword));
}

function isLatinKeyboardMash(value: string) {
  return /^(?:asdf|qwer|zxcv|hjkl|fdsa|rewq|vcxz|qwerty|asdfgh|zxcvbn)+$/i.test(value);
}

function getRepeatedCharacterRatio(value: string) {
  const counts = new Map<string, number>();

  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  return Math.max(...counts.values()) / value.length;
}

function isClearlyNoiseGoalText(normalizedText: string) {
  const compactText = compactGoalText(normalizedText);

  if (compactText.length < 2) {
    return true;
  }

  const hangulSyllableCount = compactText.match(/[가-힣]/g)?.length ?? 0;
  const hangulJamoCount = compactText.match(/[ㄱ-ㅎㅏ-ㅣ]/g)?.length ?? 0;
  const latinLetterCount = compactText.match(/[A-Za-z]/g)?.length ?? 0;
  const meaningfulLetterCount = hangulSyllableCount + latinLetterCount;

  if (meaningfulLetterCount === 0) {
    return true;
  }

  if (hangulSyllableCount === 0 && hangulJamoCount / compactText.length > 0.5) {
    return true;
  }

  if (compactText.length >= 4 && getRepeatedCharacterRatio(compactText) >= 0.7) {
    return true;
  }

  if (/^[A-Za-z]+$/.test(compactText)) {
    return isLatinKeyboardMash(compactText) || (compactText.length >= 4 && !/[aeiou]/i.test(compactText));
  }

  return false;
}

function hasContextAnchor(normalizedText: string) {
  const loweredText = normalizedText.toLowerCase();
  const compactText = compactGoalText(normalizedText);

  if (hasKeyword(loweredText, contextAnchorKeywords)) {
    return true;
  }

  return relationWords.some(relation => compactText.includes(relation)) &&
    actionOrPlaceFragments.some(fragment => compactText.includes(fragment));
}

function isGenericDefaultRequest(normalizedText: string) {
  return hasKeyword(normalizedText.toLowerCase(), genericRequestKeywords);
}


function needsMoreDetail(normalizedText: string) {
  const compactText = compactGoalText(normalizedText);

  if (hasContextAnchor(normalizedText)) {
    return false;
  }

  if (vagueExactTerms.has(compactText)) {
    return true;
  }

  if (compactText.length <= 3) {
    return true;
  }

  if (vagueFragments.some(fragment => compactText.includes(fragment.replace(/\s/g, '')))) {
    return true;
  }

  if (relationWords.some(relation => compactText === relation || compactText === `${relation}랑` || compactText === `${relation}이랑`)) {
    return true;
  }

  return false;
}

export function classifyMakeupFeedbackGoalText(value: string): MakeupFeedbackGoalIntentResult {
  const normalizedText = normalizeGoalText(value);

  if (!normalizedText) {
    return {
      intentType: 'generic_default',
      normalizedGoalText: '',
      originalGoalText: '',
    };
  }

  if (isClearlyNoiseGoalText(normalizedText)) {
    return {
      errorMessage: noiseGoalMessage,
      intentType: 'noise',
      normalizedGoalText: '',
      originalGoalText: normalizedText,
    };
  }


  if (hasContextAnchor(normalizedText)) {
    return {
      intentType: 'valid_context',
      normalizedGoalText: normalizedText,
      originalGoalText: normalizedText,
    };
  }

  if (isGenericDefaultRequest(normalizedText)) {
    return {
      intentType: 'generic_default',
      normalizedGoalText: normalizedText,
      originalGoalText: normalizedText,
    };
  }

  if (needsMoreDetail(normalizedText)) {
    return {
      errorMessage: needsDetailGoalMessage,
      intentType: 'needs_detail',
      normalizedGoalText: '',
      originalGoalText: normalizedText,
    };
  }

  return {
    intentType: 'valid_context',
    normalizedGoalText: normalizedText,
    originalGoalText: normalizedText,
  };
}

export function buildMakeupFeedbackGoalContext(
  result: MakeupFeedbackGoalIntentResult,
  profileGender?: string | null,
): MakeupFeedbackContext | null {
  if (
    result.intentType === 'noise' ||
    result.intentType === 'needs_detail'
  ) {
    return null;
  }

  return {
    goalIntentType: result.intentType,
    normalizedGoalText: result.normalizedGoalText,
    originalGoalText: result.originalGoalText,
    profileGender: profileGender ?? null,
    userGoalText: result.normalizedGoalText,
  };
}
