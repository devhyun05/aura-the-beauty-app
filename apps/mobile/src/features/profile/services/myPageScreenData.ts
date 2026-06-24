import {getLatestImageAnalysisReport} from '../../../shared/services/imageAnalysisService';
import {getMakeupLookPreview} from '../../../shared/services/makeupService';
import {getLikedProductPreview} from '../../../shared/services/productService';
import {getUserProfile} from '../../../shared/services/userService';
import type {MyPageScreenData} from './myPageLoadState';

export const loadMyPageScreenData = async (): Promise<MyPageScreenData> => {
  const [profile, imageAnalysisReport, makeupLooks, products] =
    await Promise.all([
      getUserProfile(),
      getLatestImageAnalysisReport(),
      getMakeupLookPreview(3),
      getLikedProductPreview(3),
    ]);

  return {
    profile,
    imageAnalysisReport,
    makeupLooks,
    products,
  };
};
