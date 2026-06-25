import { faceAnalysisReportsMock } from './faceAnalysis.mock';
import { makeupLooksMock } from './makeupLooks.mock';
import { productsMock } from './products.mock';
import { userProfileMock } from './user.mock';
import type {ProfileData} from '../types/profile';

export const profileMock: ProfileData = {
  profile: userProfileMock,
  faceAnalysisReports: faceAnalysisReportsMock.slice(0, 3),
  makeupLooks: makeupLooksMock,
  likedProducts: productsMock,
};
