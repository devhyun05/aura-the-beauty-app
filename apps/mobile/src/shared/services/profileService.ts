import type {
  LikedProductPreview,
  MakeupLookPreview,
  ProfileData,
  UserProfile,
} from '../types/profile';
import { getFaceAnalysisReports } from './faceAnalysisService';
import { getMakeupLooks as getAllMakeupLooks } from './makeupService';
import { getLikedProductPreviews } from './productService';
import { getUserProfile as getUserProfileFromService } from './userService';

export const getProfileData = async (): Promise<ProfileData> => {
  const [profile, faceAnalysisReports, makeupLooks, likedProducts] =
    await Promise.all([
      getUserProfileFromService(),
      getFaceAnalysisReports(),
      getAllMakeupLooks(),
      getLikedProductPreviews(3),
    ]);

  return {
    profile,
    faceAnalysisReports: faceAnalysisReports.slice(0, 3),
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
