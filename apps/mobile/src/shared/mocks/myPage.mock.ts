import { imageAnalysisReportsMock } from './imageAnalysis.mock';
import { makeupLooksMock } from './makeupLooks.mock';
import { productsMock } from './products.mock';
import { userProfileMock } from './user.mock';
import type { MyPageData } from '../types/myPage';

export const myPageMock: MyPageData = {
  profile: userProfileMock,
  reports: imageAnalysisReportsMock.slice(0, 3),
  makeupStyles: makeupLooksMock,
  favoriteProducts: productsMock,
};
