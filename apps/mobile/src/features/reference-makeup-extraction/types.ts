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

export type MakeupExtractionResult = {
  id: string;
  title: string;
  subtitle: string;
  imageSource: ImageSourcePropType;
  tags: string[];
  palette: MakeupLookPalette[];
  points: MakeupLookPoint[];
  accuracy: number;
};

export type MakeupLookAdjustmentTab = 'position' | 'style';
export type MakeupLookStyleGroup = 'color' | 'type' | 'texture';
export type MakeupLookFaceArea = 'all' | 'base' | 'eye' | 'lip' | 'contour';
export type MakeupLookRecipeTab = 'all' | 'eye' | 'lip' | 'cheek' | 'base';

export type ReferenceMakeupExtractionData = {
  photos: ReferenceMakeupPhoto[];
  loadingSteps: MakeupExtractionStep[];
  extractedMakeupLook: MakeupExtractionResult;
};
