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
  category?: string | null;
  categoryId?: string | null;
  categoryTags?: unknown;
  colorOptions?: unknown;
  databaseId?: string | null;
  description?: string | null;
  displayTitle?: string | null;
  embeddingVector?: unknown;
  externalKey?: string | null;
  filterPayload?: unknown;
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
  const payload = decodeBackendFilterPayload(filter.filterPayload);
  const id = firstText(filter.externalKey, payload.externalKey, payload.id, filter.id);
  const fallback = mockRecommendedMakeupFilters.find(candidate => candidate.id === id);

  if (!id || !fallback) {
    return undefined;
  }

  return {
    ...fallback,
    categoryId:
      asFilterCategoryId(firstText(filter.categoryId, payload.categoryId, filter.category)) ??
      fallback.categoryId,
    categoryTags: asTextList(
      filter.categoryTags,
      asTextList(payload.categoryTags, fallback.categoryTags),
    ),
    colorOptions: asColorOptions(
      filter.colorOptions,
      asColorOptions(payload.colorOptions, fallback.colorOptions),
    ),
    description:
      firstText(
        filter.description,
        payload.description,
        filter.subtitle,
        payload.subtitle,
        fallback.description,
      ) ?? fallback.description,
    displayTitle:
      firstText(
        filter.displayTitle,
        payload.displayTitle,
        filter.title,
        payload.title,
        fallback.displayTitle,
      ) ?? fallback.displayTitle,
    embeddingVector: asNumberList(
      filter.embeddingVector,
      asNumberList(payload.embeddingVector, fallback.embeddingVector),
    ),
    headline: firstText(filter.headline, payload.headline, fallback.headline) ?? fallback.headline,
    imageSource: fallback.imageSource,
    intensityLabel:
      firstText(filter.intensityLabel, payload.intensityLabel, fallback.intensityLabel) ??
      fallback.intensityLabel,
    keywords: asTextList(filter.keywords, asTextList(payload.keywords, fallback.keywords)),
    makeupAreas: asMakeupAreas(
      filter.makeupAreas,
      asMakeupAreas(payload.makeupAreas, fallback.makeupAreas),
    ),
    matchScore: firstNumber(filter.matchScore, payload.matchScore, fallback.matchScore) ?? fallback.matchScore,
    presetValues: asPresetValues(
      filter.presetValues,
      asPresetValues(payload.presetValues, fallback.presetValues),
    ),
    sourceImageId: fallback.sourceImageId,
    subtitle:
      firstText(
        filter.subtitle,
        payload.subtitle,
        filter.description,
        payload.description,
        fallback.subtitle,
      ) ?? fallback.subtitle,
    textureOptions: asTextOptions(
      filter.textureOptions,
      asTextOptions(payload.textureOptions, fallback.textureOptions),
    ),
    title:
      firstText(filter.title, payload.title, filter.displayTitle, payload.displayTitle, fallback.title) ??
      fallback.title,
    typeOptions: asTextOptions(
      filter.typeOptions,
      asTextOptions(payload.typeOptions, fallback.typeOptions),
    ),
  };
}
function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find(value => Boolean(value?.trim()))?.trim();
}

function firstNumber(...values: Array<number | null | undefined>): number | undefined {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function decodeBackendFilterPayload(value: unknown): BackendRecommendedMakeupFilter {
  const decodedValue = typeof value === 'string' ? parseJsonObject(value) : value;

  if (!decodedValue || typeof decodedValue !== 'object' || Array.isArray(decodedValue)) {
    return {};
  }

  return decodedValue as BackendRecommendedMakeupFilter;
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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
