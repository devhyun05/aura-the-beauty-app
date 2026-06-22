export type AnalysisAttribute = {
  label: string;
  description: string;
};

export type MakeupLook = {
  id: string;
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
