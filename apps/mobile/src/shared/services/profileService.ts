import type {
  LikedProductPreview,
  MakeupLookPreview,
  ProfileData,
  UserProfile,
} from '../types/profile';
import { getImageAnalysisReports } from './imageAnalysisService';
import { getMakeupLooks as getAllMakeupLooks } from './makeupService';
import { getLikedProductPreviews } from './productService';
import { getUserProfile as getUserProfileFromService } from './userService';

export const getProfileData = async (): Promise<ProfileData> => {
  const [profile, imageAnalysisReports, makeupLooks, likedProducts] =
    await Promise.all([
      getUserProfileFromService(),
      getImageAnalysisReports(),
      getAllMakeupLooks(),
      getLikedProductPreviews(3),
    ]);

  return {
    profile,
    imageAnalysisReports: imageAnalysisReports.slice(0, 3),
    makeupLooks,
    likedProducts,
  };
};

export const getProfileMakeupLooks = async (): Promise<MakeupLookPreview[]> => {
  return getAllMakeupLooks();
};

export const getProfileLikedProducts = async (): Promise<
  LikedProductPreview[]
> => {
  return getLikedProductPreviews(99);
};

export const getUserProfile = async (): Promise<UserProfile> => {
  return getUserProfileFromService();
};
