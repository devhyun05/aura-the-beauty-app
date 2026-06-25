import type {ImageSourcePropType} from 'react-native';

export type HomeTrendItem = {
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

export type HomeMakeupStyle = {
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
  recommendedStyles: HomeMakeupStyle[];
};
