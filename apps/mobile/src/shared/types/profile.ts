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

export interface MakeupLook {
  id: string;
  title: string;
  moodLabel: string;
  shortDescription: string;
  imageSource: ImageSourcePropType;
  isSaved: boolean;
}

export type MakeupLookPreview = MakeupLook;

export interface Product {
  id: string;
  brandName: string;
  productName: string;
  price: number;
  imageSource: ImageSourcePropType;
  isLiked: boolean;
}

export type LikedProductPreview = Product;

export interface ProfileEditField {
  id: string;
  label: string;
  value: string;
  editable: boolean;
}

export interface ProfileData {
  profile: UserProfile;
  imageAnalysisReports: ImageAnalysisReport[];
  makeupLooks: MakeupLook[];
  likedProducts: Product[];
}
