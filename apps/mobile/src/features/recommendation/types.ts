import type {ImageSourcePropType} from 'react-native';

export type ProductRecommendationCategory =
  | 'all'
  | 'lip'
  | 'cheek'
  | 'shadow'
  | 'liner'
  | 'base';

export type ProductRecommendationTab = {
  id: ProductRecommendationCategory;
  label: string;
};

export type RecommendedProduct = {
  id: string;
  brandName: string;
  productName: string;
  shadeName: string;
  category: Exclude<ProductRecommendationCategory, 'all'>;
  matchRate: number;
  price: number;
  tags: string[];
  imageUrl?: string;
  imageSource: ImageSourcePropType;
  purchaseUrl?: string;
  palette: string[];
  productInfo?: {
    brand?: string;
    colors?: string[];
    effects?: string[];
    features?: string[];
    maker?: string;
    origin?: string;
    productNumber?: string;
    skinTypes?: string[];
    tones?: string[];
  };
  reason: string;
};

export type ProductRecommendationLook = {
  title: string;
  description: string;
  imageSource: ImageSourcePropType;
  tags: string[];
  palette: string[];
};

export type ProductRecommendationSet = {
  id: string;
  title: string;
  description: string;
  productIds: string[];
};

export type ProductRecommendationData = {
  userNickname: string;
  makeupLook: ProductRecommendationLook;
  tabs: ProductRecommendationTab[];
  products: RecommendedProduct[];
  sets: ProductRecommendationSet[];
};

export type AuradinQuickPrompt = {
  id: string;
  label: string;
  prompt: string;
};

export type AuradinSourceCard = {
  id: string;
  title: string;
  description: string;
  tone: string;
};

export type AuradinThinkingStep = {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending';
};

export type AuradinQuestionOption = {
  id: string;
  label: string;
  swatch?: string;
};

export type AuradinQuestion = {
  id: string;
  title: string;
  options: AuradinQuestionOption[];
};

export type AuradinCandidateProduct = {
  id: string;
  brandName: string;
  productName: string;
  shadeName: string;
  priceText: string;
  matchSummary: string;
  palette: string[];
  tags: string[];
  imageSource: ImageSourcePropType;
};

export type AuradinDraftData = {
  conditionChips: string[];
  quickPrompts: AuradinQuickPrompt[];
  sourceCards: AuradinSourceCard[];
  thinkingSteps: AuradinThinkingStep[];
  question: AuradinQuestion;
  candidates: AuradinCandidateProduct[];
};
