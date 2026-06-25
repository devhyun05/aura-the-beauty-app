import type {ImageSourcePropType} from 'react-native';

export type MakeupFeedbackPhotoSource = 'camera' | 'gallery';

export type MakeupFeedbackPhotoSelection = {
  source: MakeupFeedbackPhotoSource;
  imageUri?: string;
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

export type MakeupFeedbackCorrectionPoint = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  kind: 'eye' | 'cheek' | 'lip';
};

export type MakeupFeedbackCorrectionPointKind = MakeupFeedbackCorrectionPoint['kind'];

export type MakeupFeedbackStrength = {
  id: string;
  title: string;
  description: string;
  icon: 'sparkle' | 'heart';
};

export type MakeupFeedbackResult = {
  id: string;
  uploadedImage: ImageSourcePropType;
  source: MakeupFeedbackPhotoSource;
  sourceLabel: string;
  score: number;
  summaryBadges: MakeupFeedbackSummaryBadge[];
  annotations: MakeupFeedbackAnnotation[];
  points: MakeupFeedbackCorrectionPoint[];
  strengths: MakeupFeedbackStrength[];
};
