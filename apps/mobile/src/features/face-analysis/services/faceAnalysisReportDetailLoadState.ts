import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {UserProfile} from '../../../shared/types/profile';

export const FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE =
  '얼굴 분석 결과를 불러오지 못했어요' as const;
export const FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION =
  '네트워크 상태를 확인한 뒤 다시 시도해 주세요.' as const;

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
      description: typeof FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION;
    };

type FaceAnalysisReportDetailDataLoader =
  () => Promise<FaceAnalysisReportDetailData>;

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
      (): FaceAnalysisReportDetailLoadState => ({
        status: 'error',
        message: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
        description: FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION,
      }),
    );
