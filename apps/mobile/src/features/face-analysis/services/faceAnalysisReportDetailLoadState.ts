import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {UserProfile} from '../../../shared/types/profile';
import {BackendApiError, isBackendNetworkError} from '../../../shared/services/backendApi';

export const FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE =
  '얼굴 분석 결과를 불러오지 못했어요' as const;
export const FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION =
  '잠시 후 다시 시도해 주세요.' as const;
export const FACE_ANALYSIS_REPORT_DETAIL_NETWORK_ERROR_DESCRIPTION =
  '네트워크 연결을 확인한 뒤 다시 시도해 주세요.' as const;
export const FACE_ANALYSIS_REPORT_DETAIL_SERVER_ERROR_DESCRIPTION =
  '서버에서 분석 결과를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.' as const;
export const FACE_ANALYSIS_REPORT_DETAIL_NOT_FOUND_ERROR_DESCRIPTION =
  '분석 결과를 찾지 못했어요. 목록에서 다시 선택해 주세요.' as const;

export type FaceAnalysisReportDetailData = {
  report: FaceAnalysisReport | null;
  profile: UserProfile;
};

export type FaceAnalysisReportDetailLoadState =
  | {status: 'loading'}
  | {status: 'success'; report: FaceAnalysisReport | null; profile: UserProfile}
  | {
      status: 'error';
      message: typeof FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE;
      description: string;
    };

type FaceAnalysisReportDetailDataLoader =
  () => Promise<FaceAnalysisReportDetailData>;

function resolveLoadErrorDescription(error: unknown): string {
  if (isBackendNetworkError(error)) {
    return FACE_ANALYSIS_REPORT_DETAIL_NETWORK_ERROR_DESCRIPTION;
  }

  if (error instanceof BackendApiError) {
    if (error.status === 404) {
      return FACE_ANALYSIS_REPORT_DETAIL_NOT_FOUND_ERROR_DESCRIPTION;
    }
    if (error.status >= 500) {
      return FACE_ANALYSIS_REPORT_DETAIL_SERVER_ERROR_DESCRIPTION;
    }
  }

  return FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION;
}

export const resolveFaceAnalysisReportDetailLoadState = (
  loadData: FaceAnalysisReportDetailDataLoader,
): Promise<FaceAnalysisReportDetailLoadState> =>
  loadData()
    .then(
      ({profile, report}): FaceAnalysisReportDetailLoadState => ({
        status: 'success',
        profile,
        report,
      }),
    )
    .catch(
      (error): FaceAnalysisReportDetailLoadState => {
        console.info('[aura:analysis] report-detail:load-failed', {
          code: error instanceof BackendApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : typeof error,
          status: error instanceof BackendApiError ? error.status : undefined,
        });

        return {
          status: 'error',
          message: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
          description: resolveLoadErrorDescription(error),
        };
      },
    );
