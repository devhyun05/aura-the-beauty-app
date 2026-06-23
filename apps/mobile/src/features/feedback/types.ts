import type {ImageSourcePropType} from 'react-native';

export type FeedbackPhotoSource = 'camera' | 'gallery';

export type FeedbackPhotoSelection = {
  source: FeedbackPhotoSource;
  imageUri?: string;
};

export type FeedbackSummaryBadge = {
  id: string;
  label: string;
};

export type FeedbackCallout = {
  id: string;
  label: string;
  top: number;
  left: number;
  lineWidth: number;
  lineTop: number;
  lineLeft: number;
  rotate: string;
};

export type FeedbackPoint = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  kind: 'eye' | 'cheek' | 'lip';
};

export type FeedbackPointKind = FeedbackPoint['kind'];

export type FeedbackStrength = {
  id: string;
  title: string;
  description: string;
  icon: 'sparkle' | 'heart';
};

export type MakeupFeedbackResult = {
  id: string;
  uploadedImage: ImageSourcePropType;
  source: FeedbackPhotoSource;
  sourceLabel: string;
  score: number;
  summaryBadges: FeedbackSummaryBadge[];
  callouts: FeedbackCallout[];
  points: FeedbackPoint[];
  strengths: FeedbackStrength[];
};
