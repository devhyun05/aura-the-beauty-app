import {BackendApiError} from '../../../shared/services/backendApi';

export const MAKEUP_RECOMMENDATION_CUSTOM_SITUATION_MAX_LENGTH = 240;

export type MakeupRecommendationCustomSituationIntent =
  | 'empty'
  | 'needs_detail'
  | 'noise'
  | 'personal_info'
  | 'too_long'
  | 'unsupported_request'
  | 'valid_context';

export type MakeupRecommendationCustomSituationValidation = {
  errorMessage?: string;
  intentType: MakeupRecommendationCustomSituationIntent;
  isValid: boolean;
  normalizedText: string;
};

const contextKeywords = [
  '결혼식',
  '공항',
  '놀이공원',
  '북토크',
  '생일',
  '세미나',
  '술집',
  '야구장',
  '야시장',
  '오피스',
  '입학',
  '전시',
  '증명사진',
  '클럽',
  '팝업',
  '피크닉',
  '공연',
  '기념일',
  '데이트',
  '등교',
  '면접',
  '모임',
  '무대',
  '발표',
  '소개팅',
  '수업',
  '중요한 날',
  '약속',
  '여행',
  '연말',
  '예식',
  '외출',
  '운동',
  '일상',
  '출근',
  '축제',
  '카페',
  '콘서트',
  '파티',
  '페스티벌',
  '학교',
  '회사',
  '특별한 날',
  '회식',
  '촬영',
  'cafe',
  'date',
  'interview',
  'office',
  'party',
] as const;

const vagueExactTerms = new Set([
  '그거',
  '그냥',
  '그냥해',
  '글쎄',
  '몰라',
  '모르겠어',
  '모름',
  '뭐',
  '뭐하지',
  '아무거나',
  '알아서',
  '어떻게',
  '어떻게해',
  '이거',
  '저거',
]);

const vagueFragments = ['에베베', '메롱', '몰라', '모르겠', '아무거나', '알아서해'];
const genericEnvironmentOnlyTerms = new Set(['야외', '야외에서', '실내', '실내에서']);
const promptControlPatterns = [
  /ignore\s+(?:all\s+)?previous/i,
  /system\s*prompt/i,
  /developer\s*message/i,
  /이전\s*(?:지시|명령).{0,12}무시/i,
  /시스템\s*프롬프트/i,
  /개발자\s*메시지/i,
  /<\s*\/?\s*(?:script|system|developer)\b/i,
  /```/,
] as const;
const personalInfoPatterns = [
  /(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?![\w.-])/,
  /(?<!\d)(?:\+?82|0)\s*[-.)]?\s*\d{1,3}(?:\s*[-.]?\s*\d){6,10}(?!\d)/,
  /(?<!\d)(?:\d[\s-]?){12,18}\d(?!\d)/,
] as const;
const externalTopics = [
  '가격',
  '날씨',
  '뉴스',
  '링크',
  '맛집',
  '메뉴',
  '숙소',
  '시세',
  '식당',
  '예약',
  '영업시간',
  '주가',
  '코인',
] as const;
const externalRequestTerms = ['검색', '골라줘', '알려줘', '얼마', '예약', '추천해', '찾아줘'] as const;
const makeupContextTerms = [
  '메이크업',
  '화장',
  '립',
  '눈썹',
  '아이',
  '블러셔',
  '치크',
  '베이스',
  '분위기',
  '인상',
  '보이고',
  '보이게',
] as const;

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function compactText(value: string) {
  return value.replace(/\s/g, '').toLowerCase();
}

function includesAny(value: string, terms: readonly string[]) {
  return terms.some(term => value.includes(term));
}

function repeatedCharacterRatio(value: string) {
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  return Math.max(...counts.values()) / value.length;
}

function isClearlyNoise(value: string) {
  const compact = compactText(value);
  if (compact.length < 2) return true;

  const hangulSyllableCount = compact.match(/[가-힣]/g)?.length ?? 0;
  const hangulJamoCount = compact.match(/[ㄱ-ㅎㅏ-ㅣ]/g)?.length ?? 0;
  const latinLetterCount = compact.match(/[A-Za-z]/g)?.length ?? 0;
  if (hangulSyllableCount + latinLetterCount === 0) return true;
  if (hangulSyllableCount === 0 && hangulJamoCount / compact.length > 0.5) return true;
  if (compact.length >= 4 && repeatedCharacterRatio(compact) >= 0.7) return true;
  if (/^[A-Za-z]+$/.test(compact)) {
    return /^(?:asdf|qwer|zxcv|hjkl|fdsa|rewq|vcxz|qwerty|asdfgh|zxcvbn)+$/i.test(compact)
      || (compact.length >= 4 && !/[aeiou]/i.test(compact));
  }
  return false;
}

function hasContext(value: string) {
  const situationText = value.replace(/(?:야외|실내)(?:에서)?/g, ' ');
  const lowered = situationText.toLowerCase();
  const compact = compactText(situationText);
  return includesAny(lowered, contextKeywords)
    || /(?:에서|갈\s*때|가는\s*날|가야\s*해|만나|찍을|찍는\s*날)/.test(situationText)
    || /(?:친구|여친|남친|애인|썸남|썸녀).*(?:만나|약속|카페|외출)/.test(compact);
}

function isUnsupportedRequest(value: string) {
  if (promptControlPatterns.some(pattern => pattern.test(value))) return true;
  const compact = compactText(value);
  if (/(?:진단|처방|치료).*(?:해줘|알려줘|방법|추천)/.test(compact)) return true;
  return includesAny(compact, externalTopics)
    && includesAny(compact, externalRequestTerms)
    && !includesAny(compact, makeupContextTerms);
}

export function validateMakeupRecommendationCustomSituation(
  value: string,
): MakeupRecommendationCustomSituationValidation {
  const normalizedText = normalizeText(value);
  if (!normalizedText) {
    return {intentType: 'empty', isValid: false, normalizedText: ''};
  }
  if (normalizedText.length > MAKEUP_RECOMMENDATION_CUSTOM_SITUATION_MAX_LENGTH) {
    return {
      errorMessage: `상황은 ${MAKEUP_RECOMMENDATION_CUSTOM_SITUATION_MAX_LENGTH}자 이내로 적어주세요.`,
      intentType: 'too_long',
      isValid: false,
      normalizedText: '',
    };
  }
  if (personalInfoPatterns.some(pattern => pattern.test(normalizedText))) {
    return {
      errorMessage: '개인정보는 빼고 언제 또는 어디에서 사용할지 적어주세요.',
      intentType: 'personal_info',
      isValid: false,
      normalizedText: '',
    };
  }
  if (isUnsupportedRequest(normalizedText)) {
    return {
      errorMessage: '메이크업을 사용할 때나 장소를 중심으로 적어주세요.',
      intentType: 'unsupported_request',
      isValid: false,
      normalizedText: '',
    };
  }
  if (isClearlyNoise(normalizedText)) {
    return {
      errorMessage: '의미 있는 상황을 한 문장으로 적어주세요.',
      intentType: 'noise',
      isValid: false,
      normalizedText: '',
    };
  }

  const compact = compactText(normalizedText);
  if (
    vagueExactTerms.has(compact)
    || vagueFragments.some(fragment => compact.includes(fragment))
    || genericEnvironmentOnlyTerms.has(compact)
    || !hasContext(normalizedText)
  ) {
    return {
      errorMessage: '어디에서 또는 언제 사용할 메이크업인지 조금만 더 적어주세요.',
      intentType: 'needs_detail',
      isValid: false,
      normalizedText: '',
    };
  }

  return {
    intentType: 'valid_context',
    isValid: true,
    normalizedText,
  };
}

export function getMakeupRecommendationCustomSituationServerError(error: unknown): string | null {
  if (!(error instanceof BackendApiError)) return null;
  if (error.status !== 400 && error.status !== 422) return null;
  if (!error.code?.startsWith('MAKEUP_CUSTOM_SITUATION_')) return null;
  return {
    MAKEUP_CUSTOM_SITUATION_EMPTY: '언제 또는 어디에서 사용할 메이크업인지 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_INVALID: '입력한 상황을 확인하고 다시 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_NEEDS_DETAIL: '어디에서 또는 언제 사용할 메이크업인지 조금만 더 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_PII: '연락처나 개인정보는 빼고 메이크업 상황만 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_MEDICAL: '의료 상담 대신 메이크업 상황과 원하는 분위기만 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_UNSAFE: '메이크업 상황과 원하는 분위기만 안전하게 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_OUT_OF_SCOPE: '메이크업이 필요한 상황을 중심으로 다시 적어주세요.',
  }[error.code] ?? '입력한 상황을 확인하고 다시 적어주세요.';
}
