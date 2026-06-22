import type { ImageSourcePropType } from 'react-native';

import type { AnalysisResult } from './analysis';

export interface UserProfile {
  id: string;
  name: string;
  nickname: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  interest: string;
  avatarSource: ImageSourcePropType;
  personalColor: string;
  skinType: string;
  skinTone: string;
}

export type AnalysisReportPreview = AnalysisResult;

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
