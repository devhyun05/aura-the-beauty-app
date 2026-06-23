import type {ImageSourcePropType} from 'react-native';

export type FilterExtractionSource = 'album' | 'camera';

export type FilterExtractionPhoto = {
  id: string;
  title: string;
  source: FilterExtractionSource;
  imageSource: ImageSourcePropType;
};

export type FilterExtractionStepStatus = 'done' | 'active' | 'waiting';

export type FilterExtractionStep = {
  id: string;
  label: string;
  status: FilterExtractionStepStatus;
};

export type FilterExtractionPalette = {
  id: string;
  label: string;
  hex: string;
  description: string;
};

export type FilterExtractionPoint = {
  id: string;
  title: string;
  description: string;
};

export type FilterExtractionResult = {
  id: string;
  title: string;
  subtitle: string;
  imageSource: ImageSourcePropType;
  tags: string[];
  palette: FilterExtractionPalette[];
  points: FilterExtractionPoint[];
  accuracy: number;
};

export type FilterAdjustmentTab = 'position' | 'style';
export type FilterStyleGroup = 'color' | 'type' | 'texture';
export type FilterFaceArea = 'all' | 'base' | 'eye' | 'lip' | 'contour';
export type FilterRecipeTab = 'all' | 'eye' | 'lip' | 'cheek' | 'base';

export type FilterExtractionData = {
  photos: FilterExtractionPhoto[];
  loadingSteps: FilterExtractionStep[];
  result: FilterExtractionResult;
};
