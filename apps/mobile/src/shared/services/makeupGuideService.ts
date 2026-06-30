import {
  mockARMakeupGuideData,
  mockRecommendedMakeupFilters,
} from '../mocks/makeupGuide.mock';
import type {
  ARFilterLaunchSource,
  ARMakeupGuideData,
  ComparisonModeOption,
  FilterCategoryId,
  RecommendedMakeupFilter,
} from '../types/makeupGuide';
import type {MakeupLookPreview} from '../types/profile';

export type MakeupRecommendationInput =
  | readonly number[]
  | {
      embeddingVector?: readonly number[];
      keywords?: readonly string[];
    }
  | undefined;

const DEFAULT_RECOMMENDATION_PROFILE = {
  embeddingVector: [0.76, 0.42, 0.62, 0.72, 0.78],
  keywords: ['쿨', '스모키', '브라운', '레드', '글로우', '트렌드'],
} as const;

export function getARMakeupGuideData(): ARMakeupGuideData {
  return mockARMakeupGuideData;
}

export function getDefaultMakeupFilter(
  data: ARMakeupGuideData = mockARMakeupGuideData,
): RecommendedMakeupFilter {
  return data.filters[0];
}

export function getDefaultComparisonMode(
  data: ARMakeupGuideData = mockARMakeupGuideData,
): ComparisonModeOption {
  return data.comparisonModes[0];
}

export function getFiltersByCategory(
  categoryId: FilterCategoryId,
  data: ARMakeupGuideData = mockARMakeupGuideData,
): readonly RecommendedMakeupFilter[] {
  return data.filters.filter(filter => filter.categoryId === categoryId);
}

export function getRecommendedMakeupFilters(
  userProfileVector?: MakeupRecommendationInput,
): readonly RecommendedMakeupFilter[] {
  return sortMakeupFiltersByRecommendationScore(
    mockRecommendedMakeupFilters,
    userProfileVector,
  );
}

export function sortMakeupFiltersByRecommendationScore(
  filters: readonly RecommendedMakeupFilter[],
  userProfileVector?: MakeupRecommendationInput,
): readonly RecommendedMakeupFilter[] {
  const recommendationSource =
    filters.length > 0 ? filters : mockRecommendedMakeupFilters;
  const profile = normalizeRecommendationInput(userProfileVector);

  return [...recommendationSource].sort((left, right) => {
    const leftScore = getRecommendationSortScore(left, profile);
    const rightScore = getRecommendationSortScore(right, profile);
    const keywordScoreDiff = rightScore.keywordMatchCount - leftScore.keywordMatchCount;

    if (keywordScoreDiff !== 0) {
      return keywordScoreDiff;
    }

    const vectorScoreDiff = rightScore.vectorSimilarity - leftScore.vectorSimilarity;

    if (vectorScoreDiff !== 0) {
      return vectorScoreDiff;
    }

    const matchScoreDiff = right.matchScore - left.matchScore;

    if (matchScoreDiff !== 0) {
      return matchScoreDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getRecommendedMakeupFilterById(
  filterId?: string | null,
): RecommendedMakeupFilter {
  return (
    mockRecommendedMakeupFilters.find(filter => filter.id === filterId) ??
    getRecommendedMakeupFilters()[0]
  );
}

export function mapMakeupFilterToSavedLook(
  filter: RecommendedMakeupFilter,
  timestamp = Date.now(),
): MakeupLookPreview {
  return {
    id: `saved-${filter.id}-${timestamp}`,
    imageSource: filter.imageSource,
    isSaved: true,
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: filter.presetValues.colorId,
      finish: filter.presetValues.finish,
      intensity: filter.presetValues.intensity,
      makeupArea: filter.presetValues.makeupArea,
      shapeId: filter.presetValues.shapeId,
      sourceFilterId: filter.id,
      textureId: filter.presetValues.textureId,
      typeId: filter.presetValues.typeId,
    },
    moodLabel: filter.headline,
    scope: 'totalMakeup',
    shortDescription: filter.description,
    title: filter.displayTitle,
  };
}

export function mapMakeupFilterToLikedLook(
  filter: RecommendedMakeupFilter,
): MakeupLookPreview {
  return {
    ...mapMakeupFilterToSavedLook(filter, 0),
    id: `liked-${filter.id}`,
  };
}

export function getLikedMakeupFilterLooks(
  filterIds: readonly string[],
): readonly MakeupLookPreview[] {
  return filterIds
    .map(filterId =>
      mockRecommendedMakeupFilters.find(filter => filter.id === filterId),
    )
    .filter(isRecommendedMakeupFilter)
    .map(mapMakeupFilterToLikedLook);
}

export function isRecommendedFilterLaunchSource(
  source: ARFilterLaunchSource | undefined,
): boolean {
  return source === 'recommendedFilter';
}

function isRecommendedMakeupFilter(
  filter: RecommendedMakeupFilter | undefined,
): filter is RecommendedMakeupFilter {
  return Boolean(filter);
}

function normalizeRecommendationInput(input: MakeupRecommendationInput) {
  if (isEmbeddingVector(input)) {
    return {
      embeddingVector: input,
      keywords: DEFAULT_RECOMMENDATION_PROFILE.keywords,
    };
  }

  return {
    embeddingVector:
      input?.embeddingVector ?? DEFAULT_RECOMMENDATION_PROFILE.embeddingVector,
    keywords: input?.keywords ?? DEFAULT_RECOMMENDATION_PROFILE.keywords,
  };
}

function isEmbeddingVector(
  input: MakeupRecommendationInput,
): input is readonly number[] {
  return Array.isArray(input);
}

function getRecommendationSortScore(
  filter: RecommendedMakeupFilter,
  profile: {
    embeddingVector: readonly number[];
    keywords: readonly string[];
  },
) {
  return {
    keywordMatchCount: getKeywordMatchCount(filter.keywords, profile.keywords),
    vectorSimilarity: getCosineSimilarity(
      filter.embeddingVector,
      profile.embeddingVector,
    ),
  };
}

function getKeywordMatchCount(
  filterKeywords: readonly string[],
  profileKeywords: readonly string[],
): number {
  const normalizedProfileKeywords = new Set(
    profileKeywords.map(keyword => keyword.toLowerCase()),
  );

  return filterKeywords.filter(keyword =>
    normalizedProfileKeywords.has(keyword.toLowerCase()),
  ).length;
}

export function getCosineSimilarity(
  leftVector: readonly number[],
  rightVector: readonly number[],
): number {
  const vectorLength = Math.min(leftVector.length, rightVector.length);

  if (vectorLength === 0) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < vectorLength; index += 1) {
    const leftValue = leftVector[index];
    const rightValue = rightVector[index];

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
