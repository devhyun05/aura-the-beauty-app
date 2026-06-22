import { userPageMock } from '../mocks/userPage.mock';
import type { UserPageData } from '../types/userPage';
import { getRecentAnalysisResults } from './analysisResultService';

export const getUserPageData = async (): Promise<UserPageData> => {
  const reports = await getRecentAnalysisResults(3);

  return {
    ...userPageMock,
    reports,
  };
};
