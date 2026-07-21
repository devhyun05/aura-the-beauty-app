import type {ImageSourcePropType} from 'react-native';

import type {FaceCaptureCameraMetadata} from '../face-capture/services/faceCaptureUploadService';

export type MakeupFeedbackPhotoSource = 'camera' | 'gallery';

export type MakeupFeedbackGoalIntentType = 'generic_default' | 'valid_context';

export type MakeupFeedbackContext = {
  goalIntentType?: MakeupFeedbackGoalIntentType;
  normalizedGoalText?: string;
  originalGoalText?: string;
  profileGender?: string | null;
  userGoalText: string;
};

export type MakeupFeedbackKind = 'initial' | 'correction';
export type MakeupFeedbackFlowOrigin = 'general' | 'journeyDay';

export type MakeupFeedbackPhotoSelection = {
  photoSource: MakeupFeedbackPhotoSource;
  cameraMetadata?: FaceCaptureCameraMetadata | null;
  contentType?: string | null;
  fileName?: string | null;
  imageUri?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  photoTitle?: string;
  feedbackContext?: MakeupFeedbackContext;
  entryDate?: string;
  feedbackKind?: MakeupFeedbackKind;
  parentFeedbackReportId?: string | null;
};

export type MakeupFeedbackSummaryBadge = {
  id: string;
  label: string;
};

export type MakeupFeedbackAnnotation = {
  id: string;
  label: string;
  top: number;
  left: number;
  lineWidth: number;
  lineTop: number;
  lineLeft: number;
  rotate: string;
};

export type MakeupFeedbackCorrectionPointKind = 'eye' | 'cheek' | 'lip';

export type MakeupFeedbackAnalysisSource =
  | 'ai'
  | 'server'
  | 'server_fallback'
  | 'mock';

export type MakeupFeedbackTopicId =
  | 'brow'
  | 'lash'
  | 'lens'
  | 'eyeliner'
  | 'eyeshadow'
  | 'aegyosal'
  | 'foundation'
  | 'blush'
  | 'highlight'
  | 'shading'
  | 'lip';

export type MakeupFeedbackAnalysisDecision = 'completed' | 'retake_required';
export type MakeupFeedbackConfidenceLevel = 'low' | 'medium' | 'high';
export type MakeupFeedbackEvaluationStatus =
  | 'strength'
  | 'improvement'
  | 'optional'
  | 'not_assessable'
  | 'not_applicable';
export type MakeupFeedbackVisibility = 'clear' | 'partial' | 'not_visible';
export type MakeupFeedbackScoreImpact = 'high' | 'medium' | 'low';
export type MakeupFeedbackIntensity = 'light' | 'medium' | 'bold';

export type MakeupFeedbackScoreAxisId =
  | 'application-finish'
  | 'placement-balance'
  | 'color-value-harmony'
  | 'overall-goal-fit';

export type MakeupFeedbackScoreComponentId =
  | 'base-finish'
  | 'brow-eye-finish'
  | 'cheek-finish'
  | 'lip-finish'
  | 'bilateral-balance'
  | 'landmark-placement'
  | 'visual-weight'
  | 'relative-contrast'
  | 'color-continuity'
  | 'finish-coherence'
  | 'full-face-coherence'
  | 'focal-hierarchy'
  | 'explicit-goal-fit';

export type MakeupFeedbackScoreComponent = {
  evidenceIds: string[];
  id: MakeupFeedbackScoreComponentId;
  label: string;
  maxScore: number;
  reason: string;
  score: number;
};

export type MakeupFeedbackScoreAxis = {
  /** Absent on stored v9 reports created before analytic component scoring. */
  components?: MakeupFeedbackScoreComponent[];
  evidenceIds: string[];
  id: MakeupFeedbackScoreAxisId;
  label: string;
  maxScore: number;
  reason: string;
  score: number;
};

export type MakeupFeedbackScoreBreakdown = {
  axes: MakeupFeedbackScoreAxis[];
  formula: string;
  maxScore: 100;
};

export type MakeupFeedbackCorrectionGuide = {
  amount: string;
  coverage: string;
  steps: string[];
  stopCondition: string;
  targetArea: string;
  tool: string;
  why: string;
};

export type MakeupFeedbackCaptureQualityIssue = {
  code: string;
  message: string;
  affectedTopicIds: MakeupFeedbackTopicId[];
};

export type MakeupFeedbackCaptureQuality = {
  usable: boolean;
  detectorAvailable: boolean;
  colorConfidence: MakeupFeedbackConfidenceLevel;
  issues: MakeupFeedbackCaptureQualityIssue[];
};

export type MakeupFeedbackEvidenceRegionId =
  | 'full'
  | 'left_eye'
  | 'right_eye'
  | 'left_cheek'
  | 'right_cheek'
  | 'lips';

export type MakeupFeedbackEvidenceRegion = {
  id: MakeupFeedbackEvidenceRegionId;
  box: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
};

export type MakeupFeedbackAnalysisImageSize = {
  width: number;
  height: number;
};

export type MakeupFeedbackObservation = {
  id: string;
  claim: string;
  evidenceLocation: string;
  lightingSensitive: boolean;
  evidenceRegionIds?: MakeupFeedbackEvidenceRegionId[];
};

export type MakeupFeedbackDynamicCriterion = {
  id: string;
  criterion: string;
  derivedFrom: string;
  sourceType?: 'common_baseline' | 'explicit_user_goal' | 'inferred_expert_standard';
};

export type MakeupFeedbackTopic = {
  id: MakeupFeedbackTopicId;
  label: string;
  kind: MakeupFeedbackCorrectionPointKind;
};

export const MAKEUP_FEEDBACK_TOPICS: readonly MakeupFeedbackTopic[] = [
  {id: 'brow', label: '눈썹', kind: 'eye'},
  {id: 'lash', label: '속눈썹', kind: 'eye'},
  {id: 'lens', label: '렌즈', kind: 'eye'},
  {id: 'eyeliner', label: '아이라인', kind: 'eye'},
  {id: 'eyeshadow', label: '아이섀도', kind: 'eye'},
  {id: 'aegyosal', label: '애교살', kind: 'eye'},
  {id: 'foundation', label: '파운데이션', kind: 'cheek'},
  {id: 'blush', label: '블러셔', kind: 'cheek'},
  {id: 'highlight', label: '하이라이터', kind: 'cheek'},
  {id: 'shading', label: '섀딩', kind: 'cheek'},
  {id: 'lip', label: '립', kind: 'lip'},
] as const;

export type MakeupFeedbackEvaluation = {
  id: string;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
  status: MakeupFeedbackEvaluationStatus;
  title: string;
  description: string;
  actionSteps: string[];
  correctionGuide?: MakeupFeedbackCorrectionGuide;
  kind: MakeupFeedbackCorrectionPointKind;
  confidence?: number;
  scoreImpact?: MakeupFeedbackScoreImpact;
  visibility?: MakeupFeedbackVisibility;
  visibilityReason?: string | null;
  observations?: MakeupFeedbackObservation[];
  goalCriterionIds?: string[];
};

export type MakeupFeedbackCorrectionPoint = {
  id: string;
  evaluationId?: string;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
  title: string;
  description: string;
  actionSteps: string[];
  correctionGuide?: MakeupFeedbackCorrectionGuide;
  actionLabel: string;
  kind: MakeupFeedbackCorrectionPointKind;
};

export type MakeupFeedbackStrength = {
  id: string;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
  title: string;
  description: string;
  actionSteps: string[];
  icon: 'sparkle' | 'heart';
  kind: MakeupFeedbackCorrectionPointKind;
};

export type MakeupFeedbackInterpretedGoal = {
  label: string;
  intensity: MakeupFeedbackIntensity;
  reason: string;
  explicitFacts?: string[];
  unknowns?: string[];
  assumptions?: string[];
  dynamicCriteria?: MakeupFeedbackDynamicCriterion[];
};

export type MakeupFeedbackSummary = {
  strengthSummary: string;
  improvementSummary: string;
};

export type MakeupFeedbackResult = {
  id: string;
  createdAt?: string;
  analysisSource: MakeupFeedbackAnalysisSource;
  analysisId?: string;
  analysisStatus?: string;
  entryDate?: string;
  modelVersion?: string;
  uploadedImage: ImageSourcePropType;
  photoSource: MakeupFeedbackPhotoSource;
  photoSourceLabel: string;
  score: number;
  scoreLabel?: string;
  scoreReason: string;
  scoreBreakdown?: MakeupFeedbackScoreBreakdown;
  interpretedGoal?: MakeupFeedbackInterpretedGoal;
  summary?: MakeupFeedbackSummary;
  summaryBadges: MakeupFeedbackSummaryBadge[];
  annotations: MakeupFeedbackAnnotation[];
  evaluations: MakeupFeedbackEvaluation[];
  points: MakeupFeedbackCorrectionPoint[];
  strengths: MakeupFeedbackStrength[];
  /** Optional only for saved results created before the live v2 contract. */
  analysisDecision?: 'completed';
  captureQuality?: MakeupFeedbackCaptureQuality;
  scoreRange?: [number, number];
  scoreConfidence?: MakeupFeedbackConfidenceLevel;
  scoreEvidenceIds?: string[];
  analysisImageSize?: MakeupFeedbackAnalysisImageSize;
  evidenceRegions?: MakeupFeedbackEvidenceRegion[];
};

export type MakeupFeedbackCompletedResult = MakeupFeedbackResult & {
  analysisDecision: 'completed';
  analysisId: string;
  captureQuality: MakeupFeedbackCaptureQuality;
  scoreRange: [number, number];
  scoreConfidence: MakeupFeedbackConfidenceLevel;
  scoreEvidenceIds: string[];
  interpretedGoal: MakeupFeedbackInterpretedGoal & {
    explicitFacts: string[];
    unknowns: string[];
    assumptions: string[];
    dynamicCriteria: MakeupFeedbackDynamicCriterion[];
  };
};

export type MakeupFeedbackRetakeOutcome = {
  analysisDecision: 'retake_required';
  createdAt?: string;
  analysisStatus?: string;
  captureQuality: MakeupFeedbackCaptureQuality;
  id: string;
  modelVersion?: string;
  photoSource: MakeupFeedbackPhotoSource;
  photoSourceLabel: string;
  uploadedImage: ImageSourcePropType;
};

export type MakeupFeedbackAnalysisOutcome =
  | MakeupFeedbackCompletedResult
  | MakeupFeedbackRetakeOutcome;
