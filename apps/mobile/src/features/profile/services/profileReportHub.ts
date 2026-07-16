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

export async function loadProfileReportHub(
  faceAnalysisReports: readonly FaceAnalysisReport[],
): Promise<ProfileReportHubData> {
  const [recommendations, extractions, feedbackReports] = await Promise.all([
    fetchGeneratedMakeupRecommendationReports({limit: 2}).catch(() => []),
    fetchReferenceMakeupExtractionReports({limit: 2}).catch(() => []),
    fetchMakeupFeedbackReports().catch(() => []),
  ]);
  const faceAnalysisReport = faceAnalysisReports[0];
  const recommendation = recommendations[0];
  const extraction = extractions[0];
  const feedback = feedbackReports[0];

  return {
    faceAnalysis: faceAnalysisReport
      ? {
          hasMore: faceAnalysisReports.length > 1,
          id: faceAnalysisReport.id,
          imageSource: faceAnalysisReport.imageSource,
          title: faceAnalysisReport.title,
        }
      : null,
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
}
