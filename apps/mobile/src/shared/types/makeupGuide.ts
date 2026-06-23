import type {ImageSourcePropType} from 'react-native';

export type GuideMode = 'basic' | 'half';

export type ComparisonMode = 'full' | 'left' | 'right';

export type FilterCategoryId = 'recommended' | 'trend' | 'personalColor' | 'popular';

export type FacePartId = 'all' | 'base' | 'eye' | 'lip' | 'contour';

export type StyleOptionGroupId = 'color' | 'type' | 'texture';

export type FilterCategory = {
  id: FilterCategoryId;
  label: string;
};

export type FacePart = {
  id: FacePartId;
  label: string;
};

export type FilterColorOption = {
  id: string;
  label: string;
  hex: string;
};

export type FilterTextOption = {
  id: string;
  label: string;
};

export type ComparisonModeOption = {
  id: ComparisonMode;
  label: string;
  description: string;
};

export type MakeupFilter = {
  id: string;
  imageSource: ImageSourcePropType;
  categoryId: FilterCategoryId;
  title: string;
  subtitle: string;
  intensityLabel: string;
  facePartIds: readonly FacePartId[];
  colorOptions: readonly FilterColorOption[];
  typeOptions: readonly FilterTextOption[];
  textureOptions: readonly FilterTextOption[];
};

export type ARMakeupGuideData = {
  categories: readonly FilterCategory[];
  comparisonModes: readonly ComparisonModeOption[];
  faceParts: readonly FacePart[];
  filters: readonly MakeupFilter[];
};
