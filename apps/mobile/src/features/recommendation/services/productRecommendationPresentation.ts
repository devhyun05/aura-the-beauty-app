import type {PersonalizedRecommendationData} from '../types';

function withRecommendationSuffix(value: string): string {
  const title = value.trim().replace(/\s*추천제품$/, '');
  return `${title || '회원님만을 위한'} 추천제품`;
}

export function recommendationNickname(data?: PersonalizedRecommendationData): string {
  return data?.title?.match(/^(.+?)님/)?.[1]?.trim() || '회원';
}

export function personalizedRecommendationTitle(
  data?: PersonalizedRecommendationData,
  fallbackTitle = '회원님만을 위한 추천제품',
): string {
  const isGenericFallback = data?.fallback?.type === 'popular'
    && Boolean(data.personalizationStatus);
  if (isGenericFallback) return '지금 많이 저장한 추천제품';
  if (data?.title?.trim()) return withRecommendationSuffix(data.title);
  return fallbackTitle;
}

export function cohortRecommendationTitle(
  data?: PersonalizedRecommendationData,
  nickname = '회원',
  fallbackTitle?: string,
): string {
  if (data?.cohortSizeBand) return `${nickname}님과 비슷한 분들이 많이 좋아해요`;
  if (data?.fallback?.type === 'reportTone') return `${nickname}님의 퍼스널컬러 추천제품`;
  if (data?.fallback?.type === 'popular' && data.cohortStatus) {
    return '지금 많이 저장한 추천제품';
  }
  return fallbackTitle?.trim() || `${nickname}님과 비슷한 분들이 많이 좋아해요`;
}
