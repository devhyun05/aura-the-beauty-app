import { analysisResultsMock } from '../mocks/analysisResults.mock';
import type { AnalysisResult, AnalysisSubjectType } from '../types/analysis';

export const getAnalysisResults = async (): Promise<AnalysisResult[]> => {
  return Promise.resolve(analysisResultsMock);
};

export const getRecentAnalysisResults = async (
  limit = 3,
): Promise<AnalysisResult[]> => {
  return Promise.resolve(analysisResultsMock.slice(0, limit));
};

export const getAnalysisResultsBySubject = async (
  subjectType: AnalysisSubjectType,
): Promise<AnalysisResult[]> => {
  return Promise.resolve(
    analysisResultsMock.filter((result) => result.subjectType === subjectType),
  );
};
