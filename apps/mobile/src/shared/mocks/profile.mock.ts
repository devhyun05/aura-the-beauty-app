import { faceAnalysisReportsMock } from './faceAnalysis.mock';
import { productsMock } from './products.mock';
import { beautyProfileMock, userProfileMock } from './user.mock';
import type {MyPageProfileSummary} from '../types/profile';

export const myPageProfileSummaryMock: MyPageProfileSummary = {
  profile: userProfileMock,
  beautyProfile: beautyProfileMock,
  faceAnalysisReport: faceAnalysisReportsMock[0] ?? null,
  makeupLooks: [],
  likedProducts: productsMock,
};
