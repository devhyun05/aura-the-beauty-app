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
export const FACE_ANALYSIS_REPORT_UNAVAILABLE_MESSAGE =
  '얼굴 분석을 완료하지 못했어요' as const;
export const FACE_ANALYSIS_REPORT_UNAVAILABLE_DESCRIPTION =
  '사진에서 얼굴을 충분히 분석하지 못했어요. 다시 촬영해 주세요.' as const;

export type FaceAnalysisReportDetailData = {
  report: FaceAnalysisReport | null;
  profile: UserProfile;
};

export type FaceAnalysisReportDetailLoadState =
  | {status: 'loading'}
  | {status: 'success'; report: FaceAnalysisReport | null; profile: UserProfile}
  | {
      status: 'error';
      message: string;
      description: string;
      canRetake: boolean;
    };

type FaceAnalysisReportDetailDataLoader =
  () => Promise<FaceAnalysisReportDetailData>;

const ANALYSIS_UNAVAILABLE_ERROR_CODES = new Set([
  'FACE_ANALYSIS_AI_INCOMPLETE',
  'FACE_ANALYSIS_RESULT_INCOMPLETE',
  'ANALYSIS_JOB_FAILED',
  'ANALYSIS_REPORT_TEXT_REQUIRED',
  'ANALYSIS_REPORT_TIMEOUT',
]);

function resolveLoadError(error: unknown): {
  message: string;
  description: string;
  canRetake: boolean;
} {
  if (
    error instanceof BackendApiError &&
    error.code &&
    ANALYSIS_UNAVAILABLE_ERROR_CODES.has(error.code)
  ) {
    return {
      message: FACE_ANALYSIS_REPORT_UNAVAILABLE_MESSAGE,
      description: FACE_ANALYSIS_REPORT_UNAVAILABLE_DESCRIPTION,
      canRetake: true,
    };
  }

  if (isBackendNetworkError(error)) {
    return {
      message: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
      description: FACE_ANALYSIS_REPORT_DETAIL_NETWORK_ERROR_DESCRIPTION,
      canRetake: false,
    };
  }

  if (error instanceof BackendApiError) {
    if (error.status === 404) {
      return {
        message: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
        description: FACE_ANALYSIS_REPORT_DETAIL_NOT_FOUND_ERROR_DESCRIPTION,
        canRetake: false,
      };
    }
    if (error.status >= 500) {
      return {
        message: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
        description: FACE_ANALYSIS_REPORT_DETAIL_SERVER_ERROR_DESCRIPTION,
        canRetake: false,
      };
    }
  }

  return {
    message: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
    description: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION,
    canRetake: false,
  };
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

        const resolvedError = resolveLoadError(error);
        return {
          status: 'error',
          ...resolvedError,
        };
      },
    );
