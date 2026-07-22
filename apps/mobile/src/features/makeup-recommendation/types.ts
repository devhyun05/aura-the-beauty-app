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

export type MakeupRecommendationSourceReportSummary = {
  environmentLabel?: string;
  faceShape?: string;
  personalColor?: string;
  shortSummary?: string;
  skinType?: string;
  title?: string;
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
export type MakeupRecommendationApplicationColor = {
  role: string;
  name: string;
  hex: string;
};
export type MakeupRecommendationApplicationStep = {
  order: number;
  title: string;
  productType: string;
  tool: string;
  colors: MakeupRecommendationApplicationColor[];
  amount: string;
  placement: string;
  technique: string;
  blending: string;
  finishCheck: string;
};
export type MakeupRecommendationApplicationPlan = {
  recipeVersion: 'makeup-application-v1';
  estimatedMinutes: number;
  completionCriteria: string[];
  steps: MakeupRecommendationApplicationStep[];
};
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
  applicationOrder?: number;
  applicationPlan?: MakeupRecommendationApplicationPlan;
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
export type MakeupRecommendationCropBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type MakeupRecommendationCropRegions = Partial<
  Record<MakeupArea, MakeupRecommendationCropBox[]>
>;
export type MakeupRecommendationImageAlignmentPoint = {x: number; y: number};
export type MakeupRecommendationImageAlignmentFrame = {
  imageSize: {width: number; height: number};
  faceBox: MakeupRecommendationCropBox;
  eyeCenters?: {
    imageLeft: MakeupRecommendationImageAlignmentPoint;
    imageRight: MakeupRecommendationImageAlignmentPoint;
  };
  rollDeg?: number;
};
export type MakeupRecommendationImageAlignmentMetadata = {
  version: 'makeup-face-alignment-v1';
  source: MakeupRecommendationImageAlignmentFrame;
  generated: MakeupRecommendationImageAlignmentFrame;
};
export type MakeupRecommendationGenerationSource =
  | 'claude'
  | 'deterministic_fallback';
export type MakeupRecommendationLookMap = {
  version: 'makeup-look-map-v1';
  naturalityToPersonality: number;
  casualToGlam: number;
  rationale: string;
};
export type MakeupRecommendationFitDimensionKey =
  | 'situation'
  | 'preference'
  | 'personalColor'
  | 'faceStructure'
  | 'skinCompatibility'
  | 'lookCoherence';
export type MakeupRecommendationFitDimension = {
  available: boolean;
  score?: number;
  reason: string;
};
export type MakeupRecommendationFitEvidenceSource =
  | 'situation'
  | 'preference'
  | 'personal_color'
  | 'face_structure'
  | 'skin_type'
  | 'look_coherence';
export type MakeupRecommendationFitAssessment = {
  scoringVersion: 'makeup-fit-v1';
  overallScore: number;
  dimensions: Record<
    MakeupRecommendationFitDimensionKey,
    MakeupRecommendationFitDimension
  >;
  evidence: Array<{
    source: MakeupRecommendationFitEvidenceSource;
    label: string;
    reason: string;
  }>;
};
export type MakeupRecommendationMatchComponentKey =
  | 'preference'
  | 'situation'
  | 'colorHarmony'
  | 'skinFinish';
export type MakeupRecommendationMatchComponent = {
  key: MakeupRecommendationMatchComponentKey;
  weight: number;
  score: number | null;
  evaluated: boolean;
  reason: string;
  evidence: string[];
};
export type MakeupRecommendationReflectedInput = {
  sourceType: string;
  sourceId: string;
  inputLabel: string;
  decisionPath: string;
  reflectedValue: string;
};
export type MakeupRecommendationMatchAssessment = {
  version: 'makeup-match-v1';
  score: number | null;
  evaluatedWeight: number;
  components: MakeupRecommendationMatchComponent[];
  reflectedInputs: MakeupRecommendationReflectedInput[];
  generationSource: MakeupRecommendationGenerationSource;
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
  areaGuides?: RecommendedMakeupAreaGuide[];
  imageStatus?: MakeupRecommendationImageStatus;
  imageError?: string;
  imageCropRegions?: MakeupRecommendationCropRegions;
  imageAlignmentMetadata?: MakeupRecommendationImageAlignmentMetadata;
  generationSource?: MakeupRecommendationGenerationSource;
  lookMap?: MakeupRecommendationLookMap;
  fitAssessment?: MakeupRecommendationFitAssessment;
  matchAssessment?: MakeupRecommendationMatchAssessment;
};
export type MakeupRecommendationProfileGender = 'female' | 'male' | 'unspecified';
export type MakeupRecommendationSession = {
  id: string;
  createdAt?: string;
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
  scenarioLabel?: string;
  createdAt: string;
  imageStatus: MakeupRecommendationImageStatus;
  imageError?: string;
  previewImageUrl?: string;
  previewImageStatus?: MakeupRecommendationImageStatus;
  profileGender?: MakeupRecommendationProfileGender;
  personalColor?: string;
  sourceAnalysisReportId?: string;
  questions?: MakeupRecommendationQuestion[];
  answers?: MakeupRecommendationAnswer[];
  additionalConstraints?: string;
  situation?: Pick<MakeupSituation, 'id' | 'key' | 'label' | 'description'>;
  keyword?: MakeupTrendKeyword;
  editorialPresetId?: string;
  customSituationText?: string;
  results: MakeupLookRecommendation[];
};
export type ProductRecommendationProvider = {
  recommendProducts(lookId: string): MakeupRecommendationProduct[];
};
