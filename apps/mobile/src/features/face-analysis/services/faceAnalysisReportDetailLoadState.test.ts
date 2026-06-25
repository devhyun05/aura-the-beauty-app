import {
  FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION,
  FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
  resolveFaceAnalysisReportDetailLoadState,
} from './faceAnalysisReportDetailLoadState';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {UserProfile} from '../../../shared/types/profile';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const mockProfile: UserProfile = {
  id: 'user-1',
  name: '서진',
  nickname: 'seo',
  phone: '010-0000-0000',
  email: 'seojin@example.com',
  birthDate: '1996-06-24',
  gender: 'female',
  interest: 'K-beauty',
  avatarSource: 1,
};

async function expectResolvedLoadKeepsNullReport() {
  const state = await resolveFaceAnalysisReportDetailLoadState(() =>
    Promise.resolve({
      report: null,
      profile: mockProfile,
    }),
  );

  expectEqual(state.status, 'success', 'resolved report detail load state');

  if (state.status !== 'success') {
    throw new Error('resolved report detail load should return success state');
  }

  expectEqual(state.report, null, 'resolved report detail null report');
  expectEqual(state.profile.name, mockProfile.name, 'resolved report detail profile');
}

async function expectRejectedLoadShowsErrorState() {
  const state = await resolveFaceAnalysisReportDetailLoadState(() =>
    Promise.reject(new Error('network unavailable')),
  );

  expectEqual(state.status, 'error', 'rejected report detail load state');

  if (state.status !== 'error') {
    throw new Error('rejected report detail load should return error state');
  }

  expectEqual(
    state.message,
    FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
    'report detail load error message',
  );
  expectEqual(
    state.description,
    FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION,
    'report detail load error description',
  );
}

async function expectResolvedLoadKeepsReport() {
  const mockReport = {id: 'analysis-1'} as FaceAnalysisReport;
  const state = await resolveFaceAnalysisReportDetailLoadState(() =>
    Promise.resolve({
      report: mockReport,
      profile: mockProfile,
    }),
  );

  if (state.status !== 'success') {
    throw new Error('resolved report detail report should return success state');
  }

  if (!state.report) {
    throw new Error('resolved report detail report should keep report data');
  }

  expectEqual(state.report.id, mockReport.id, 'resolved report detail report');
}

void expectResolvedLoadKeepsNullReport();
void expectRejectedLoadShowsErrorState();
void expectResolvedLoadKeepsReport();
