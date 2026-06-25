import type {ImageSourcePropType} from 'react-native';

export type ReferenceMakeupSource = 'album' | 'camera';

export type ReferenceMakeupPhoto = {
  id: string;
  title: string;
  source: ReferenceMakeupSource;
  imageSource: ImageSourcePropType;
};

export type MakeupExtractionStepStatus = 'done' | 'active' | 'waiting';

export type MakeupExtractionStep = {
  id: string;
  label: string;
  status: MakeupExtractionStepStatus;
};

export type MakeupStylePalette = {
  id: string;
  label: string;
  hex: string;
  description: string;
};

export type MakeupStylePoint = {
  id: string;
  title: string;
  description: string;
};

export type MakeupExtractionResult = {
  id: string;
  title: string;
  subtitle: string;
  imageSource: ImageSourcePropType;
  tags: string[];
  palette: MakeupStylePalette[];
  points: MakeupStylePoint[];
  accuracy: number;
};

export type MakeupStyleAdjustmentTab = 'position' | 'style';
export type MakeupStyleAttributeGroup = 'color' | 'type' | 'texture';
export type MakeupStyleFaceArea = 'all' | 'base' | 'eye' | 'lip' | 'contour';
export type MakeupStyleRecipeTab = 'all' | 'eye' | 'lip' | 'cheek' | 'base';

export type ReferenceMakeupExtractionData = {
  photos: ReferenceMakeupPhoto[];
  loadingSteps: MakeupExtractionStep[];
  extractedMakeupStyle: MakeupExtractionResult;
};
