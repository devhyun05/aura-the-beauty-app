import type {ImageSourcePropType} from 'react-native';

export type MakeupScenarioTone = 'narrative' | 'playful' | 'premium';
export type MakeupScenarioSource = 'curated' | 'personalized' | 'trend' | 'wildcard';
export type MakeupScenarioCopyStyle = 'editorial' | 'scene' | 'monologue' | 'narrative' | 'character';
export type MakeupScenarioVisualEmphasis = 'compact' | 'standard' | 'featured';
export type MakeupScenarioPalette = 'paper' | 'ink' | 'muted' | 'accent';
export type MakeupQuestionDimension = 'occasion' | 'mood' | 'boldness' | 'timeSkill';
export type MakeupLookRole = 'anchor' | 'bold' | 'discovery';
export type MakeupArea = 'base' | 'eye' | 'brow' | 'cheek' | 'lip';
export type MakeupRecommendationRefinement = 'natural' | 'hip' | 'differentColor' | 'replaceProducts';

export type MakeupScenarioPrompt = {
  id: string;
  displayText: string;
  seedPrompt: string;
  intentTags: string[];
  knownDimensions: MakeupQuestionDimension[];
  tone: MakeupScenarioTone;
  source: MakeupScenarioSource;
  copyStyle: MakeupScenarioCopyStyle;
  visualEmphasis: MakeupScenarioVisualEmphasis;
  palette: MakeupScenarioPalette;
  preferredColumnSpan: 3 | 4 | 5 | 6 | 7 | 8;
};

export type MakeupRecommendationQuestionOption = {id: string; label: string};
export type MakeupRecommendationQuestion = {
  id: string;
  dimension: MakeupQuestionDimension;
  title: string;
  options: MakeupRecommendationQuestionOption[];
};
export type MakeupRecommendationAnswer = {
  questionId: string;
  optionId?: string;
  freeText?: string;
  additionalConstraints?: string;
};
export type MakeupRecommendationStep = {area: MakeupArea; instruction: string; order: number};
export type MakeupRecommendationProduct = {
  id: string;
  area: MakeupArea;
  brandName: string;
  productName: string;
  shadeName?: string;
  reason: string;
};
export type MakeupLookRecommendation = {
  id: string;
  arFilterId: string;
  role: MakeupLookRole;
  title: string;
  summary: string;
  imageSource: ImageSourcePropType;
  reasons: string[];
  appliedConditions: string[];
  durationMinutes: number;
  difficulty: 'easy' | 'medium' | 'advanced';
  steps: MakeupRecommendationStep[];
  products: MakeupRecommendationProduct[];
};
export type MakeupRecommendationSession = {
  id: string;
  phase: 'question' | 'results';
  prompt: string;
  questions: MakeupRecommendationQuestion[];
  currentQuestionIndex: number;
  answers: MakeupRecommendationAnswer[];
  additionalConstraints?: string;
  results: MakeupLookRecommendation[];
  useProfile: boolean;
  personalColor?: string;
};
export type ProductRecommendationProvider = {
  recommendProducts(lookId: string): MakeupRecommendationProduct[];
};
