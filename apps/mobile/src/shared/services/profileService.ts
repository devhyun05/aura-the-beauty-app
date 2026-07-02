import type {
  LikedProductPreview,
  MakeupLookPreview,
  MyPageProfileSummary,
} from '../types/profile';
import { getFaceAnalysisReports } from './faceAnalysisService';
import { getMakeupLooks as getAllMakeupLooks } from './makeupService';
import { getLikedProductPreviews } from './productService';
import {
  getBeautyProfile,
  getUserProfile as getUserProfileFromService,
} from './userService';

export const getMyPageProfileSummary = async (): Promise<MyPageProfileSummary> => {
  const [profile, beautyProfile, faceAnalysisReports, likedProducts] =
    await Promise.all([
      getUserProfileFromService(),
      getBeautyProfile(),
      getFaceAnalysisReports({limit: 3}),
      getLikedProductPreviews(3),
    ]);

  return {
    profile,
    beautyProfile,
    faceAnalysisReport: faceAnalysisReports[0] ?? null,
    faceAnalysisReports,
    makeupLooks: [],
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
