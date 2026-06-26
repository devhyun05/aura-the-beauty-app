import type { ImageSourcePropType } from 'react-native';

export interface FaceAnalysisFacePointGuide {
  brow: string;
  blush: string;
  highlight: string;
  eyeshadow: string;
  eyeliner: string;
  lip: string;
}

export interface FaceAnalysisMakeupCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  imageSource: ImageSourcePropType;
  tags: string[];
}

export interface FaceAnalysisReport {
  id: string;
  title: string;
  reportTitle: string;
  analyzedAt: string;
  imageSource: ImageSourcePropType;
  environmentLabel: string;
  personalColor: string;
  faceShape: string;
  skinType: string;
  toneSummary: string;
  recommendedMood: string;
  tags: string[];
  summary: string;
  shortSummary: string;
  skinAnalysisSummary: string;
  baseMakeupGuide: string;
  facePointGuide: FaceAnalysisFacePointGuide;
  recommendedMakeups: FaceAnalysisMakeupCard[];
  avoidedMakeups: FaceAnalysisMakeupCard[];
}
