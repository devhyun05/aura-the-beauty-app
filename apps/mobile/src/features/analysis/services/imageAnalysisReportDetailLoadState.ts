import type {ImageAnalysisReport} from '../../../shared/types/imageAnalysis';
import type {UserProfile} from '../../../shared/types/myPage';

export const IMAGE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE =
  '이미지 분석 결과를 불러오지 못했어요' as const;
export const IMAGE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION =
  '네트워크 상태를 확인한 뒤 다시 시도해 주세요.' as const;

export type ImageAnalysisReportDetailData = {
  report: ImageAnalysisReport | null;
  profile: UserProfile;
};

export type ImageAnalysisReportDetailLoadState =
  | {status: 'loading'}
  | {status: 'success'; report: ImageAnalysisReport | null; profile: UserProfile}
  | {
      status: 'error';
      message: typeof IMAGE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE;
      description: typeof IMAGE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION;
    };

type ImageAnalysisReportDetailDataLoader =
  () => Promise<ImageAnalysisReportDetailData>;

export const resolveImageAnalysisReportDetailLoadState = (
  loadData: ImageAnalysisReportDetailDataLoader,
): Promise<ImageAnalysisReportDetailLoadState> =>
  loadData()
    .then(
      ({profile, report}): ImageAnalysisReportDetailLoadState => ({
        status: 'success',
        profile,
        report,
      }),
    )
    .catch(
      (): ImageAnalysisReportDetailLoadState => ({
        status: 'error',
        message: IMAGE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
        description: IMAGE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION,
      }),
    );
