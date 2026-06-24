import type { ImageSourcePropType } from 'react-native';

import type { ImageAnalysisReport } from './imageAnalysis';

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
  tags: string[];
}

export type ImageAnalysisReportPreview = ImageAnalysisReport;

export interface MakeupLook {
  id: string;
  title: string;
  moodLabel: string;
  shortDescription: string;
  imageSource: ImageSourcePropType;
  isSaved: boolean;
}

export type MakeupStylePreview = MakeupLook;

export interface Product {
  id: string;
  brandName: string;
  productName: string;
  price: number;
  imageSource: ImageSourcePropType;
  isLiked: boolean;
}

export type FavoriteProductPreview = Product;

export interface ProfileEditField {
  id: string;
  label: string;
  value: string;
  editable: boolean;
}

export interface MyPageData {
  profile: UserProfile;
  reports: ImageAnalysisReportPreview[];
  makeupStyles: MakeupLook[];
  favoriteProducts: Product[];
}
