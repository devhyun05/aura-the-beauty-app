import type {ImageSourcePropType} from 'react-native';

export type AnalysisAttribute = {
  label: string;
  description: string;
};

export type MakeupLook = {
  id: string;
  imageSource: ImageSourcePropType;
  title: string;
  subtitle: string;
  finish: string;
  matchScore: number;
  keyColors: readonly string[];
  tags: readonly string[];
};

export type AvoidMakeupExample = {
  id: string;
  title: string;
  reason: string;
};

export type RecommendationResult = {
  userName: string;
  analyzedAtLabel: string;
  previewImageSource: ImageSourcePropType;
  summary: string;
  analysis: {
    skinTone: AnalysisAttribute;
    mood: AnalysisAttribute;
    faceBalance: AnalysisAttribute;
  };
  recommendationPoints: readonly string[];
  cautionPoints: readonly string[];
  recommendedLooks: readonly MakeupLook[];
  avoidExamples: readonly AvoidMakeupExample[];
};
