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
  | 'lens';

export type MakeupOptionGroupId =
  | 'makeupLook'
  | 'color'
  | 'type'
  | 'texture'
  | 'shape';

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

export type MakeupFilterPresetValues = {
  makeupArea: MakeupArea;
  colorId: string;
  typeId: string;
  textureId: string;
  shapeId: string;
  intensity: number;
  finish: string;
};

export type ARFilterLaunchSource =
  | 'homeServiceShortcut'
  | 'recommendedFilter'
  | 'savedLook';

export type RecommendedMakeupFilter = MakeupFilter & {
  headline: string;
  displayTitle: string;
  description: string;
  keywords: readonly string[];
  embeddingVector: readonly number[];
  matchScore: number;
  sourceImageId: string;
  categoryTags: readonly string[];
  presetValues: MakeupFilterPresetValues;
};

export type ARMakeupGuideData = {
  categories: readonly FilterCategory[];
  comparisonModes: readonly ComparisonModeOption[];
  makeupAreas: readonly MakeupAreaOption[];
  filters: readonly RecommendedMakeupFilter[];
};
