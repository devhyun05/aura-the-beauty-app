import { analysisMock } from '../mocks/analysis.mock';
import type { AnalysisResult } from '../types/analysis';

export const getAnalysisResults = async (): Promise<AnalysisResult[]> => {
  return Promise.resolve(analysisMock);
};

export const getLatestAnalysisResult =
  async (): Promise<AnalysisResult | null> => {
    return Promise.resolve(analysisMock[0] ?? null);
  };

export const getAnalysisResultById = async (
  resultId: string,
): Promise<AnalysisResult | null> => {
  const result = analysisMock.find((item) => item.id === resultId);

  return Promise.resolve(result ?? null);
};
