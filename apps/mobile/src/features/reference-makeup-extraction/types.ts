import type {ImageSourcePropType} from 'react-native';

import type {MakeupArea} from '../../shared/types/makeupGuide';

export type ReferenceMakeupPhotoSource = 'album' | 'camera';

export type ReferenceMakeupPhoto = {
  id: string;
  title: string;
  referenceSource: ReferenceMakeupPhotoSource;
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

export type ReferenceMakeupExtractionResult = {
  id: string;
  title: string;
  subtitle: string;
  imageSource: ImageSourcePropType;
  tags: string[];
  palette: MakeupLookPalette[];
  points: MakeupLookPoint[];
  accuracy: number;
};

export type MakeupLookAdjustmentTab = 'shape' | 'look';
export type MakeupLookAttributeGroup = 'color' | 'type' | 'texture';
export type MakeupRecipeTab = 'all' | 'eye' | 'lip' | 'cheek' | 'base';

export type ReferenceMakeupExtractionData = {
  photos: ReferenceMakeupPhoto[];
  loadingSteps: MakeupExtractionStep[];
  extractedMakeupLook: ReferenceMakeupExtractionResult;
};
