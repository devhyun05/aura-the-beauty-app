import type {ImageSourcePropType} from 'react-native';

import type { FaceAnalysisReport } from './faceAnalysis';
import type {MakeupArea} from './makeupGuide';

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
}

export interface BeautyProfile {
  personalColor: string;
  skinType: string;
  skinTone: string;
  tags: string[];
}

export type MakeupFilterScope = 'totalMakeup' | 'pointMakeup';

export type MakeupPresetValues = {
  colorId?: string;
  typeId?: string;
  textureId?: string;
  shapeId?: string;
};

interface MakeupLookBase {
  id: string;
  title: string;
  moodLabel: string;
  shortDescription: string;
  imageSource: ImageSourcePropType;
  isSaved: boolean;
  makeupPresetValues: MakeupPresetValues;
}

export interface TotalMakeupLook extends MakeupLookBase {
  scope: 'totalMakeup';
  makeupArea: 'all';
}

export interface PointMakeupLook extends MakeupLookBase {
  scope: 'pointMakeup';
  makeupArea: Exclude<MakeupArea, 'all'>;
}

export type MakeupLook = TotalMakeupLook | PointMakeupLook;

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

export interface MyPageProfileSummary {
  profile: UserProfile;
  beautyProfile: BeautyProfile;
  faceAnalysisReport: FaceAnalysisReport | null;
  makeupLooks: MakeupLook[];
  likedProducts: Product[];
}
