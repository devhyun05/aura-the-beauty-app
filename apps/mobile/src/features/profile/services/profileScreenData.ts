import {getLatestImageAnalysisReport} from '../../../shared/services/imageAnalysisService';
import {getMakeupLookPreviews} from '../../../shared/services/makeupService';
import {getLikedProductPreviews} from '../../../shared/services/productService';
import {getUserProfile} from '../../../shared/services/userService';
import type {ProfileScreenData} from './profileLoadState';

export const loadProfileScreenData = async (): Promise<ProfileScreenData> => {
  const [profile, imageAnalysisReport, makeupLooks, likedProducts] =
    await Promise.all([
      getUserProfile(),
      getLatestImageAnalysisReport(),
      getMakeupLookPreviews(3),
      getLikedProductPreviews(3),
    ]);

  return {
    profile,
    imageAnalysisReport,
    makeupLooks,
    likedProducts,
  };
};
