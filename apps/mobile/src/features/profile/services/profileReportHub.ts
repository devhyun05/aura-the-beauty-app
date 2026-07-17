import type {ImageSourcePropType} from 'react-native';

import {fetchMakeupFeedbackReports} from '../../makeup-feedback/services/makeupFeedbackService';
import {fetchGeneratedMakeupRecommendationReports} from '../../makeup-recommendation/services/makeupRecommendationService';
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
  imageSource: ImageSourcePropType;
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
        imageSource: report.imageSource,
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
      fetchGeneratedMakeupRecommendationReports({
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
    makeupRecommendation: recommendation?.results[0]
      ? {
          hasMore: recommendations.length > 1,
          id: recommendation.reportId,
          imageSource: recommendation.results[0].imageSource,
          title: recommendation.scenarioText,
        }
      : null,
    makeupExtraction: extraction
      ? {
          hasMore: extractions.length > 1,
          id: extraction.reportId,
          imageSource: extraction.photo.imageSource,
          title: extraction.data.extractedMakeupLook.title,
        }
      : null,
    makeupFeedback: feedback
      ? {
          hasMore: feedbackReports.length > 1,
          id: feedback.analysisId,
          imageSource: feedback.uploadedImage,
          title: feedback.interpretedGoal.label,
        }
      : null,
  };

  profileReportHubCache = reportHub;
  return reportHub;
}
