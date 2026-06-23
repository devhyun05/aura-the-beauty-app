import type {
  FavoriteProductPreview,
  MakeupStylePreview,
  UserPageData,
  UserProfile,
} from '../types/userPage';
import { getRecentAnalysisResults } from './analysisResultService';
import { getMakeupLooks } from './makeupService';
import { getLikedProductPreview } from './productService';
import { getUserProfile as getUserProfileFromService } from './userService';

export const getUserPageData = async (): Promise<UserPageData> => {
  const [profile, reports, makeupStyles, favoriteProducts] = await Promise.all([
    getUserProfileFromService(),
    getRecentAnalysisResults(3),
    getMakeupLooks(),
    getLikedProductPreview(3),
  ]);

  return {
    profile,
    reports,
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
