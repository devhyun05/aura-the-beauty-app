import type { ImageSourcePropType } from 'react-native';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarSource: ImageSourcePropType;
  personalColor: string;
  skinType: string;
  skinTone: string;
}

export interface AnalysisReportPreview {
  id: string;
  analyzedAt: string;
  title: string;
  imageSource: ImageSourcePropType;
  personalColor: string;
  skinType: string;
  summary: string;
}

export interface MakeupStylePreview {
  id: string;
  title: string;
  imageSource: ImageSourcePropType;
  isSaved: boolean;
}

export interface FavoriteProductPreview {
  id: string;
  brandName: string;
  productName: string;
  price: number;
  imageSource: ImageSourcePropType;
  isLiked: boolean;
}

export interface UserPageData {
  profile: UserProfile;
  reports: AnalysisReportPreview[];
  makeupStyles: MakeupStylePreview[];
  favoriteProducts: FavoriteProductPreview[];
}
