import type {ImageSourcePropType} from 'react-native';

export type GuideMode = 'basic' | 'half';

export type ComparisonMode = 'full' | 'left' | 'right';

export type FilterCategoryId = 'recommended' | 'trend' | 'personalColor' | 'popular';

export type MakeupArea =
  | 'all'
  | 'base'
  | 'eye'
  | 'brow'
  | 'lip'
  | 'cheek'
  | 'contour';

export type MakeupOptionGroupId = 'color' | 'type' | 'texture';

export type FilterCategory = {
  id: FilterCategoryId;
  label: string;
};

export type MakeupAreaOption = {
  id: MakeupArea;
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
  makeupAreas: readonly MakeupArea[];
  colorOptions: readonly FilterColorOption[];
  typeOptions: readonly FilterTextOption[];
  textureOptions: readonly FilterTextOption[];
};

export type ARMakeupGuideData = {
  categories: readonly FilterCategory[];
  comparisonModes: readonly ComparisonModeOption[];
  makeupAreas: readonly MakeupAreaOption[];
  filters: readonly MakeupFilter[];
};
