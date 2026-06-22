import { analysisResultsMock } from '../mocks/analysisResults.mock';
import type { AnalysisResult } from '../types/analysis';

export const getAnalysisResults = async (): Promise<AnalysisResult[]> => {
  return Promise.resolve(analysisResultsMock);
};

export const getRecentAnalysisResults = async (
  limit = 3,
): Promise<AnalysisResult[]> => {
  return Promise.resolve(analysisResultsMock.slice(0, limit));
};
