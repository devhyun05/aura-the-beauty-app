import type { ImageSourcePropType } from 'react-native';

export type AnalysisSubjectType = 'me' | 'friend';

export interface AnalysisResult {
  id: string;
  title: string;
  analyzedAt: string;
  imageSource: ImageSourcePropType;
  subjectType: AnalysisSubjectType;
  personLabel: string;
  environmentLabel: string;
  personalColor: string;
  skinType: string;
  toneSummary: string;
  recommendedMood: string;
  tags: string[];
  summary: string;
  shortSummary: string;
}
