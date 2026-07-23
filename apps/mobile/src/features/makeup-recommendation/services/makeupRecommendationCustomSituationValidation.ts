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
  '카페',
  'cafe',
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
      errorMessage: '개인정보는 빼고 원하는 메이크업 상황이나 분위기만 적어주세요.',
      intentType: 'personal_info',
      isValid: false,
      normalizedText: '',
    };
  }
  if (isUnsupportedRequest(normalizedText)) {
    return {
      errorMessage: '메이크업 상황, 역할 또는 원하는 분위기를 중심으로 적어주세요.',
      intentType: 'unsupported_request',
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
    MAKEUP_CUSTOM_SITUATION_EMPTY: '원하는 메이크업 상황이나 분위기를 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_INVALID: '입력한 상황을 확인하고 다시 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_NEEDS_DETAIL: '원하는 메이크업 맥락을 조금만 더 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_PII: '연락처나 개인정보는 빼고 원하는 메이크업 상황이나 분위기만 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_MEDICAL: '의료 상담 대신 메이크업 상황과 원하는 분위기만 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_UNSAFE: '메이크업 상황과 원하는 분위기만 안전하게 적어주세요.',
    MAKEUP_CUSTOM_SITUATION_OUT_OF_SCOPE: '메이크업 상황, 역할 또는 원하는 분위기를 중심으로 다시 적어주세요.',
  }[error.code] ?? '입력한 상황을 확인하고 다시 적어주세요.';
}
