import type { AnalysisResult } from '../types/analysis';
import {
  getAnalysisResultById as getAnalysisResultByIdFromService,
  getAnalysisResults as getAnalysisResultsFromService,
} from './analysisService';

export const getAnalysisResults = async (): Promise<AnalysisResult[]> => {
  return getAnalysisResultsFromService();
};

export const getRecentAnalysisResults = async (
  limit = 3,
): Promise<AnalysisResult[]> => {
  const results = await getAnalysisResultsFromService();

  return results.slice(0, limit);
};

export const getAnalysisResultById = async (
  resultId: string,
): Promise<AnalysisResult | null> => {
  return getAnalysisResultByIdFromService(resultId);
};
