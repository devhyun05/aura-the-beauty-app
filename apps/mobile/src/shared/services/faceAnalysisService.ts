import { faceAnalysisReportsMock } from '../mocks/faceAnalysis.mock';
import type { FaceAnalysisReport } from '../types/faceAnalysis';

export const getFaceAnalysisReports = async (): Promise<FaceAnalysisReport[]> => {
  return Promise.resolve(faceAnalysisReportsMock);
};

export const getLatestFaceAnalysisReport =
  async (): Promise<FaceAnalysisReport | null> => {
    return Promise.resolve(faceAnalysisReportsMock[0] ?? null);
  };

export const getFaceAnalysisReportById = async (
  reportId: string,
): Promise<FaceAnalysisReport | null> => {
  const report = faceAnalysisReportsMock.find((item) => item.id === reportId);

  return Promise.resolve(report ?? null);
};
