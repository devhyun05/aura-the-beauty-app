import type {ImageSourcePropType} from 'react-native';

export type MakeupFeedbackPhotoSource = 'camera' | 'gallery';

export type MakeupFeedbackPhotoSelection = {
  photoSource: MakeupFeedbackPhotoSource;
  imageUri?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  photoTitle?: string;
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
  | 'shading';

export type MakeupFeedbackEvaluationStatus = 'strength' | 'improvement';

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
] as const;

export type MakeupFeedbackEvaluation = {
  id: string;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
  status: MakeupFeedbackEvaluationStatus;
  title: string;
  description: string;
  kind: MakeupFeedbackCorrectionPointKind;
  confidence?: number;
};

export type MakeupFeedbackCorrectionPoint = {
  id: string;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
  title: string;
  description: string;
  actionLabel: string;
  kind: MakeupFeedbackCorrectionPointKind;
};

export type MakeupFeedbackStrength = {
  id: string;
  topicId: MakeupFeedbackTopicId;
  topicLabel: string;
  title: string;
  description: string;
  icon: 'sparkle' | 'heart';
  kind: MakeupFeedbackCorrectionPointKind;
};

export type MakeupFeedbackResult = {
  id: string;
  uploadedImage: ImageSourcePropType;
  photoSource: MakeupFeedbackPhotoSource;
  photoSourceLabel: string;
  score: number;
  summaryBadges: MakeupFeedbackSummaryBadge[];
  annotations: MakeupFeedbackAnnotation[];
  evaluations: MakeupFeedbackEvaluation[];
  points: MakeupFeedbackCorrectionPoint[];
  strengths: MakeupFeedbackStrength[];
};