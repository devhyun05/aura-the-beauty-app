import {
  mockARMakeupGuideData,
  mockRecommendedMakeupFilters,
} from '../mocks/makeupGuide.mock';
import type {
  ARFilterLaunchSource,
  ARMakeupGuideData,
  FilterColorOption,
  ComparisonModeOption,
  FilterCategoryId,
  FilterTextOption,
  MakeupArea,
  MakeupFilterPresetValues,
  RecommendedMakeupFilter,
} from '../types/makeupGuide';
import type {MakeupLookPreview} from '../types/profile';
import {getBackendApiBaseUrl, requestBackendJson} from './backendApi';

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

type BackendRecommendedMakeupFilter = {
  categoryId?: string | null;
  categoryTags?: unknown;
  colorOptions?: unknown;
  databaseId?: string | null;
  description?: string | null;
  displayTitle?: string | null;
  embeddingVector?: unknown;
  externalKey?: string | null;
  headline?: string | null;
  id?: string | null;
  intensityLabel?: string | null;
  keywords?: unknown;
  makeupAreas?: unknown;
  matchScore?: number | null;
  presetValues?: Partial<MakeupFilterPresetValues> | null;
  subtitle?: string | null;
  textureOptions?: unknown;
  title?: string | null;
  typeOptions?: unknown;
};

type BackendRecommendedMakeupFiltersResponse = {
  filters?: BackendRecommendedMakeupFilter[] | null;
};

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

export async function getRecommendedMakeupFiltersFromApi(
  userProfileVector?: MakeupRecommendationInput,
): Promise<readonly RecommendedMakeupFilter[]> {
  const fallbackFilters = getRecommendedMakeupFilters(userProfileVector);

  if (!getBackendApiBaseUrl()) {
    return fallbackFilters;
  }

  try {
    const response = await requestBackendJson<BackendRecommendedMakeupFiltersResponse>(
      '/ar/filters?kind=recommendedMakeupFilter',
    );
    const apiFilters = (response.filters ?? [])
      .map(mapBackendRecommendedMakeupFilter)
      .filter(isRecommendedMakeupFilter);

    if (apiFilters.length === 0) {
      return fallbackFilters;
    }

    return sortMakeupFiltersByRecommendationScore(apiFilters, userProfileVector);
  } catch (error) {
    console.info('[aura:recommended-filters] data:fallback', {
      message: error instanceof Error ? error.message : String(error),
    });

    return fallbackFilters;
  }
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

export function mergeSavedAndLikedMakeupLooks({
  likedMakeupLooks,
  savedMakeupLook,
  savedMakeupLooks = [],
}: {
  likedMakeupLooks: readonly MakeupLookPreview[];
  savedMakeupLook?: MakeupLookPreview | null;
  savedMakeupLooks?: readonly MakeupLookPreview[];
}): readonly MakeupLookPreview[] {
  const flowSavedMakeupLooks =
    savedMakeupLooks.length > 0
      ? savedMakeupLooks
      : savedMakeupLook
        ? [savedMakeupLook]
        : [];
  const savedMakeupLookIds = new Set(
    flowSavedMakeupLooks.map(makeupLook => makeupLook.id),
  );

  return [
    ...flowSavedMakeupLooks,
    ...likedMakeupLooks.filter(makeupLook => !savedMakeupLookIds.has(makeupLook.id)),
  ];
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

function mapBackendRecommendedMakeupFilter(
  filter: BackendRecommendedMakeupFilter,
): RecommendedMakeupFilter | undefined {
  const id = firstText(filter.id, filter.externalKey);
  const fallback = mockRecommendedMakeupFilters.find(candidate => candidate.id === id);

  if (!id || !fallback) {
    return undefined;
  }

  return {
    ...fallback,
    categoryId: asFilterCategoryId(filter.categoryId) ?? fallback.categoryId,
    categoryTags: asTextList(filter.categoryTags, fallback.categoryTags),
    colorOptions: asColorOptions(filter.colorOptions, fallback.colorOptions),
    description: firstText(filter.description, filter.subtitle, fallback.description) ??
      fallback.description,
    displayTitle: firstText(filter.displayTitle, filter.title, fallback.displayTitle) ??
      fallback.displayTitle,
    embeddingVector: asNumberList(filter.embeddingVector, fallback.embeddingVector),
    headline: firstText(filter.headline, fallback.headline) ?? fallback.headline,
    imageSource: fallback.imageSource,
    intensityLabel: firstText(filter.intensityLabel, fallback.intensityLabel) ??
      fallback.intensityLabel,
    keywords: asTextList(filter.keywords, fallback.keywords),
    makeupAreas: asMakeupAreas(filter.makeupAreas, fallback.makeupAreas),
    matchScore: typeof filter.matchScore === 'number' ? filter.matchScore : fallback.matchScore,
    presetValues: asPresetValues(filter.presetValues, fallback.presetValues),
    sourceImageId: fallback.sourceImageId,
    subtitle: firstText(filter.subtitle, filter.description, fallback.subtitle) ??
      fallback.subtitle,
    textureOptions: asTextOptions(filter.textureOptions, fallback.textureOptions),
    title: firstText(filter.title, filter.displayTitle, fallback.title) ?? fallback.title,
    typeOptions: asTextOptions(filter.typeOptions, fallback.typeOptions),
  };
}

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find(value => Boolean(value?.trim()))?.trim();
}

function asTextList(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

  return items.length > 0 ? items : fallback;
}

function asNumberList(value: unknown, fallback: readonly number[]): readonly number[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is number => typeof item === 'number');

  return items.length > 0 ? items : fallback;
}

function asFilterCategoryId(value: string | null | undefined): FilterCategoryId | undefined {
  if (
    value === 'recommended' ||
    value === 'trend' ||
    value === 'personalColor' ||
    value === 'popular'
  ) {
    return value;
  }

  if (value === 'personal_color') {
    return 'personalColor';
  }

  return undefined;
}

function asMakeupAreas(value: unknown, fallback: readonly MakeupArea[]): readonly MakeupArea[] {
  const allowedAreas = new Set<MakeupArea>([
    'all',
    'base',
    'eye',
    'brow',
    'lip',
    'cheek',
    'contour',
  ]);

  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is MakeupArea => allowedAreas.has(item as MakeupArea));

  return items.length > 0 ? items : fallback;
}

function asColorOptions(
  value: unknown,
  fallback: readonly FilterColorOption[],
): readonly FilterColorOption[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is FilterColorOption =>
    Boolean(
      item &&
      typeof item === 'object' &&
      typeof (item as FilterColorOption).id === 'string' &&
      typeof (item as FilterColorOption).label === 'string' &&
      typeof (item as FilterColorOption).hex === 'string',
    ),
  );

  return items.length > 0 ? items : fallback;
}

function asTextOptions(
  value: unknown,
  fallback: readonly FilterTextOption[],
): readonly FilterTextOption[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is FilterTextOption =>
    Boolean(
      item &&
      typeof item === 'object' &&
      typeof (item as FilterTextOption).id === 'string' &&
      typeof (item as FilterTextOption).label === 'string',
    ),
  );

  return items.length > 0 ? items : fallback;
}

function asPresetValues(
  value: Partial<MakeupFilterPresetValues> | null | undefined,
  fallback: MakeupFilterPresetValues,
): MakeupFilterPresetValues {
  if (!value) {
    return fallback;
  }

  return {
    colorId: firstText(value.colorId, fallback.colorId) ?? fallback.colorId,
    finish: firstText(value.finish, fallback.finish) ?? fallback.finish,
    intensity: typeof value.intensity === 'number' ? value.intensity : fallback.intensity,
    makeupArea: value.makeupArea ?? fallback.makeupArea,
    shapeId: firstText(value.shapeId, fallback.shapeId) ?? fallback.shapeId,
    textureId: firstText(value.textureId, fallback.textureId) ?? fallback.textureId,
    typeId: firstText(value.typeId, fallback.typeId) ?? fallback.typeId,
  };
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
