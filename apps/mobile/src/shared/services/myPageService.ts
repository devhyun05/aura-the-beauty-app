import type {
  FavoriteProductPreview,
  MakeupStylePreview,
  MyPageData,
  UserProfile,
} from '../types/myPage';
import { getImageAnalysisReports } from './imageAnalysisService';
import { getMakeupLooks } from './makeupService';
import { getLikedProductPreview } from './productService';
import { getUserProfile as getUserProfileFromService } from './userService';

export const getMyPageData = async (): Promise<MyPageData> => {
  const [profile, imageAnalysisReports, makeupStyles, favoriteProducts] =
    await Promise.all([
      getUserProfileFromService(),
      getImageAnalysisReports(),
      getMakeupLooks(),
      getLikedProductPreview(3),
    ]);

  return {
    profile,
    reports: imageAnalysisReports.slice(0, 3),
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
