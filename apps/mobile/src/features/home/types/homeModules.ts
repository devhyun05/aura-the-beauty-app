import type {ImageSourcePropType} from 'react-native';

export const HOME_FEATURE_IDS = [
  'faceAnalysis',
  'makeupRecommendation',
  'productRecommendation',
  'auradin',
  'makeupExtraction',
  'makeupFeedback',
  'consulting',
  'savedMakeup',
  'likedProducts',
  'arFilter',
  'filterStore',
] as const;

export type HomeFeatureId = (typeof HOME_FEATURE_IDS)[number];

export type HomeFeaturePressPayload = {
  disclosureLabel?: string;
  externalSource?: string;
  itemId?: string;
  offerId?: string;
  purchaseUrl?: string;
  shadeId?: string;
  sponsored?: boolean;
  sponsorshipType?: string;
  source?: string;
};

export type HomeFeaturePresentation =
  | 'actionSheet'
  | 'mainTab'
  | 'route';

export type HomeFeatureConfig = {
  id: HomeFeatureId;
  label: string;
  enabled: boolean;
  presentation: HomeFeaturePresentation;
  requiresAuth?: boolean;
};

export const HOME_MODULE_IDS = [
  'faceAnalysis',
  'products',
  'makeupRecommendation',
  'makeupExtraction',
  'auradin',
  'makeupFeedback',
  'consulting',
] as const;

export type HomeModuleId = (typeof HOME_MODULE_IDS)[number];
export type HomeModuleKind = HomeModuleId;

export type HomeModuleBackgroundTone =
  | 'dark'
  | 'default'
  | 'lavender'
  | 'sage'
  | 'sand'
  | 'soft';

export type HomeModuleVisibility = 'always';

export type HomeModuleItemMetadataValue = boolean | number | string;

export type HomeModuleItem = {
  id: string;
  title: string;
  description?: string;
  eyebrow?: string;
  reason?: string;
  imageSource?: ImageSourcePropType;
  featureId?: HomeFeatureId;
  targetId?: string;
  metadata?: Readonly<Record<string, HomeModuleItemMetadataValue>>;
};

export type HomeModuleConfig = {
  id: HomeModuleId;
  kind: HomeModuleKind;
  title: string;
  eyebrow?: string;
  description?: string;
  ctaLabel: string;
  featureId: HomeFeatureId;
  imageSources: readonly ImageSourcePropType[];
  items?: readonly HomeModuleItem[];
  backgroundTone?: HomeModuleBackgroundTone;
  visibility: HomeModuleVisibility;
};

export type HomeAudienceState = {
  isAuthenticated: boolean;
  hasCompletedFaceAnalysis: boolean;
  recentActivityCount: number;
};
