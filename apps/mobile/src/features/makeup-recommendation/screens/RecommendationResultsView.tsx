import type {FaceAnalysisRegionVisuals} from '../../face-analysis/services/faceAnalysisMeasurements';
import type {
  MakeupLookRecommendation,
  MakeupRecommendationAnswer,
  MakeupRecommendationImageStatus,
  MakeupRecommendationProfileGender,
  MakeupRecommendationQuestion,
  MakeupRecommendationRefinement,
  MakeupRecommendationSourceReportSummary,
  RecommendedMakeupAreaGuide,
} from '../types';
import {RecommendationResultsFinalScreen} from './RecommendationResultsFinalScreen';

export type RecommendationResultsViewProps = {
  context?: {
    reportLabel?: string;
    situationLabel?: string;
    keywordLabel?: string;
    personalColor?: string;
    profileGender?: MakeupRecommendationProfileGender;
    reportAnalyzedAt?: string;
    reportImageUri?: string;
    reportSummary?: MakeupRecommendationSourceReportSummary;
    reportRegionVisuals?: FaceAnalysisRegionVisuals;
    questions?: readonly MakeupRecommendationQuestion[];
    answers?: readonly MakeupRecommendationAnswer[];
    additionalConstraints?: string;
  };
  onApplyAR: (look: MakeupLookRecommendation) => void;
  onAreaOpened: (area: RecommendedMakeupAreaGuide['area'], look: MakeupLookRecommendation) => void;
  onRefine: (refinement: MakeupRecommendationRefinement) => void;
  onReset: () => void;
  onRetry: () => void;
  onRetryRefinement: () => void;
  refinementError?: string;
  results: readonly MakeupLookRecommendation[];
  imageStatus?: MakeupRecommendationImageStatus;
  imageRetryError?: string;
  isReportSaved: boolean;
  isRefining: boolean;
  onRetryImages: (lookId?: string) => void;
};

/**
 * Production result entry point. The final result is the only user-facing design.
 */
export function RecommendationResultsView(props: RecommendationResultsViewProps) {
  return <RecommendationResultsFinalScreen {...props} />;
}
