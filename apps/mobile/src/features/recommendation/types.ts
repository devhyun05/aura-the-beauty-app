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

export type ProductRecommendationItem = {
  id: string;
  brandName: string;
  productName: string;
  shadeName: string;
  category: Exclude<ProductRecommendationCategory, 'all'>;
  matchRate: number;
  price: number;
  tags: string[];
  imageSource: ImageSourcePropType;
  palette: string[];
  reason: string;
};

export type ProductRecommendationStyle = {
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
  makeupStyle: ProductRecommendationStyle;
  tabs: ProductRecommendationTab[];
  products: ProductRecommendationItem[];
  sets: ProductRecommendationSet[];
};
