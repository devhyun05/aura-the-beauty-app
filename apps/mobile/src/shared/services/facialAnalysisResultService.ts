import {mockFacialAnalysisResult} from '../mocks/facialAnalysisResult.mock';
import type {FacialAnalysisResult, MakeupDirection} from '../types/facialAnalysisResult';

export function getMockFacialAnalysisResult(): FacialAnalysisResult {
  return mockFacialAnalysisResult;
}

export function getPrimaryMakeupDirection(
  result: FacialAnalysisResult = mockFacialAnalysisResult,
): MakeupDirection {
  return result.makeupDirections[0];
}
