import {mockARMakeupGuideData} from '../mocks/makeupGuide.mock';
import type {
  ARMakeupGuideData,
  FilterCategoryId,
  MakeupFilter,
} from '../types/makeupGuide';

export function getMockARMakeupGuideData(): ARMakeupGuideData {
  return mockARMakeupGuideData;
}

export function getDefaultMakeupFilter(
  data: ARMakeupGuideData = mockARMakeupGuideData,
): MakeupFilter {
  return data.filters[0];
}

export function getFiltersByCategory(
  categoryId: FilterCategoryId,
  data: ARMakeupGuideData = mockARMakeupGuideData,
): readonly MakeupFilter[] {
  return data.filters.filter(filter => filter.categoryId === categoryId);
}
