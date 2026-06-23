import type { ImageSourcePropType } from 'react-native';

export interface AnalysisResult {
  id: string;
  title: string;
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
}
