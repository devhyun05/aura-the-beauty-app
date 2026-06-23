import { userPageMock } from '../mocks/userPage.mock';
import type {
  FavoriteProductPreview,
  MakeupStylePreview,
  UserPageData,
} from '../types/userPage';
import { getRecentAnalysisResults } from './analysisResultService';

export const getUserPageData = async (): Promise<UserPageData> => {
  const reports = await getRecentAnalysisResults(3);

  return {
    ...userPageMock,
    reports,
  };
};

export const getMakeupStyles = async (): Promise<MakeupStylePreview[]> => {
  return userPageMock.makeupStyles;
};

export const getFavoriteProducts = async (): Promise<
  FavoriteProductPreview[]
> => {
  return userPageMock.favoriteProducts;
};
