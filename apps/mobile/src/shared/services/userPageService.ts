import { userPageMock } from '../mocks/userPage.mock';
import type { FavoriteProductPreview, UserPageData } from '../types/userPage';
import { getRecentAnalysisResults } from './analysisResultService';

export const getUserPageData = async (): Promise<UserPageData> => {
  const reports = await getRecentAnalysisResults(3);

  return {
    ...userPageMock,
    reports,
  };
};

export const getFavoriteProducts = async (): Promise<
  FavoriteProductPreview[]
> => {
  return userPageMock.favoriteProducts;
};
