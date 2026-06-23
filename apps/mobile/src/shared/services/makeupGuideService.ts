import {mockRecommendationResult} from '../mocks/makeupGuide.mock';
import type {MakeupLook, RecommendationResult} from '../types/makeupGuide';

export function getMockRecommendationResult(): RecommendationResult {
  return mockRecommendationResult;
}

export function getPrimaryRecommendedLook(
  result: RecommendationResult = mockRecommendationResult,
): MakeupLook {
  return result.recommendedLooks[0];
}
