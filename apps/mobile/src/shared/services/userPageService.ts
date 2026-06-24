import type {
  FavoriteProductPreview,
  MakeupStylePreview,
  UserPageData,
  UserProfile,
} from '../types/userPage';
import { getAnalysisResults } from './analysisService';
import { getMakeupLooks } from './makeupService';
import { getLikedProductPreview } from './productService';
import { getUserProfile as getUserProfileFromService } from './userService';

export const getUserPageData = async (): Promise<UserPageData> => {
  const [profile, analysisResults, makeupStyles, favoriteProducts] =
    await Promise.all([
      getUserProfileFromService(),
      getAnalysisResults(),
      getMakeupLooks(),
      getLikedProductPreview(3),
    ]);

  return {
    profile,
    reports: analysisResults.slice(0, 3),
    makeupStyles,
    favoriteProducts,
  };
};

export const getMakeupStyles = async (): Promise<MakeupStylePreview[]> => {
  return getMakeupLooks();
};

export const getFavoriteProducts = async (): Promise<
  FavoriteProductPreview[]
> => {
  return getLikedProductPreview(99);
};

export const getUserProfile = async (): Promise<UserProfile> => {
  return getUserProfileFromService();
};
