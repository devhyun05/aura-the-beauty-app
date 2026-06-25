import {getLatestFaceAnalysisReport} from '../../../shared/services/faceAnalysisService';
import {getMakeupLookPreviews} from '../../../shared/services/makeupService';
import {getLikedProductPreviews} from '../../../shared/services/productService';
import {getUserProfile} from '../../../shared/services/userService';
import type {ProfileScreenData} from './profileLoadState';

export const loadProfileScreenData = async (): Promise<ProfileScreenData> => {
  const [profile, faceAnalysisReport, makeupLooks, likedProducts] =
    await Promise.all([
      getUserProfile(),
      getLatestFaceAnalysisReport(),
      getMakeupLookPreviews(3),
      getLikedProductPreviews(3),
    ]);

  return {
    profile,
    faceAnalysisReport,
    makeupLooks,
    likedProducts,
  };
};
