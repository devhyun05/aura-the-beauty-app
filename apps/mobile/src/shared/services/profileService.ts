import type {
  LikedProductPreview,
  MakeupStylePreview,
  ProfileData,
  UserProfile,
} from '../types/profile';
import { getImageAnalysisReports } from './imageAnalysisService';
import { getMakeupStyles as getAllMakeupStyles } from './makeupService';
import { getLikedProductPreviews } from './productService';
import { getUserProfile as getUserProfileFromService } from './userService';

export const getProfileData = async (): Promise<ProfileData> => {
  const [profile, imageAnalysisReports, makeupStyles, likedProducts] =
    await Promise.all([
      getUserProfileFromService(),
      getImageAnalysisReports(),
      getAllMakeupStyles(),
      getLikedProductPreviews(3),
    ]);

  return {
    profile,
    imageAnalysisReports: imageAnalysisReports.slice(0, 3),
    makeupStyles,
    likedProducts,
  };
};

export const getProfileMakeupStyles = async (): Promise<MakeupStylePreview[]> => {
  return getAllMakeupStyles();
};

export const getProfileLikedProducts = async (): Promise<
  LikedProductPreview[]
> => {
  return getLikedProductPreviews(99);
};

export const getUserProfile = async (): Promise<UserProfile> => {
  return getUserProfileFromService();
};
