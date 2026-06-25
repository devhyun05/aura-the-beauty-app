import type {
  LikedProductPreview,
  MakeupLookPreview,
  MyPageProfileSummary,
} from '../types/profile';
import { getLatestFaceAnalysisReport } from './faceAnalysisService';
import { getMakeupLooks as getAllMakeupLooks } from './makeupService';
import { getLikedProductPreviews } from './productService';
import {
  getBeautyProfile,
  getUserProfile as getUserProfileFromService,
} from './userService';

export const getMyPageProfileSummary = async (): Promise<MyPageProfileSummary> => {
  const [profile, beautyProfile, faceAnalysisReport, makeupLooks, likedProducts] =
    await Promise.all([
      getUserProfileFromService(),
      getBeautyProfile(),
      getLatestFaceAnalysisReport(),
      getAllMakeupLooks(),
      getLikedProductPreviews(3),
    ]);

  return {
    profile,
    beautyProfile,
    faceAnalysisReport,
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
