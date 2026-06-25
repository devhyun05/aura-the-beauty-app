import { imageAnalysisReportsMock } from './imageAnalysis.mock';
import { makeupStylesMock } from './makeupStyles.mock';
import { productsMock } from './products.mock';
import { userProfileMock } from './user.mock';
import type {ProfileData} from '../types/profile';

export const profileMock: ProfileData = {
  profile: userProfileMock,
  imageAnalysisReports: imageAnalysisReportsMock.slice(0, 3),
  makeupStyles: makeupStylesMock,
  likedProducts: productsMock,
};
