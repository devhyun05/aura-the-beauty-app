import type { ImageSourcePropType } from 'react-native';

export interface AnalysisFacePointGuide {
  brow: string;
  blush: string;
  highlight: string;
  eyeshadow: string;
  eyeliner: string;
  lip: string;
}

export interface AnalysisMakeupCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  imageSource: ImageSourcePropType;
  tags: string[];
}

export interface AnalysisResult {
  id: string;
  title: string;
  reportTitle: string;
  analyzedAt: string;
  imageSource: ImageSourcePropType;
  environmentLabel: string;
  personalColor: string;
  skinType: string;
  toneSummary: string;
  recommendedMood: string;
  tags: string[];
  summary: string;
  shortSummary: string;
  skinAnalysisSummary: string;
  baseMakeupGuide: string;
  facePointGuide: AnalysisFacePointGuide;
  recommendedMakeups: AnalysisMakeupCard[];
  avoidedMakeups: AnalysisMakeupCard[];
}
