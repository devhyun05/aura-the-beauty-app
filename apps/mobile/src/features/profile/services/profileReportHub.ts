import {fetchMakeupFeedbackReports} from '../../makeup-feedback/services/makeupFeedbackService';
import {fetchMakeupRecommendationReportSummaries} from '../../makeup-recommendation/services/makeupRecommendationService';
import {fetchReferenceMakeupExtractionReports} from '../../reference-makeup-extraction/services/makeupExtractionService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';

export type ProfileReportKind =
  | 'faceAnalysis'
  | 'makeupRecommendation'
  | 'makeupExtraction'
  | 'makeupFeedback';

export type ProfileReportPreview = {
  hasMore: boolean;
  id: string;
  title: string;
};

export type ProfileReportHubData = Record<
  ProfileReportKind,
  ProfileReportPreview | null
>;

export const EMPTY_PROFILE_REPORT_HUB: ProfileReportHubData = {
  faceAnalysis: null,
  makeupRecommendation: null,
  makeupExtraction: null,
  makeupFeedback: null,
};

const PROFILE_REPORT_REQUEST_TIMEOUT_MS = 5000;
let profileReportHubCache: ProfileReportHubData | null = null;

function mapFaceAnalysisPreview(
  faceAnalysisReports: readonly FaceAnalysisReport[],
): ProfileReportPreview | null {
  const report = faceAnalysisReports[0];

  return report
    ? {
        hasMore: faceAnalysisReports.length > 1,
        id: report.id,
        title: report.title,
      }
    : null;
}

export function getProfileReportHubSnapshot(
  faceAnalysisReports: readonly FaceAnalysisReport[],
): ProfileReportHubData {
  return {
    ...(profileReportHubCache ?? EMPTY_PROFILE_REPORT_HUB),
    faceAnalysis:
      mapFaceAnalysisPreview(faceAnalysisReports) ??
      profileReportHubCache?.faceAnalysis ??
      null,
  };
}

export async function loadProfileReportHub(
  faceAnalysisReportsInput:
    | readonly FaceAnalysisReport[]
    | Promise<readonly FaceAnalysisReport[]>,
): Promise<ProfileReportHubData> {
  const [faceAnalysisReports, recommendations, extractions, feedbackReports] =
    await Promise.all([
      Promise.resolve(faceAnalysisReportsInput),
      fetchMakeupRecommendationReportSummaries({
        limit: 2,
        timeoutMs: PROFILE_REPORT_REQUEST_TIMEOUT_MS,
      }).catch(() => []),
      fetchReferenceMakeupExtractionReports({
        limit: 2,
        timeoutMs: PROFILE_REPORT_REQUEST_TIMEOUT_MS,
      }).catch(() => []),
      fetchMakeupFeedbackReports({
        timeoutMs: PROFILE_REPORT_REQUEST_TIMEOUT_MS,
      }).catch(() => []),
    ]);
  const recommendation = recommendations[0];
  const extraction = extractions[0];
  const feedback = feedbackReports[0];

  const reportHub: ProfileReportHubData = {
    faceAnalysis: mapFaceAnalysisPreview(faceAnalysisReports),
    makeupRecommendation: recommendation
      ? {
          hasMore: recommendations.length > 1,
          id: recommendation.reportId,
          title: recommendation.scenarioText,
        }
      : null,
    makeupExtraction: extraction
      ? {
          hasMore: extractions.length > 1,
          id: extraction.reportId,
          title: extraction.data.extractedMakeupLook.title,
        }
      : null,
    makeupFeedback: feedback
      ? {
          hasMore: feedbackReports.length > 1,
          id: feedback.analysisId,
          title: feedback.interpretedGoal.label,
        }
      : null,
  };

  profileReportHubCache = reportHub;
  return reportHub;
}
