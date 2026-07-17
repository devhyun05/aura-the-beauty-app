import {
  getMyPageProfileSnapshot,
  getMyPageProfileSummary,
} from '../../../shared/services/profileService';
import type {ProfileScreenData} from './profileLoadState';
import {
  getProfileReportHubSnapshot,
  loadProfileReportHub,
} from './profileReportHub';

let profileScreenDataRequest: Promise<ProfileScreenData> | null = null;

export async function loadProfileScreenSnapshot(): Promise<ProfileScreenData> {
  const summary = await getMyPageProfileSnapshot();

  return {
    ...summary,
    reportHub: getProfileReportHubSnapshot(summary.faceAnalysisReports),
  };
}

async function requestProfileScreenData(): Promise<ProfileScreenData> {
  const summaryRequest = getMyPageProfileSummary();
  const reportHubRequest = loadProfileReportHub(
    summaryRequest.then(summary => summary.faceAnalysisReports),
  );
  const [summary, reportHub] = await Promise.all([
    summaryRequest,
    reportHubRequest,
  ]);

  return {...summary, reportHub};
}

export const loadProfileScreenData = (): Promise<ProfileScreenData> => {
  if (profileScreenDataRequest) {
    return profileScreenDataRequest;
  }

  profileScreenDataRequest = requestProfileScreenData().finally(() => {
    profileScreenDataRequest = null;
  });

  return profileScreenDataRequest;
};
