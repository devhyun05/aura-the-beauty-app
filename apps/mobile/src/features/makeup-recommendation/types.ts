import type {ImageSourcePropType} from 'react-native';

export type MakeupScenarioTone = 'narrative' | 'playful' | 'premium';
export type MakeupScenarioSource = 'curated' | 'personalized' | 'trend' | 'wildcard';
export type MakeupScenarioCopyStyle = 'editorial' | 'scene' | 'monologue' | 'narrative' | 'character';
export type MakeupScenarioVisualEmphasis = 'whisper' | 'compact' | 'standard' | 'featured' | 'hero';
export type MakeupScenarioPalette = 'paper' | 'ink' | 'muted' | 'mid' | 'soft' | 'accent';
export type MakeupQuestionDimension = 'occasion' | 'mood' | 'boldness' | 'timeSkill';
export type MakeupLookRole = 'anchor' | 'bold' | 'discovery';
export type MakeupArea = 'base' | 'eye' | 'brow' | 'cheek' | 'lip';
export type MakeupGuideArea = MakeupArea | 'contour';
export type MakeupRecommendationRefinement = 'natural' | 'hip' | 'differentColor' | 'replaceProducts';
export type MakeupSituationKey =
  | 'daily'
  | 'work'
  | 'date'
  | 'social'
  | 'formal_event'
  | 'travel_outdoor'
  | 'camera_content'
  | 'festival_performance';
export type MakeupKeywordKind = 'curated' | 'steady' | 'trend';
export type MakeupTrendBadge =
  | 'TREND_K_BEAUTY_2026'
  | 'TREND_GLOBAL_SS26'
  | 'STEADY'
  | 'CURATED';

export type MakeupTrendKeyword = {
  id: string;
  label: string;
  kind: MakeupKeywordKind;
  badge: MakeupTrendBadge;
  marketScope?: string;
  seedPrompt: string;
  tags: string[];
  sourceName?: string;
  sourceUrl?: string;
  sourcePublishedAt?: string;
  asOf?: string;
  expiresAt?: string;
  confidence?: 'A' | 'B';
};

export type MakeupSituation = {
  id: string;
  key: MakeupSituationKey;
  label: string;
  description: string;
  imageAssetKey: MakeupSituationKey;
  sortOrder: number;
  keywords: MakeupTrendKeyword[];
};

export type MakeupRecommendationDiscovery = {
  situations: MakeupSituation[];
  generatedAt: string;
  source: 'api' | 'fixture';
  sourceReportIds?: string[];
};

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
  keyword?: MakeupTrendKeyword;
  situation?: MakeupSituation;
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
  price?: number;
  imageUrl?: string;
  purchaseUrl?: string;
  matchRate?: number;
};
export type RecommendedMakeupAreaGuide = {
  area: MakeupGuideArea;
  label: string;
  goal: string;
  color: {name: string; hex: string};
  texture: string;
  placement: string;
  technique: string;
  reason: string;
  avoid: string[];
  steps: Array<{order: number; instruction: string}>;
  products: MakeupRecommendationProduct[];
  arSupported: boolean;
};
export type MakeupRecommendationImageStatus =
  | 'pending'
  | 'processing'
  | 'partial'
  | 'completed'
  | 'failed';
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
  areaGuides?: RecommendedMakeupAreaGuide[];
  imageStatus?: MakeupRecommendationImageStatus;
  imageError?: string;
};
export type MakeupRecommendationProfileGender = 'female' | 'male' | 'unspecified';
export type MakeupRecommendationSession = {
  id: string;
  phase: 'question' | 'ready' | 'results';
  prompt: string;
  scenarioLabel?: string;
  questions: MakeupRecommendationQuestion[];
  currentQuestionIndex: number;
  answers: MakeupRecommendationAnswer[];
  additionalConstraints?: string;
  results: MakeupLookRecommendation[];
  profileGender?: MakeupRecommendationProfileGender;
  useProfile: boolean;
  personalColor?: string;
  sourceAnalysisReportId?: string;
  situation?: Pick<MakeupSituation, 'id' | 'key' | 'label' | 'description'>;
  keyword?: MakeupTrendKeyword;
  editorialPresetId?: string;
  customSituationText?: string;
  status?: 'questioning' | 'ready' | 'generating' | 'completed' | 'failed';
  expiresAt?: string;
  reportId?: string;
  imageStatus?: MakeupRecommendationImageStatus;
  imageError?: string;
  generationMode?: 'backend' | 'v2' | 'fixture';
};
export type MakeupRecommendationReportHistoryItem = {
  reportId: string;
  scenarioText: string;
  createdAt: string;
  imageStatus: MakeupRecommendationImageStatus;
  imageError?: string;
  profileGender?: MakeupRecommendationProfileGender;
  results: MakeupLookRecommendation[];
};
export type ProductRecommendationProvider = {
  recommendProducts(lookId: string): MakeupRecommendationProduct[];
};
