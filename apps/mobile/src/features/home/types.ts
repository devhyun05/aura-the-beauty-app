import type {ImageSourcePropType} from 'react-native';

export type HomeHeroFeatureId =
  | 'auradin'
  | 'consulting'
  | 'faceDiagnosis'
  | 'makeupExtraction';

export type HomeTrendItem = {
  ctaLabel?: string;
  description?: string;
  featureId?: HomeHeroFeatureId;
  filterId?: string;
  id: string;
  title: string;
  tone: string;
  imageSource: ImageSourcePropType;
};

export type HomeNotice = {
  id: string;
  title: string;
  description: string;
};

export type HomeFilterStoreItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  imageSource: ImageSourcePropType;
};

export type HomeMakeupLook = {
  id: string;
  title: string;
  description: string;
  date: string;
  imageSource: ImageSourcePropType;
};

export type HomeData = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    imageSource: ImageSourcePropType;
    notices: HomeNotice[];
    trends: HomeTrendItem[];
  };
  filterStore: HomeFilterStoreItem[];
  recommendedLooks: HomeMakeupLook[];
};
