export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  personalColor: string;
  skinType: string;
  skinTone: string;
}

export interface AnalysisReportPreview {
  id: string;
  analyzedAt: string;
  title: string;
  personalColor: string;
  skinType: string;
  summary: string;
}

export interface MakeupStylePreview {
  id: string;
  title: string;
  imageUrl: string;
  isSaved: boolean;
}

export interface FavoriteProductPreview {
  id: string;
  brandName: string;
  productName: string;
  price: number;
  imageUrl: string;
  isLiked: boolean;
}

export interface UserPageData {
  profile: UserProfile;
  reports: AnalysisReportPreview[];
  makeupStyles: MakeupStylePreview[];
  favoriteProducts: FavoriteProductPreview[];
}
