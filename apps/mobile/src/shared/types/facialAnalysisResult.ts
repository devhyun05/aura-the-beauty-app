import type {ImageSourcePropType} from 'react-native';

export type AnalysisAttribute = {
  label: string;
  description: string;
};

export type MakeupDirection = {
  id: string;
  imageSource: ImageSourcePropType;
  title: string;
  subtitle: string;
  finish: string;
  matchScore: number;
  keyColors: readonly string[];
  tags: readonly string[];
};

export type FacialAnalysisAvoidExample = {
  id: string;
  title: string;
  reason: string;
};

export type FacialAnalysisResult = {
  userName: string;
  analyzedAtLabel: string;
  previewImageSource: ImageSourcePropType;
  summary: string;
  analysis: {
    skinTone: AnalysisAttribute;
    mood: AnalysisAttribute;
    faceBalance: AnalysisAttribute;
  };
  analysisPoints: readonly string[];
  cautionPoints: readonly string[];
  makeupDirections: readonly MakeupDirection[];
  avoidExamples: readonly FacialAnalysisAvoidExample[];
};
