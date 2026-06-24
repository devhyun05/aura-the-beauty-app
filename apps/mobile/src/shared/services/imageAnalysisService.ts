import { imageAnalysisReportsMock } from '../mocks/imageAnalysis.mock';
import type { ImageAnalysisReport } from '../types/imageAnalysis';

export const getImageAnalysisReports = async (): Promise<ImageAnalysisReport[]> => {
  return Promise.resolve(imageAnalysisReportsMock);
};

export const getLatestImageAnalysisReport =
  async (): Promise<ImageAnalysisReport | null> => {
    return Promise.resolve(imageAnalysisReportsMock[0] ?? null);
  };

export const getImageAnalysisReportById = async (
  reportId: string,
): Promise<ImageAnalysisReport | null> => {
  const report = imageAnalysisReportsMock.find((item) => item.id === reportId);

  return Promise.resolve(report ?? null);
};
