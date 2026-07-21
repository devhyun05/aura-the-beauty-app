import type {ImageSourcePropType} from 'react-native';

export type ReferenceMakeupPhotoSource = 'album' | 'camera';

export type ReferenceMakeupPhoto = {
  id: string;
  title: string;
  referenceSource: ReferenceMakeupPhotoSource;
  imageSource: ImageSourcePropType;
  contentType?: string | null;
};

export type MakeupExtractionStepStatus = 'done' | 'active' | 'waiting';

export type MakeupExtractionStep = {
  id: string;
  label: string;
  status: MakeupExtractionStepStatus;
};

export type MakeupExtractionProgressPhase =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'analyzing'
  | 'products'
  | 'complete'
  | 'fallback';

export type MakeupExtractionProgressUpdate = {
  activeStepId: string;
  phase: MakeupExtractionProgressPhase;
  progress: number;
};

export type MakeupLookPalette = {
  id: string;
  label: string;
  hex: string;
  description: string;
};

export type MakeupLookPoint = {
  id: string;
  title: string;
  description: string;
};

export type ReferenceMakeupLookDnaMetric = {
  id: string;
  label: string;
  value: number;
  color: string;
};

export type ReferenceMakeupLookDna = {
  moodKeywords: string[];
  difficulty: string;
  keyAreas: string[];
  textureBalance: ReferenceMakeupLookDnaMetric[];
};

export type ReferenceMakeupAreaId =
  | 'skin'
  | 'eye'
  | 'brow'
  | 'cheek'
  | 'lip'
  | 'contour';

export type ReferenceMakeupProductCategory = 'base' | 'shadow' | 'liner' | 'cheek' | 'lip';

export type ReferenceMakeupAreaColor = {
  name: string;
  hex: string;
};

export type ReferenceMakeupAreaProduct = {
  id: string;
  brandName: string;
  productName: string;
  price: number;
  imageSource: ImageSourcePropType;
  imageUrl?: string | null;
  purchaseUrl?: string | null;
};

export type ReferenceMakeupAreaProductRecommendation = {
  category: ReferenceMakeupProductCategory;
  searchQuery: string;
  reason: string;
  product?: ReferenceMakeupAreaProduct;
};

export type ReferenceMakeupAreaGuide = {
  id: ReferenceMakeupAreaId;
  label: string;
  title: string;
  color: ReferenceMakeupAreaColor;
  texture: string;
  quickTip: string;
  analysis: string;
  howTo: string;
  professionalPoint: string;
  // 추천 부위별 스키마와 동일 계열의 상세 필드 (백엔드 v1 이상에서 제공, 없을 수 있음)
  goal?: string;
  placement?: string;
  technique?: string;
  reason?: string;
  avoid?: string[];
  steps?: Array<{order: number; instruction: string}>;
  productRecommendation: ReferenceMakeupAreaProductRecommendation;
};

export type ReferenceMakeupExtractionResult = {
  id: string;
  title: string;
  subtitle: string;
  imageSource: ImageSourcePropType;
  tags: string[];
  palette: MakeupLookPalette[];
  points: MakeupLookPoint[];
  accuracy: number;
  lookDna: ReferenceMakeupLookDna;
  areaGuides: ReferenceMakeupAreaGuide[];
};

export type MakeupLookAdjustmentTab = 'shape' | 'look';
export type MakeupLookAttributeGroup = 'color' | 'type' | 'texture';
export type MakeupRecipeTab = 'all' | 'eye' | 'lip' | 'cheek' | 'base';

export type ReferenceMakeupExtractionData = {
  photos: ReferenceMakeupPhoto[];
  loadingSteps: MakeupExtractionStep[];
  extractedMakeupLook: ReferenceMakeupExtractionResult;
  reportId?: string;
};

export type ReferenceMakeupExtractionReportHistoryItem = {
  createdAt: string;
  data: ReferenceMakeupExtractionData;
  photo: ReferenceMakeupPhoto;
  reportId: string;
};
