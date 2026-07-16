import {getMyPageProfileSummary} from '../../../shared/services/profileService';
import type {ProfileScreenData} from './profileLoadState';
import {loadProfileReportHub} from './profileReportHub';

export const loadProfileScreenData = async (): Promise<ProfileScreenData> => {
  const summary = await getMyPageProfileSummary();
  const reportHub = await loadProfileReportHub(summary.faceAnalysisReports);

  return {...summary, reportHub};
};
