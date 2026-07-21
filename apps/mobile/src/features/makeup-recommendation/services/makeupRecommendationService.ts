import {
  MAKEUP_LOOK_FIXTURES,
  MAKEUP_QUESTIONS,
  MAKEUP_SCENARIOS,
} from '../data/makeupRecommendationCatalog';
import {getMakeupRecommendationFixtureDiscovery} from '../data/makeupRecommendationV2Catalog';
import {
  BackendApiError,
  getBackendApiBaseUrl,
  isBackendNetworkError,
  isRequestAbortedError,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {
  adaptLegacyLookToV2,
  buildRecommendedAreaGuides,
  isMakeupRecommendationUuid,
  normalizeMakeupRecommendationDiscovery,
  type ApiAreaGuide,
} from './makeupRecommendationMappers';
import type {
  MakeupArea,
  MakeupLookRecommendation,
  MakeupRecommendationApplicationStep,
  MakeupQuestionDimension,
  MakeupRecommendationDiscovery,
  MakeupRecommendationAnswer,
  MakeupRecommendationCropBox,
  MakeupRecommendationCropRegions,
  MakeupRecommendationFitAssessment,
  MakeupRecommendationFitDimension,
  MakeupRecommendationFitDimensionKey,
  MakeupRecommendationFitEvidenceSource,
  MakeupRecommendationMatchAssessment,
  MakeupRecommendationMatchComponentKey,
  MakeupRecommendationGenerationSource,
  MakeupRecommendationImageAlignmentFrame,
  MakeupRecommendationImageAlignmentMetadata,
  MakeupRecommendationImageAlignmentPoint,
  MakeupRecommendationImageStatus,
  MakeupRecommendationLookMap,
  MakeupRecommendationProduct,
  MakeupRecommendationProfileGender,
  MakeupRecommendationQuestion,
  MakeupRecommendationReportHistoryItem,
  MakeupRecommendationRefinement,
  MakeupRecommendationSession,
  MakeupScenarioPrompt,
  MakeupScenarioTone,
  MakeupSituation,
  MakeupTrendKeyword,
  ProductRecommendationProvider,
} from '../types';

export type StartMakeupRecommendationInput = {
  prompt: string;
  scenarioId?: string;
  scenarioLabel?: string;
  useProfile: boolean;
  personalColor?: string;
};
export type StartMakeupRecommendationV2Input = {
  analysisReportId: string;
  discoverySource?: MakeupRecommendationDiscovery['source'];
  idempotencyKey?: string;
  situation?: MakeupSituation;
  keyword?: MakeupTrendKeyword;
  editorialPresetId?: string;
  editorialPresetLabel?: string;
  editorialPresetPrompt?: string;
  customSituationText?: string;
  customSituationLabel?: string;
  imageMode?: 'personalized' | 'generic';
  personalColor?: string;
  forceFixture?: boolean;
};

export const MAKEUP_RECOMMENDATION_GENERATION_TIMEOUT_MS = 45_000;

export class MakeupRecommendationRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MakeupRecommendationRetryableError';
  }
}

export function createMakeupRecommendationIdempotencyKey(): string {
  const requestId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = (Math.random() * 16) | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
  return 'makeup-v2-' + requestId;
}

const QUESTION_PRIORITY: readonly MakeupQuestionDimension[] = [
  'occasion',
  'mood',
  'boldness',
  'timeSkill',
];
const TONES: readonly MakeupScenarioTone[] = ['narrative', 'playful', 'premium'];
const POPULAR_SCENARIO_IDS = [
  'popular-daily',
  'popular-work-school',
  'popular-date',
  'popular-photo',
  'popular-important',
] as const;
type BackendQuestion = {
  id: string;
  title: string;
  options: Array<{id: string; label: string}>;
};
type BackendLook = {
  id?: string;
  role?: string;
  title?: string;
  summary?: string;
  reasons?: string[];
  appliedConditions?: string[];
  durationMinutes?: number;
  difficulty?: string;
  steps?: Array<{order?: number; area?: string; instruction?: string}>;
  products?: Array<{
    id?: string;
    area?: string;
    brandName?: string;
    productName?: string;
    shadeName?: string;
    reason?: string;
    price?: number;
    imageUrl?: string;
    purchaseUrl?: string;
    matchRate?: number;
  }>;
  areaGuides?: ApiAreaGuide[];
  imageStatus?: MakeupRecommendationImageStatus;
  imageError?: string;
  imageUrl?: string;
  lookMap?: unknown;
  fitAssessment?: unknown;
  imageAsset?: {
    provenance?: {
      alignmentMetadata?: unknown;
      cropMetadata?: unknown;
    };
  };
};
type BackendRecommendation = {
  looks?: BackendLook[];
  generationSource?: unknown;
  matchAssessment?: unknown;
} | string;

const MAKEUP_CROP_AREAS: readonly MakeupArea[] = ['base', 'brow', 'eye', 'cheek', 'lip'];

function mapBackendCropBox(value: unknown): MakeupRecommendationCropBox | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const box = value as Record<string, unknown>;
  const {left, top, right, bottom} = box;
  if (
    typeof left !== 'number'
    || typeof top !== 'number'
    || typeof right !== 'number'
    || typeof bottom !== 'number'
    || ![left, top, right, bottom].every(Number.isFinite)
    || left < 0
    || top < 0
    || right > 1
    || bottom > 1
    || right <= left
    || bottom <= top
  ) return null;
  return {left, top, right, bottom};
}

export function mapBackendCropRegions(value: unknown): MakeupRecommendationCropRegions | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const metadata = value as Record<string, unknown>;
  if (metadata.version !== 'makeup-face-crops-v1') return undefined;
  const source = metadata.areas;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const areas = source as Record<string, unknown>;
  const result: MakeupRecommendationCropRegions = {};
  for (const area of MAKEUP_CROP_AREAS) {
    const boxes = Array.isArray(areas[area])
      ? areas[area]
        .map(region => (
          region && typeof region === 'object' && !Array.isArray(region)
            ? mapBackendCropBox((region as Record<string, unknown>).box)
            : null
        ))
        .filter((box): box is MakeupRecommendationCropBox => Boolean(box))
      : [];
    if (boxes.length > 0) {
      result[area] = boxes.slice(0, area === 'base' || area === 'lip' ? 1 : 2);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function mapBackendAlignmentPoint(
  value: unknown,
): MakeupRecommendationImageAlignmentPoint | null {
  if (!isBackendRecord(value)) return null;
  const {x, y} = value;
  if (
    typeof x !== 'number'
    || typeof y !== 'number'
    || !Number.isFinite(x)
    || !Number.isFinite(y)
    || x < 0
    || x > 1
    || y < 0
    || y > 1
  ) return null;
  return {x, y};
}

function mapBackendAlignmentFrame(
  value: unknown,
): MakeupRecommendationImageAlignmentFrame | null {
  if (!isBackendRecord(value) || !isBackendRecord(value.imageSize)) return null;
  const {width, height} = value.imageSize;
  const faceBox = mapBackendCropBox(value.faceBox);
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
    || !faceBox
  ) return null;

  const eyeCenters = isBackendRecord(value.eyeCenters) ? value.eyeCenters : undefined;
  const imageLeft = mapBackendAlignmentPoint(eyeCenters?.imageLeft);
  const imageRight = mapBackendAlignmentPoint(eyeCenters?.imageRight);
  const hasOrderedEyePair = Boolean(imageLeft && imageRight && imageRight.x > imageLeft.x);
  const rollDeg = typeof value.rollDeg === 'number' && Number.isFinite(value.rollDeg)
    ? value.rollDeg
    : undefined;

  return {
    imageSize: {width, height},
    faceBox,
    ...(hasOrderedEyePair && imageLeft && imageRight
      ? {eyeCenters: {imageLeft, imageRight}}
      : {}),
    ...(rollDeg !== undefined ? {rollDeg} : {}),
  };
}

export function mapBackendImageAlignmentMetadata(
  value: unknown,
): MakeupRecommendationImageAlignmentMetadata | undefined {
  if (!isBackendRecord(value) || value.version !== 'makeup-face-alignment-v1') return undefined;
  const source = mapBackendAlignmentFrame(value.source);
  const generated = mapBackendAlignmentFrame(value.generated);
  if (!source || !generated) return undefined;
  return {version: 'makeup-face-alignment-v1', source, generated};
}
function cloneCropRegions(
  regions: MakeupRecommendationCropRegions | undefined,
): MakeupRecommendationCropRegions | undefined {
  if (!regions) return undefined;
  return Object.fromEntries(
    MAKEUP_CROP_AREAS.flatMap(area => (
      regions[area]?.length ? [[area, regions[area].map(box => ({...box}))]] : []
    )),
  ) as MakeupRecommendationCropRegions;
}

function cloneImageAlignmentMetadata(
  metadata: MakeupRecommendationImageAlignmentMetadata | undefined,
): MakeupRecommendationImageAlignmentMetadata | undefined {
  if (!metadata) return undefined;
  const cloneFrame = (
    frame: MakeupRecommendationImageAlignmentFrame,
  ): MakeupRecommendationImageAlignmentFrame => ({
    imageSize: {...frame.imageSize},
    faceBox: {...frame.faceBox},
    ...(frame.eyeCenters
      ? {
        eyeCenters: {
          imageLeft: {...frame.eyeCenters.imageLeft},
          imageRight: {...frame.eyeCenters.imageRight},
        },
      }
      : {}),
    ...(frame.rollDeg !== undefined ? {rollDeg: frame.rollDeg} : {}),
  });
  return {
    version: 'makeup-face-alignment-v1',
    source: cloneFrame(metadata.source),
    generated: cloneFrame(metadata.generated),
  };
}
type BackendRecommendationContextSnapshot = {
  analysisReport?: unknown;
  profile?: unknown;
  selection?: unknown;
};
type BackendRecommendationReport = {
  id: string;
  scenarioText?: unknown;
  scenarioLabel?: unknown;
  recommendation: BackendRecommendation;
  questions?: unknown;
  answers?: unknown;
  imageStatus: MakeupRecommendationImageStatus;
  imageUrl?: string;
  previewImageUrl?: unknown;
  previewImageStatus?: unknown;
  profileGender?: unknown;
  personalColor?: unknown;
  imageError?: string;
  sourceAnalysisReportId?: string;
  additionalConstraints?: unknown;
  situation?: unknown;
  keyword?: unknown;
  editorialPresetId?: unknown;
  customSituationText?: unknown;
  customSituationLabel?: unknown;
  createdAt?: string;
  contextSnapshot?: BackendRecommendationContextSnapshot | string;
};

function normalizeBackendProfileGender(
  value: unknown,
): MakeupRecommendationProfileGender | undefined {
  return value === 'female' || value === 'male' || value === 'unspecified'
    ? value
    : undefined;
}

function parseBackendReportContextSnapshot(
  value: BackendRecommendationReport['contextSnapshot'],
): BackendRecommendationContextSnapshot | undefined {
  if (typeof value !== 'string') return value;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as BackendRecommendationContextSnapshot)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeOptionalBackendText(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function isBackendRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const FIT_DIMENSION_KEYS: readonly MakeupRecommendationFitDimensionKey[] = [
  'situation',
  'preference',
  'personalColor',
  'faceStructure',
  'skinCompatibility',
  'lookCoherence',
];
const FIT_EVIDENCE_SOURCES = new Set<MakeupRecommendationFitEvidenceSource>([
  'situation',
  'preference',
  'personal_color',
  'face_structure',
  'skin_type',
  'look_coherence',
]);

function mapBackendGenerationSource(
  value: unknown,
): MakeupRecommendationGenerationSource | undefined {
  return value === 'claude' || value === 'deterministic_fallback'
    ? value
    : undefined;
}

function isBoundedFitScore(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= 100;
}

function mapBackendLookMap(value: unknown): MakeupRecommendationLookMap | undefined {
  if (!isBackendRecord(value) || value.version !== 'makeup-look-map-v1') return undefined;
  if (
    !isBoundedFitScore(value.naturalityToPersonality)
    || !isBoundedFitScore(value.casualToGlam)
  ) return undefined;
  const rationale = normalizeOptionalBackendText(value.rationale);
  if (!rationale) return undefined;
  return {
    version: 'makeup-look-map-v1',
    naturalityToPersonality: value.naturalityToPersonality,
    casualToGlam: value.casualToGlam,
    rationale,
  };
}

function mapBackendFitDimension(value: unknown): MakeupRecommendationFitDimension | null {
  if (!isBackendRecord(value) || typeof value.available !== 'boolean') return null;
  const reason = normalizeOptionalBackendText(value.reason);
  if (!reason) return null;
  if (value.available) {
    return isBoundedFitScore(value.score)
      ? {available: true, score: value.score, reason}
      : null;
  }
  return value.score === null || value.score === undefined
    ? {available: false, reason}
    : null;
}

function mapBackendFitAssessment(
  value: unknown,
): MakeupRecommendationFitAssessment | undefined {
  if (
    !isBackendRecord(value)
    || value.scoringVersion !== 'makeup-fit-v1'
    || !isBoundedFitScore(value.overallScore)
    || !Array.isArray(value.evidence)
  ) return undefined;
  const rawDimensions = value.dimensions;
  if (!isBackendRecord(rawDimensions)) return undefined;

  const dimensionEntries = FIT_DIMENSION_KEYS.map(key => {
    const dimension = mapBackendFitDimension(rawDimensions[key]);
    return dimension ? ([key, dimension] as const) : null;
  });
  if (dimensionEntries.some(entry => entry === null)) return undefined;
  const dimensions = Object.fromEntries(
    dimensionEntries.filter(
      (entry): entry is readonly [MakeupRecommendationFitDimensionKey, MakeupRecommendationFitDimension] => (
        entry !== null
      ),
    ),
  ) as Record<MakeupRecommendationFitDimensionKey, MakeupRecommendationFitDimension>;

  const evidence = value.evidence.flatMap(item => {
    if (!isBackendRecord(item) || !FIT_EVIDENCE_SOURCES.has(item.source as MakeupRecommendationFitEvidenceSource)) {
      return [];
    }
    const label = normalizeOptionalBackendText(item.label);
    const reason = normalizeOptionalBackendText(item.reason);
    if (!label || !reason) return [];
    return [{
      source: item.source as MakeupRecommendationFitEvidenceSource,
      label,
      reason,
    }];
  });
  if (evidence.length === 0 || evidence.length !== value.evidence.length) return undefined;

  return {
    scoringVersion: 'makeup-fit-v1',
    overallScore: value.overallScore,
    dimensions,
    evidence,
  };
}

const MATCH_COMPONENT_KEYS = [
  'preference',
  'situation',
  'colorHarmony',
  'skinFinish',
] as const satisfies readonly MakeupRecommendationMatchComponentKey[];
const MATCH_COMPONENT_WEIGHTS: Record<MakeupRecommendationMatchComponentKey, number> = {
  preference: 35,
  situation: 25,
  colorHarmony: 25,
  skinFinish: 15,
};

function mapBackendMatchAssessment(
  value: unknown,
): MakeupRecommendationMatchAssessment | undefined {
  if (
    !isBackendRecord(value)
    || value.version !== 'makeup-match-v1'
    || !isBoundedFitScore(value.evaluatedWeight)
    || !Array.isArray(value.components)
    || !Array.isArray(value.reflectedInputs)
  ) return undefined;
  const generationSource = mapBackendGenerationSource(value.generationSource);
  const hasScore = isBoundedFitScore(value.score);
  if (!generationSource || (value.score !== null && !hasScore)) return undefined;

  const components = value.components.flatMap<MakeupRecommendationMatchAssessment['components'][number]>(item => {
    if (
      !isBackendRecord(item)
      || !MATCH_COMPONENT_KEYS.includes(item.key as MakeupRecommendationMatchComponentKey)
      || typeof item.evaluated !== 'boolean'
      || !isBoundedFitScore(item.weight)
      || !Array.isArray(item.evidence)
    ) return [];
    const key = item.key as MakeupRecommendationMatchComponentKey;
    if (item.weight !== MATCH_COMPONENT_WEIGHTS[key]) return [];
    const reason = normalizeOptionalBackendText(item.reason);
    const evidence = item.evidence.flatMap(entry => {
      const normalized = normalizeOptionalBackendText(entry);
      return normalized ? [normalized] : [];
    });
    if (!reason || evidence.length !== item.evidence.length) return [];
    if (item.evaluated ? !isBoundedFitScore(item.score) : item.score !== null) return [];
    return [{
      key,
      weight: item.weight,
      score: item.evaluated ? item.score as number : null,
      evaluated: item.evaluated,
      reason,
      evidence,
    }];
  });
  if (
    components.length !== MATCH_COMPONENT_KEYS.length
    || components.some((component, index) => component.key !== MATCH_COMPONENT_KEYS[index])
  ) return undefined;

  const evaluatedWeight = components
    .filter(component => component.evaluated)
    .reduce((total, component) => total + component.weight, 0);
  const evaluatedCount = components.filter(component => component.evaluated).length;
  const enoughEvidence = (
    evaluatedWeight >= 60
    && evaluatedCount >= 2
    && components.some(component => (
      component.evaluated
      && (component.key === 'preference' || component.key === 'situation')
    ))
  );
  if (
    evaluatedWeight !== value.evaluatedWeight
    || enoughEvidence !== hasScore
  ) return undefined;

  const reflectedInputs = value.reflectedInputs.flatMap<MakeupRecommendationMatchAssessment['reflectedInputs'][number]>(item => {
    if (!isBackendRecord(item)) return [];
    const sourceType = normalizeOptionalBackendText(item.sourceType);
    const sourceId = normalizeOptionalBackendText(item.sourceId);
    const inputLabel = normalizeOptionalBackendText(item.inputLabel);
    const decisionPath = normalizeOptionalBackendText(item.decisionPath);
    const reflectedValue = normalizeOptionalBackendText(item.reflectedValue);
    return sourceType && sourceId && inputLabel && decisionPath && reflectedValue
      ? [{sourceType, sourceId, inputLabel, decisionPath, reflectedValue}]
      : [];
  });
  if (reflectedInputs.length !== value.reflectedInputs.length) return undefined;

  return {
    version: 'makeup-match-v1',
    score: hasScore ? value.score as number : null,
    evaluatedWeight,
    components,
    reflectedInputs,
    generationSource,
  };
}

function parseBackendReportArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBackendStringArray(value: unknown): string[] {
  return parseBackendReportArray(value).filter((item): item is string => typeof item === 'string');
}

function mapBackendQuestion(value: unknown): BackendQuestion | null {
  if (!isBackendRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.title !== 'string') return null;
  const options = parseBackendReportArray(value.options).flatMap(option => {
    if (!isBackendRecord(option)) return [];
    if (typeof option.id !== 'string' || typeof option.label !== 'string') return [];
    return [{id: option.id, label: option.label}];
  });
  return {id: value.id, title: value.title, options};
}

function mapBackendAnswers(value: unknown): MakeupRecommendationAnswer[] {
  return parseBackendReportArray(value).flatMap(answer => {
    if (!isBackendRecord(answer) || typeof answer.questionId !== 'string' || !answer.questionId.trim()) {
      return [];
    }
    if (answer.optionId !== undefined && typeof answer.optionId !== 'string') return [];
    if (answer.freeText !== undefined && typeof answer.freeText !== 'string') return [];
    if (answer.additionalConstraints !== undefined && typeof answer.additionalConstraints !== 'string') return [];
    return [{
      questionId: answer.questionId,
      ...(typeof answer.optionId === 'string' ? {optionId: answer.optionId} : {}),
      ...(typeof answer.freeText === 'string' ? {freeText: answer.freeText} : {}),
      ...(typeof answer.additionalConstraints === 'string'
        ? {additionalConstraints: answer.additionalConstraints}
        : {}),
    }];
  });
}

const BACKEND_SITUATION_KEYS = new Set<MakeupSituation['key']>([
  'daily',
  'work',
  'date',
  'social',
  'formal_event',
  'travel_outdoor',
  'camera_content',
  'festival_performance',
]);

function mapBackendSituationSummary(
  value: unknown,
): Pick<MakeupSituation, 'id' | 'key' | 'label' | 'description'> | undefined {
  if (!isBackendRecord(value)) return undefined;
  if (
    typeof value.id !== 'string'
    || typeof value.key !== 'string'
    || !BACKEND_SITUATION_KEYS.has(value.key as MakeupSituation['key'])
    || typeof value.label !== 'string'
    || typeof value.description !== 'string'
  ) return undefined;
  return {
    id: value.id,
    key: value.key as MakeupSituation['key'],
    label: value.label,
    description: value.description,
  };
}

function mapBackendKeyword(value: unknown): MakeupTrendKeyword | undefined {
  if (!isBackendRecord(value)) return undefined;
  if (
    typeof value.id !== 'string'
    || typeof value.label !== 'string'
    || (value.kind !== 'curated' && value.kind !== 'steady' && value.kind !== 'trend')
    || (
      value.badge !== 'TREND_K_BEAUTY_2026'
      && value.badge !== 'TREND_GLOBAL_SS26'
      && value.badge !== 'STEADY'
      && value.badge !== 'CURATED'
    )
    || typeof value.seedPrompt !== 'string'
  ) return undefined;
  const marketScope = normalizeOptionalBackendText(value.marketScope);
  const sourceName = normalizeOptionalBackendText(value.sourceName);
  const sourceUrl = normalizeOptionalBackendText(value.sourceUrl);
  const sourcePublishedAt = normalizeOptionalBackendText(value.sourcePublishedAt);
  const asOf = normalizeOptionalBackendText(value.asOf);
  const expiresAt = normalizeOptionalBackendText(value.expiresAt);
  return {
    id: value.id,
    label: value.label,
    kind: value.kind,
    badge: value.badge,
    seedPrompt: value.seedPrompt,
    tags: normalizeBackendStringArray(value.tags),
    ...(marketScope ? {marketScope} : {}),
    ...(sourceName ? {sourceName} : {}),
    ...(sourceUrl ? {sourceUrl} : {}),
    ...(sourcePublishedAt ? {sourcePublishedAt} : {}),
    ...(asOf ? {asOf} : {}),
    ...(expiresAt ? {expiresAt} : {}),
    ...(value.confidence === 'A' || value.confidence === 'B' ? {confidence: value.confidence} : {}),
  };
}

function mapBackendLookSteps(value: unknown): NonNullable<BackendLook['steps']> {
  return parseBackendReportArray(value).flatMap(step => {
    if (!isBackendRecord(step)) return [];
    if (step.instruction !== undefined && typeof step.instruction !== 'string') return [];
    if (step.area !== undefined && typeof step.area !== 'string') return [];
    if (step.order !== undefined && (typeof step.order !== 'number' || !Number.isFinite(step.order))) return [];
    return [{
      ...(typeof step.order === 'number' ? {order: step.order} : {}),
      ...(typeof step.area === 'string' ? {area: step.area} : {}),
      ...(typeof step.instruction === 'string' ? {instruction: step.instruction} : {}),
    }];
  });
}

function mapBackendLookProducts(value: unknown): NonNullable<BackendLook['products']> {
  return parseBackendReportArray(value).flatMap(product => {
    if (!isBackendRecord(product)) return [];
    const stringKeys = [
      'id',
      'area',
      'brandName',
      'productName',
      'shadeName',
      'reason',
      'imageUrl',
      'purchaseUrl',
    ] as const;
    if (stringKeys.some(key => product[key] !== undefined && typeof product[key] !== 'string')) return [];
    if (product.price !== undefined && (typeof product.price !== 'number' || !Number.isFinite(product.price))) return [];
    if (product.matchRate !== undefined && (typeof product.matchRate !== 'number' || !Number.isFinite(product.matchRate))) return [];
    return [{
      ...(typeof product.id === 'string' ? {id: product.id} : {}),
      ...(typeof product.area === 'string' ? {area: product.area} : {}),
      ...(typeof product.brandName === 'string' ? {brandName: product.brandName} : {}),
      ...(typeof product.productName === 'string' ? {productName: product.productName} : {}),
      ...(typeof product.shadeName === 'string' ? {shadeName: product.shadeName} : {}),
      ...(typeof product.reason === 'string' ? {reason: product.reason} : {}),
      ...(typeof product.price === 'number' ? {price: product.price} : {}),
      ...(typeof product.imageUrl === 'string' ? {imageUrl: product.imageUrl} : {}),
      ...(typeof product.purchaseUrl === 'string' ? {purchaseUrl: product.purchaseUrl} : {}),
      ...(typeof product.matchRate === 'number' ? {matchRate: product.matchRate} : {}),
    }];
  });
}

function mapBackendGuideColor(value: unknown): {name?: string; hex?: string} | undefined {
  if (!isBackendRecord(value)) return undefined;
  if (value.name !== undefined && typeof value.name !== 'string') return undefined;
  if (value.hex !== undefined && typeof value.hex !== 'string') return undefined;
  return {
    ...(typeof value.name === 'string' ? {name: value.name} : {}),
    ...(typeof value.hex === 'string' ? {hex: value.hex} : {}),
  };
}

function getBackendRecipeField(
  record: Record<string, unknown>,
  camelCaseKey: string,
  snakeCaseKey: string,
): unknown {
  return record[camelCaseKey] ?? record[snakeCaseKey];
}

function mapBackendApplicationPlan(
  value: unknown,
): NonNullable<ApiAreaGuide['applicationPlan']> | undefined {
  if (!isBackendRecord(value)) return undefined;
  const recipeVersion = normalizeOptionalBackendText(
    getBackendRecipeField(value, 'recipeVersion', 'recipe_version'),
  );
  const estimatedMinutes = getBackendRecipeField(
    value,
    'estimatedMinutes',
    'estimated_minutes',
  );
  const rawCompletionCriteria = parseBackendReportArray(
    getBackendRecipeField(value, 'completionCriteria', 'completion_criteria'),
  );
  const rawSteps = parseBackendReportArray(value.steps);
  if (
    recipeVersion !== 'makeup-application-v1'
    || typeof estimatedMinutes !== 'number'
    || !Number.isInteger(estimatedMinutes)
    || estimatedMinutes < 1
    || estimatedMinutes > 60
    || rawCompletionCriteria.length === 0
    || rawCompletionCriteria.length > 4
    || rawCompletionCriteria.some(item => typeof item !== 'string' || !item.trim())
    || new Set(rawCompletionCriteria.map(item => (item as string).trim())).size !== rawCompletionCriteria.length
    || rawSteps.length < 2
    || rawSteps.length > 8
  ) return undefined;

  const completionCriteria = rawCompletionCriteria.map(item => (item as string).trim());
  const seenOrders = new Set<number>();
  const steps: MakeupRecommendationApplicationStep[] = [];
  for (const rawStep of rawSteps) {
    if (!isBackendRecord(rawStep)) return undefined;
    const order = rawStep.order;
    const title = normalizeOptionalBackendText(rawStep.title);
    const productType = normalizeOptionalBackendText(
      getBackendRecipeField(rawStep, 'productType', 'product_type'),
    );
    const tool = normalizeOptionalBackendText(rawStep.tool);
    const amount = normalizeOptionalBackendText(rawStep.amount);
    const placement = normalizeOptionalBackendText(rawStep.placement);
    const technique = normalizeOptionalBackendText(rawStep.technique);
    const blending = normalizeOptionalBackendText(rawStep.blending);
    const finishCheck = normalizeOptionalBackendText(
      getBackendRecipeField(rawStep, 'finishCheck', 'finish_check'),
    );
    const rawColors = parseBackendReportArray(rawStep.colors);
    if (
      typeof order !== 'number'
      || !Number.isInteger(order)
      || order < 1
      || seenOrders.has(order)
      || !title
      || !productType
      || !tool
      || !amount
      || !placement
      || !technique
      || !blending
      || !finishCheck
      || rawColors.length === 0
      || rawColors.length > 4
    ) return undefined;

    const colors: MakeupRecommendationApplicationStep['colors'] = [];
    for (const rawColor of rawColors) {
      if (!isBackendRecord(rawColor)) return undefined;
      const role = normalizeOptionalBackendText(rawColor.role);
      const name = normalizeOptionalBackendText(rawColor.name);
      const hex = normalizeOptionalBackendText(rawColor.hex)?.toUpperCase();
      if (!role || !name || !hex || !/^#[0-9A-F]{6}$/.test(hex)) return undefined;
      colors.push({role, name, hex});
    }

    seenOrders.add(order);
    steps.push({
      order,
      title,
      productType,
      tool,
      colors,
      amount,
      placement,
      technique,
      blending,
      finishCheck,
    });
  }

  const sortedSteps = steps.sort((left, right) => left.order - right.order);
  if (sortedSteps.some((step, index) => step.order !== index + 1)) return undefined;

  return {
    recipeVersion: 'makeup-application-v1',
    estimatedMinutes,
    completionCriteria,
    steps: sortedSteps,
  };
}
function mapBackendAreaGuides(value: unknown): ApiAreaGuide[] {
  return parseBackendReportArray(value).flatMap(guide => {
    if (!isBackendRecord(guide)) return [];
    const area = normalizeOptionalBackendText(guide.area);
    const applicationOrderValue = getBackendRecipeField(
      guide,
      'applicationOrder',
      'application_order',
    );
    const applicationOrder = typeof applicationOrderValue === 'number'
      && Number.isInteger(applicationOrderValue)
      && applicationOrderValue >= 1
      && applicationOrderValue <= 5
      ? applicationOrderValue
      : undefined;
    const applicationPlan = mapBackendApplicationPlan(
      getBackendRecipeField(guide, 'applicationPlan', 'application_plan'),
    );
    const label = normalizeOptionalBackendText(guide.label);
    const goal = normalizeOptionalBackendText(guide.goal);
    const texture = normalizeOptionalBackendText(guide.texture);
    const placement = normalizeOptionalBackendText(guide.placement);
    const technique = normalizeOptionalBackendText(guide.technique);
    const reason = normalizeOptionalBackendText(guide.reason);
    const color = mapBackendGuideColor(guide.color);
    const colors = parseBackendReportArray(guide.colors).flatMap(item => {
      const mapped = mapBackendGuideColor(item);
      return mapped ? [mapped] : [];
    });
    const steps = parseBackendReportArray(guide.steps).flatMap<NonNullable<ApiAreaGuide['steps']>[number]>((step, index) => {
      if (typeof step === 'string') return [step];
      if (!isBackendRecord(step)) return [];
      if (step.instruction !== undefined && typeof step.instruction !== 'string') return [];
      if (step.order !== undefined && (typeof step.order !== 'number' || !Number.isFinite(step.order))) return [];
      return [{
        ...(typeof step.order === 'number' ? {order: step.order} : {order: index + 1}),
        ...(typeof step.instruction === 'string' ? {instruction: step.instruction} : {}),
      }];
    });
    const avoid = typeof guide.avoid === 'string'
      ? guide.avoid
      : normalizeBackendStringArray(guide.avoid);
    const products: NonNullable<ApiAreaGuide['products']> = mapBackendLookProducts(guide.products).map(product => {
      const {area: productArea, ...rest} = product;
      return {
        ...rest,
        ...(typeof productArea === 'string' ? {area: normalizedArea(productArea)} : {}),
      };
    });
    return [{
      ...(area ? {area} : {}),
      ...(applicationOrder && applicationPlan ? {applicationOrder, applicationPlan} : {}),
      ...(label ? {label} : {}),
      ...(goal ? {goal} : {}),
      ...(color ? {color} : {}),
      ...(guide.colors !== undefined ? {colors} : {}),
      ...(texture ? {texture} : {}),
      ...(placement ? {placement} : {}),
      ...(technique ? {technique} : {}),
      ...(reason ? {reason} : {}),
      ...(guide.avoid !== undefined ? {avoid} : {}),
      ...(guide.steps !== undefined ? {steps} : {}),
      ...(guide.products !== undefined ? {products} : {}),
      ...(typeof guide.arSupported === 'boolean' ? {arSupported: guide.arSupported} : {}),
    }];
  });
}

function isBackendLook(value: unknown): value is BackendLook {
  if (!isBackendRecord(value)) return false;
  const stringKeys = ['id', 'role', 'title', 'summary', 'difficulty', 'imageError', 'imageUrl'] as const;
  if (stringKeys.some(key => value[key] !== undefined && typeof value[key] !== 'string')) return false;
  if (
    value.durationMinutes !== undefined
    && (typeof value.durationMinutes !== 'number' || !Number.isFinite(value.durationMinutes))
  ) return false;
  if (
    value.imageStatus !== undefined
    && value.imageStatus !== 'pending'
    && value.imageStatus !== 'processing'
    && value.imageStatus !== 'partial'
    && value.imageStatus !== 'completed'
    && value.imageStatus !== 'failed'
  ) return false;
  if (value.imageAsset !== undefined && !isBackendRecord(value.imageAsset)) return false;
  const imageAsset = isBackendRecord(value.imageAsset) ? value.imageAsset : undefined;
  if (imageAsset?.provenance !== undefined && !isBackendRecord(imageAsset.provenance)) return false;
  return true;
}

function getBackendLookCropMetadata(look: BackendLook): unknown {
  return look.imageAsset?.provenance?.cropMetadata;
}

function getBackendLookAlignmentMetadata(look: BackendLook): unknown {
  return look.imageAsset?.provenance?.alignmentMetadata;
}

function isMakeupRecommendationImageStatus(
  value: unknown,
): value is MakeupRecommendationImageStatus {
  return value === 'pending'
    || value === 'processing'
    || value === 'partial'
    || value === 'completed'
    || value === 'failed';
}

function isBackendRecommendationReport(value: unknown): value is BackendRecommendationReport {
  if (!isBackendRecord(value) || typeof value.id !== 'string') return false;
  if (typeof value.recommendation !== 'string' && !isBackendRecord(value.recommendation)) return false;
  if (!isMakeupRecommendationImageStatus(value.imageStatus)) return false;
  if (value.previewImageUrl != null && typeof value.previewImageUrl !== 'string') return false;
  return value.previewImageStatus == null
    || isMakeupRecommendationImageStatus(value.previewImageStatus);
}

function getBackendReportProfileGender(
  report: BackendRecommendationReport,
): MakeupRecommendationProfileGender | undefined {
  const contextSnapshot = parseBackendReportContextSnapshot(report.contextSnapshot);
  const profile = isBackendRecord(contextSnapshot?.profile) ? contextSnapshot.profile : undefined;
  return normalizeBackendProfileGender(report.profileGender)
    ?? normalizeBackendProfileGender(profile?.gender);
}

function ensureToneCoverage(scenarios: MakeupScenarioPrompt[]): MakeupScenarioPrompt[] {
  const selected = scenarios.slice(0, 6);

  TONES.forEach(tone => {
    if (selected.some(item => item.tone === tone)) return;

    const replacement = scenarios.slice(6).find(item => item.tone === tone);
    const replaceIndex = selected.findLastIndex(item =>
      selected.filter(candidate => candidate.tone === item.tone).length > 1,
    );
    if (replacement && replaceIndex >= 0) selected[replaceIndex] = replacement;
  });

  return selected;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items];
  let state = (Math.abs(Math.floor(seed)) || 1) >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function getPopularMakeupScenarios(): MakeupScenarioPrompt[] {
  return POPULAR_SCENARIO_IDS.map(id => MAKEUP_SCENARIOS.find(item => item.id === id)).filter(
    (item): item is MakeupScenarioPrompt => Boolean(item),
  );
}

export function getMakeupScenarioSet({seed}: {seed: number}): MakeupScenarioPrompt[] {
  const popularIds = new Set<string>(POPULAR_SCENARIO_IDS);
  const shuffled = seededShuffle(MAKEUP_SCENARIOS.filter(item => !popularIds.has(item.id)), seed);
  const firstSix = ensureToneCoverage(shuffled);
  return [
    ...firstSix,
    ...shuffled.filter(item => !firstSix.some(first => first.id === item.id)),
  ];
}

function inferKnownDimensions(prompt: string): MakeupQuestionDimension[] {
  const normalized = prompt.toLowerCase();
  const known: MakeupQuestionDimension[] = [];

  if (/출근|결혼식|데이트|약속|사진|콘서트|페스티벌|야구장/.test(normalized)) known.push('occasion');
  if (/우아|힙|차분|생기|무드|분위기/.test(normalized)) known.push('mood');
  if (/과감|자연스럽|또렷|선명/.test(normalized)) known.push('boldness');
  if (/5분|빠르|최소 단계/.test(normalized)) known.push('timeSkill');

  return known;
}

function sessionId(input: StartMakeupRecommendationInput): string {
  const source = input.scenarioId ?? input.prompt.trim().toLowerCase();
  const stable = source.replace(/[^a-z0-9ㄱ-힝]+/g, '-').replace(/^-|-$/g, '');
  return `makeup-recommendation-${stable || 'custom'}`;
}

function buildQuestionSession(
  input: StartMakeupRecommendationInput,
  questions: MakeupRecommendationQuestion[],
): MakeupRecommendationSession {
  return {
    id: sessionId(input),
    phase: 'question',
    prompt: input.prompt.trim(),
    scenarioLabel: input.scenarioLabel?.trim() || undefined,
    questions,
    currentQuestionIndex: 0,
    answers: [],
    results: [],
    useProfile: input.useProfile,
    personalColor: input.useProfile ? input.personalColor?.trim() || undefined : undefined,
  };
}

function selectedAnswerLabels(
  questions: MakeupRecommendationQuestion[],
  answers: MakeupRecommendationAnswer[],
): string[] {
  return answers.flatMap(answer => {
    const question = questions.find(item => item.id === answer.questionId);
    const option = question?.options.find(item => item.id === answer.optionId);
    return option ? [option.label] : [];
  });
}

function buildAppliedConditions(
  session: MakeupRecommendationSession,
  answers: MakeupRecommendationAnswer[],
  additionalConstraints?: string,
): string[] {
  const freeText = answers
    .map(answer => answer.freeText?.trim())
    .filter((value): value is string => Boolean(value))
    .reverse();
  const directConditions = [additionalConstraints, ...freeText]
    .filter((value): value is string => Boolean(value));
  const inferredConditions = [
    ...selectedAnswerLabels(session.questions, answers),
    session.prompt,
    ...(session.useProfile && session.personalColor ? [`퍼스널 컬러: ${session.personalColor}`] : []),
  ];

  return [...new Set([...directConditions, ...inferredConditions])];
}

function cloneLook(look: MakeupLookRecommendation): MakeupLookRecommendation {
  return adaptLegacyLookToV2({
    ...look,
    reasons: [...look.reasons],
    appliedConditions: [...look.appliedConditions],
    imageCropRegions: cloneCropRegions(look.imageCropRegions),
    imageAlignmentMetadata: cloneImageAlignmentMetadata(look.imageAlignmentMetadata),
    lookMap: look.lookMap ? {...look.lookMap} : undefined,
    fitAssessment: look.fitAssessment ? {
      ...look.fitAssessment,
      dimensions: Object.fromEntries(
        FIT_DIMENSION_KEYS.map(key => [key, {...look.fitAssessment?.dimensions[key]}]),
      ) as MakeupRecommendationFitAssessment['dimensions'],
      evidence: look.fitAssessment.evidence.map(item => ({...item})),
    } : undefined,
    matchAssessment: look.matchAssessment ? {
      ...look.matchAssessment,
      components: look.matchAssessment.components.map(component => ({...component, evidence: [...component.evidence]})),
      reflectedInputs: look.matchAssessment.reflectedInputs.map(item => ({...item})),
    } : undefined,
    steps: look.steps.map(step => ({...step})),
    products: look.products.map(product => ({...product})),
    areaGuides: look.areaGuides?.map(guide => ({
      ...guide,
      ...(guide.applicationPlan ? {
        applicationPlan: {
          ...guide.applicationPlan,
          completionCriteria: [...guide.applicationPlan.completionCriteria],
          steps: guide.applicationPlan.steps.map(step => ({
            ...step,
            colors: step.colors.map(color => ({...color})),
          })),
        },
      } : {}),
      color: {...guide.color},
      avoid: [...guide.avoid],
      steps: guide.steps.map(step => ({...step})),
      products: guide.products.map(product => ({...product})),
    })),
  });
}

export class FixtureProductRecommendationProvider implements ProductRecommendationProvider {
  recommendProducts(lookId: string): MakeupRecommendationProduct[] {
    const fixture = MAKEUP_LOOK_FIXTURES.find(look => look.id === lookId) ?? MAKEUP_LOOK_FIXTURES[0];
    return fixture.products.map(product => ({...product}));
  }
}

const fixtureProductProvider = new FixtureProductRecommendationProvider();

function completeSession(
  session: MakeupRecommendationSession,
  answers: MakeupRecommendationAnswer[],
  additionalConstraints?: string,
): MakeupRecommendationSession {
  const conditions = buildAppliedConditions(session, answers, additionalConstraints);
  return {
    ...session,
    phase: 'results',
    currentQuestionIndex: session.questions.length,
    answers,
    additionalConstraints,
    results: MAKEUP_LOOK_FIXTURES.map(fixture => ({
      ...cloneLook(fixture),
      appliedConditions: [...conditions],
      products: fixtureProductProvider.recommendProducts(fixture.id),
    })),
  };
}

function buildCompletedSession(
  input: StartMakeupRecommendationInput,
  answers: MakeupRecommendationAnswer[],
): MakeupRecommendationSession {
  return completeSession(buildQuestionSession(input, []), answers);
}

export function startMakeupRecommendation(input: StartMakeupRecommendationInput): MakeupRecommendationSession {
  const scenario = MAKEUP_SCENARIOS.find(item => item.id === input.scenarioId);
  const inferredDimensions = inferKnownDimensions(input.prompt);
  const known = new Set(scenario?.knownDimensions ?? inferredDimensions);
  const questionCap = !input.scenarioId && inferredDimensions.length === 0 ? 3 : 2;
  const questions = QUESTION_PRIORITY
    .filter(dimension => !known.has(dimension))
    .slice(0, questionCap)
    .map(dimension => MAKEUP_QUESTIONS[dimension]);
  return questions.length === 0
    ? buildCompletedSession(input, [])
    : buildQuestionSession(input, questions);
}

export function answerMakeupRecommendationQuestion(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
): MakeupRecommendationSession {
  const expected = session.questions[session.currentQuestionIndex];
  if (!expected || expected.id !== answer.questionId) {
    throw new Error('현재 질문과 맞지 않는 답변이에요.');
  }
  const selectedOption = expected.options.find(option => option.id === answer.optionId);
  if (answer.optionId && !selectedOption) {
    throw new Error('현재 질문에 없는 선택지예요.');
  }
  if (!selectedOption && !answer.freeText?.trim()) {
    throw new Error('선택지를 고르거나 답변을 입력해 주세요.');
  }
  const existingAnswerIndex = session.answers.findIndex(item => item.questionId === answer.questionId);
  const answers = existingAnswerIndex >= 0
    ? session.answers.map((item, index) => index === existingAnswerIndex ? answer : item)
    : [...session.answers, answer];
  const nextIndex = session.currentQuestionIndex + 1;
  const additionalConstraints =
    answer.additionalConstraints?.trim() || session.additionalConstraints;
  if (nextIndex >= session.questions.length) {
    return completeSession(session, answers, additionalConstraints);
  }

  return {...session, answers, currentQuestionIndex: nextIndex, additionalConstraints};
}

function applyFixtureRefinement(
  results: MakeupLookRecommendation[],
  refinement: MakeupRecommendationRefinement,
): MakeupLookRecommendation[] {
  if (refinement === 'replaceProducts') {
    return results.map(look => {
      const currentProductId = look.products[0]?.id;
      const currentFixtureIndex = MAKEUP_LOOK_FIXTURES.findIndex(fixture =>
        fixture.products.some(product => product.id === currentProductId),
      );
      const nextFixtureIndex = (Math.max(currentFixtureIndex, 0) + 1) % MAKEUP_LOOK_FIXTURES.length;
      const nextFixture = MAKEUP_LOOK_FIXTURES[nextFixtureIndex];
      return {...cloneLook(look), products: fixtureProductProvider.recommendProducts(nextFixture.id)};
    });
  }

  const copy = {
    natural: {summary: '색감과 음영을 한 단계 덜어낸 자연스러운 조정', condition: '더 자연스럽게'},
    hip: {summary: '질감과 선에 포인트를 더한 힙한 조정', condition: '더 힙하게'},
    differentColor: {summary: '주조색을 반대 온도로 바꾼 새로운 색 조합', condition: '다른 색으로'},
  }[refinement];

  const refinementConditions = ['더 자연스럽게', '더 힙하게', '다른 색으로'];
  return results.map(look => {
    const baseSummary = MAKEUP_LOOK_FIXTURES.find(fixture => fixture.id === look.id)?.summary ?? look.summary;
    return {
      ...cloneLook(look),
      summary: `${baseSummary} · ${copy.summary}`,
      appliedConditions: [
        copy.condition,
        ...look.appliedConditions.filter(item => !refinementConditions.includes(item)),
      ],
    };
  });
}

export function refineMakeupRecommendation(
  session: MakeupRecommendationSession,
  refinement: MakeupRecommendationRefinement,
): MakeupRecommendationSession {
  if (session.phase !== 'results') throw new Error('추천 결과가 나온 뒤에 조정할 수 있어요.');
  return {...session, results: applyFixtureRefinement(session.results, refinement)};
}

function mapBackendQuestions(value: unknown): MakeupRecommendationQuestion[] {
  const questions = parseBackendReportArray(value).flatMap(question => {
    const mapped = mapBackendQuestion(question);
    return mapped ? [mapped] : [];
  });
  return questions
    .filter(question => {
      const delegateOption = question.options?.[3];
      return Boolean(
        question.id?.trim()
        && question.title?.trim()
        && question.options?.length === 4
        && question.options.every(option => option.id?.trim() && option.label?.trim())
        && new Set(question.options.map(option => option.id)).size === question.options.length
        && new Set(question.options.map(option => option.label.trim().toLowerCase())).size === question.options.length
        && delegateOption?.id === 'ai_pick'
        && delegateOption.label === 'AI가 골라줘',
      );
    })
    .slice(0, 3)
    .map((question, index) => ({
      id: question.id,
      dimension: QUESTION_PRIORITY[index] ?? 'mood',
      title: question.title.trim(),
      options: question.options.map(option => ({id: option.id, label: option.label.trim()})),
    }));
}

function normalizedArea(value: string | undefined): MakeupLookRecommendation['steps'][number]['area'] {
  return value === 'base' || value === 'brow' || value === 'eye' || value === 'cheek' || value === 'lip'
    ? value
    : 'base';
}

export function mapBackendRecommendationLooks({
  reportId,
  recommendation,
  prompt,
  questions,
  answers,
  imageStatus,
  imageError,
}: {
  reportId: string;
  recommendation: BackendRecommendation;
  prompt: string;
  questions: MakeupRecommendationQuestion[];
  answers: MakeupRecommendationAnswer[];
  imageStatus?: MakeupRecommendationImageStatus;
  imageError?: string;
}): MakeupLookRecommendation[] {
  const parsedRecommendation = parseBackendRecommendation(recommendation);
  const generationSource = parsedRecommendation.generationSource;
  const matchAssessment = parsedRecommendation.matchAssessment;
  const conditions = [prompt, ...selectedAnswerLabels(questions, answers)];
  const validRoles: MakeupLookRecommendation['role'][] = ['anchor', 'bold', 'discovery'];
  return (parsedRecommendation.looks ?? []).flatMap((look, index) => {
    const role = validRoles.includes(look.role as MakeupLookRecommendation['role'])
      ? look.role as MakeupLookRecommendation['role']
      : undefined;
    if (!role) return [];
    const fixture = MAKEUP_LOOK_FIXTURES.find(item => item.role === role) ?? MAKEUP_LOOK_FIXTURES[index % MAKEUP_LOOK_FIXTURES.length];
    const imageUrl = look.imageUrl?.trim();
    const resolvedImageStatus = look.imageStatus ?? imageStatus;
    const completedImageMissing = resolvedImageStatus === 'completed' && !imageUrl;
    const resolvedImageError = completedImageMissing
      ? '서버에서 생성된 이미지 주소를 받지 못했어요. 다시 시도해 주세요.'
      : look.imageError?.trim() || imageError?.trim() || undefined;
    const difficulty = look.difficulty === 'easy' || look.difficulty === 'medium' || look.difficulty === 'advanced'
      ? look.difficulty
      : 'medium';
    const reasons = normalizeBackendStringArray(look.reasons).filter(Boolean);
    const appliedConditions = normalizeBackendStringArray(look.appliedConditions).filter(Boolean);
    const steps = mapBackendLookSteps(look.steps);
    const products = mapBackendLookProducts(look.products);
    const areaGuides = mapBackendAreaGuides(look.areaGuides);
    const mappedLook: MakeupLookRecommendation = {
      id: look.id?.trim() || `${reportId}-${role}`,
      arFilterId: fixture.arFilterId,
      role,
      title: look.title?.trim() || fixture.title,
      summary: look.summary?.trim() || fixture.summary,
      imageSource: imageUrl ? {uri: imageUrl} : fixture.imageSource,
      reasons: look.reasons === undefined ? [look.summary?.trim() || '선택한 상황과 답변을 함께 반영했어요.'] : reasons,
      appliedConditions: [...new Set(appliedConditions.length > 0 ? appliedConditions : conditions)],
      durationMinutes: look.durationMinutes ?? fixture.durationMinutes,
      difficulty,
      steps: steps.filter(step => step.instruction?.trim()).map((step, stepIndex) => ({
        area: normalizedArea(step.area),
        instruction: step.instruction?.trim() ?? '',
        order: step.order ?? stepIndex + 1,
      })),
      products: products.filter(product => product.productName?.trim()).map((product, productIndex) => ({
        id: product.id?.trim() || `${reportId}-${role}-product-${productIndex + 1}`,
        area: normalizedArea(product.area),
        brandName: product.brandName?.trim() || '추천 제품',
        productName: product.productName?.trim() ?? '',
        shadeName: product.shadeName?.trim() || undefined,
        reason: product.reason?.trim() || '추천 방향과 조화를 이루는 제품이에요.',
        price: product.price,
        imageUrl: product.imageUrl?.trim() || undefined,
        purchaseUrl: product.purchaseUrl?.trim() || undefined,
        matchRate: product.matchRate,
      })),
      imageStatus: completedImageMissing ? 'failed' : resolvedImageStatus,
      imageError: resolvedImageError,
      imageCropRegions: mapBackendCropRegions(getBackendLookCropMetadata(look)),
      imageAlignmentMetadata: mapBackendImageAlignmentMetadata(getBackendLookAlignmentMetadata(look)),
      generationSource,
      lookMap: mapBackendLookMap(look.lookMap),
      fitAssessment: mapBackendFitAssessment(look.fitAssessment),
      matchAssessment: role === 'anchor' ? matchAssessment : undefined,
    };
    return [{
      ...mappedLook,
      areaGuides: buildRecommendedAreaGuides({directGuides: areaGuides, look: mappedLook}),
    }];
  });
}

function parseBackendRecommendation(
  recommendation: BackendRecommendation | null | undefined,
): {
  looks: BackendLook[];
  generationSource?: MakeupRecommendationGenerationSource;
  matchAssessment?: MakeupRecommendationMatchAssessment;
} {
  if (!recommendation) return {looks: []};
  let parsed: unknown = recommendation;
  if (typeof recommendation === 'string') {
    try {
      parsed = JSON.parse(recommendation) as unknown;
    } catch {
      return {looks: []};
    }
  }
  if (!isBackendRecord(parsed)) return {looks: []};
  return {
    looks: parseBackendReportArray(parsed.looks).filter(isBackendLook),
    generationSource: mapBackendGenerationSource(parsed.generationSource),
    matchAssessment: mapBackendMatchAssessment(parsed.matchAssessment),
  };
}

export function mapBackendRecommendationReports(
  reports: unknown,
): MakeupRecommendationReportHistoryItem[] {
  return parseBackendReportArray(reports).flatMap(value => {
    if (!isBackendRecommendationReport(value)) return [];
    const report = value;
    try {
      const scenarioText = normalizeOptionalBackendText(report.scenarioText) || '저장된 메이크업 추천';
      const contextSnapshot = parseBackendReportContextSnapshot(report.contextSnapshot);
      const selection = isBackendRecord(contextSnapshot?.selection) ? contextSnapshot.selection : undefined;
      const analysisReport = isBackendRecord(contextSnapshot?.analysisReport)
        ? contextSnapshot.analysisReport
        : undefined;
      const editorialPreset = isBackendRecord(selection?.editorialPreset)
        ? selection.editorialPreset
        : undefined;
      const questions = mapBackendQuestions(report.questions);
      const answers = mapBackendAnswers(report.answers);
      const situation = mapBackendSituationSummary(report.situation)
        ?? mapBackendSituationSummary(selection?.situation);
      const keyword = mapBackendKeyword(report.keyword)
        ?? mapBackendKeyword(selection?.keyword);
      const customSituationText = normalizeOptionalBackendText(report.customSituationText)
        ?? normalizeOptionalBackendText(selection?.customSituationText);
      const editorialPresetId = normalizeOptionalBackendText(report.editorialPresetId)
        ?? normalizeOptionalBackendText(editorialPreset?.id);
      const scenarioLabel = normalizeOptionalBackendText(report.scenarioLabel)
        ?? normalizeOptionalBackendText(keyword?.label)
        ?? normalizeOptionalBackendText(report.customSituationLabel)
        ?? normalizeOptionalBackendText(selection?.customSituationLabel)
        ?? normalizeOptionalBackendText(editorialPreset?.displayText)
        ?? normalizeOptionalBackendText(situation?.label);
      const additionalConstraints = normalizeOptionalBackendText(report.additionalConstraints)
        ?? [...answers]
          .reverse()
          .map(answer => normalizeOptionalBackendText(answer.additionalConstraints))
          .find((value): value is string => Boolean(value));
      const personalColor = normalizeOptionalBackendText(report.personalColor)
        ?? normalizeOptionalBackendText(analysisReport?.personalColor);
      const sourceAnalysisReportId = normalizeOptionalBackendText(report.sourceAnalysisReportId)
        ?? normalizeOptionalBackendText(analysisReport?.id);
      const previewImageUrl = normalizeOptionalBackendText(report.previewImageUrl);
      const previewImageStatus = isMakeupRecommendationImageStatus(report.previewImageStatus)
        ? report.previewImageStatus
        : undefined;
      const results = mapBackendRecommendationLooks({
        reportId: report.id,
        recommendation: report.recommendation ?? {},
        prompt: scenarioText,
        questions,
        answers,
        imageStatus: report.imageStatus,
        imageError: report.imageError,
      }).map(look => look.role !== 'anchor' || !previewImageUrl
        ? look
        : {
            ...look,
            imageSource: {uri: previewImageUrl},
            imageStatus: previewImageStatus ?? 'completed',
            imageError: undefined,
          });
      if (!report.id?.trim() || results.length === 0) return [];
      return [{
        reportId: report.id,
        scenarioText,
        scenarioLabel,
        createdAt: report.createdAt ?? '',
        imageStatus: report.imageStatus,
        imageError: report.imageError,
        previewImageUrl,
        previewImageStatus,
        profileGender: getBackendReportProfileGender(report),
        personalColor,
        sourceAnalysisReportId,
        questions: report.questions == null ? undefined : questions,
        answers: report.answers == null ? undefined : answers,
        additionalConstraints,
        situation,
        keyword,
        editorialPresetId,
        customSituationText,
        results,
      }];
    } catch {
      return [];
    }
  });
}

export function restoreMakeupRecommendationReport(
  report: MakeupRecommendationReportHistoryItem,
): MakeupRecommendationSession {
  const questions = (report.questions ?? []).map(question => ({
    ...question,
    options: question.options.map(option => ({...option})),
  }));
  const answers = (report.answers ?? []).map(answer => ({...answer}));
  const situation = report.situation ? {...report.situation} : undefined;
  const keyword = report.keyword ? {...report.keyword, tags: normalizeBackendStringArray(report.keyword.tags)} : undefined;
  return {
    id: report.reportId,
    createdAt: report.createdAt,
    reportId: report.reportId,
    phase: 'results',
    prompt: report.customSituationText?.trim()
      || keyword?.seedPrompt?.trim()
      || report.scenarioText,
    scenarioLabel: report.scenarioLabel,
    questions,
    currentQuestionIndex: questions.length,
    answers,
    additionalConstraints: report.additionalConstraints,
    results: report.results.map(cloneLook),
    useProfile: Boolean(report.sourceAnalysisReportId || report.personalColor),
    personalColor: report.personalColor,
    sourceAnalysisReportId: report.sourceAnalysisReportId,
    situation,
    keyword,
    editorialPresetId: report.editorialPresetId,
    customSituationText: report.customSituationText,
    imageStatus: report.imageStatus,
    imageError: report.imageError,
    profileGender: report.profileGender,
    generationMode: 'backend',
  };
}

export async function fetchGeneratedMakeupRecommendationReports({
  limit = 20,
  offset = 0,
  timeoutMs,
}: {
  limit?: number;
  offset?: number;
  timeoutMs?: number;
} = {}): Promise<MakeupRecommendationReportHistoryItem[]> {
  const response = await requestBackendJson<{reports?: unknown}>(
    `/makeup-recommendations?limit=${limit}&offset=${offset}`,
    {timeoutMs},
  );
  return mapBackendRecommendationReports(response.reports ?? []);
}

type BackendRecommendationSessionV2 = {
  id: string;
  status: 'questioning' | 'ready' | 'generating' | 'completed' | 'failed';
  profileGender?: unknown;
  questions?: unknown;
  currentQuestionIndex?: number;
  answers?: unknown;
  sourceAnalysisReportId?: string;
  situation?: unknown;
  keyword?: unknown;
  editorialPresetId?: string;
  customSituationText?: string;
  customSituationLabel?: string;
  imageMode?: 'personalized' | 'generic';
  reportId?: string;
  expiresAt?: string;
};

function isUnavailableV2Endpoint(error: unknown): boolean {
  return error instanceof BackendApiError && (
    error.status === 405
    || error.status === 501
    || (error.status === 404 && error.code === 'MAKEUP_RECOMMENDATION_V2_DISABLED')
  );
}

function shouldUseDiscoveryFixture(error: unknown): boolean {
  if (isRequestAbortedError(error)) return false;
  if (isBackendNetworkError(error)) return true;
  if (error instanceof BackendApiError) {
    if (error.status === 401 || error.status === 403) return false;
    return error.status === 404
      || error.status === 405
      || error.status === 422
      || error.status === 501
      || error.status >= 500;
  }
  return error instanceof Error && /EXPO_PUBLIC_API_BASE_URL is required/.test(error.message);
}

function normalizeV2BackendError(error: unknown): unknown {
  if (isBackendNetworkError(error)) {
    return new MakeupRecommendationRetryableError(
      '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    );
  }
  if (!(error instanceof BackendApiError) || error.status !== 422) return error;
  if (error.code?.startsWith('MAKEUP_CUSTOM_SITUATION_')) return error;
  if (error.code === 'MAKEUP_KEYWORD_NOT_IN_SITUATION' || error.code === 'MAKEUP_KEYWORD_EXPIRED') {
    return new MakeupRecommendationRetryableError(
      '상황 목록이 갱신되었어요. 목록을 다시 불러온 뒤 선택해 주세요.',
    );
  }
  if (error.code === 'MAKEUP_EDITORIAL_PRESET_UNKNOWN') {
    return new MakeupRecommendationRetryableError(
      '트렌드 목록이 갱신되었어요. 선택 화면에서 다시 골라주세요.',
    );
  }
  return new MakeupRecommendationRetryableError(
    '선택한 보고서 또는 메이크업 정보를 확인하지 못했어요. 다시 선택한 뒤 시도해 주세요.',
  );
}

function v2Prompt(input: StartMakeupRecommendationV2Input): string {
  return input.keyword?.seedPrompt?.trim()
    || input.editorialPresetPrompt?.trim()
    || input.customSituationText?.trim()
    || '';
}

type MakeupRecommendationSelectionKind = 'keyword' | 'editorial' | 'custom';

function getMakeupRecommendationSelectionKind(
  input: StartMakeupRecommendationV2Input,
): MakeupRecommendationSelectionKind {
  const hasSituation = Boolean(input.situation);
  const hasKeyword = Boolean(input.keyword);
  const hasEditorialPreset = Boolean(input.editorialPresetId?.trim());
  const hasCustom = Boolean(input.customSituationText?.trim());
  const selectionCount = Number(hasKeyword) + Number(hasEditorialPreset) + Number(hasCustom);

  if (selectionCount !== 1 || hasSituation !== hasKeyword) {
    throw new MakeupRecommendationRetryableError(
      '상황 키워드, 트렌드 메이크업, 직접 입력 중 하나만 다시 골라주세요.',
    );
  }
  if (hasEditorialPreset && (!input.editorialPresetLabel?.trim() || !input.editorialPresetPrompt?.trim())) {
    throw new MakeupRecommendationRetryableError(
      '선택한 트렌드 메이크업 정보를 확인하지 못했어요. 다시 골라주세요.',
    );
  }
  return hasKeyword ? 'keyword' : hasEditorialPreset ? 'editorial' : 'custom';
}

function assertBackendUuid(value: string, message: string): string {
  const normalized = value.trim();
  if (!isMakeupRecommendationUuid(normalized)) {
    throw new MakeupRecommendationRetryableError(message);
  }
  return normalized;
}

function buildV2SessionCreateBody(
  input: StartMakeupRecommendationV2Input,
  selectionKind: MakeupRecommendationSelectionKind,
): Record<string, unknown> {
  const analysisReportId = assertBackendUuid(
    input.analysisReportId,
    '선택한 얼굴 분석 보고서를 확인하지 못했어요. 보고서를 다시 골라주세요.',
  );
  const common = {
    analysisReportId,
    imageMode: input.imageMode ?? 'generic',
  };
  if (selectionKind === 'keyword') {
    if (input.discoverySource === 'fixture') {
      const customSituationText = input.keyword?.seedPrompt?.trim();
      const customSituationLabel = input.keyword?.label?.trim();
      if (!customSituationText || !customSituationLabel) {
        throw new MakeupRecommendationRetryableError(
          '선택한 상황 정보를 확인하지 못했어요. 다른 상황을 골라주세요.',
        );
      }
      return {
        ...common,
        customSituationText,
        customSituationLabel,
      };
    }
    return {
      ...common,
      situationId: assertBackendUuid(
        input.situation?.id ?? '',
        '상황 목록이 갱신되었어요. 목록을 다시 불러온 뒤 선택해 주세요.',
      ),
      keywordId: assertBackendUuid(
        input.keyword?.id ?? '',
        '상황 목록이 갱신되었어요. 목록을 다시 불러온 뒤 선택해 주세요.',
      ),
    };
  }
  if (selectionKind === 'editorial') {
    return {
      ...common,
      editorialPresetId: input.editorialPresetId?.trim(),
    };
  }
  return {
    ...common,
    customSituationText: input.customSituationText?.trim(),
    ...(input.customSituationLabel?.trim()
      ? {customSituationLabel: input.customSituationLabel.trim()}
      : {}),
  };
}

function createFixtureV2Session(input: StartMakeupRecommendationV2Input): MakeupRecommendationSession {
  const prompt = v2Prompt(input);
  const fixtureSession = startMakeupRecommendation({
    prompt,
    scenarioId: input.keyword?.id ?? input.editorialPresetId,
    scenarioLabel: input.keyword?.label
      || input.editorialPresetLabel?.trim()
      || input.customSituationLabel?.trim()
      || input.situation?.label
      || '직접 입력',
    useProfile: true,
    personalColor: input.personalColor,
  });
  return {
    ...fixtureSession,
    results: fixtureSession.results.map(cloneLook),
    sourceAnalysisReportId: input.analysisReportId,
    situation: input.situation ? {
      id: input.situation.id,
      key: input.situation.key,
      label: input.situation.label,
      description: input.situation.description,
    } : undefined,
    keyword: input.keyword,
    editorialPresetId: input.editorialPresetId,
    customSituationText: input.customSituationText?.trim()
      || input.editorialPresetPrompt?.trim()
      || undefined,
    status: fixtureSession.phase === 'results' ? 'completed' : 'questioning',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    generationMode: 'fixture',
  };
}

const V2_SESSION_STATUSES = new Set<BackendRecommendationSessionV2['status']>([
  'questioning',
  'ready',
  'generating',
  'completed',
  'failed',
]);

function validateBackendV2Session(response: BackendRecommendationSessionV2): void {
  if (!response || !isMakeupRecommendationUuid(response.id)) {
    throw new MakeupRecommendationRetryableError(
      '추천 세션 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!V2_SESSION_STATUSES.has(response.status)) {
    throw new MakeupRecommendationRetryableError(
      '추천 진행 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (response.sourceAnalysisReportId && !isMakeupRecommendationUuid(response.sourceAnalysisReportId)) {
    throw new MakeupRecommendationRetryableError(
      '추천에 연결된 얼굴 분석 보고서를 확인하지 못했어요. 다시 선택해 주세요.',
    );
  }
  if (response.reportId && !isMakeupRecommendationUuid(response.reportId)) {
    throw new MakeupRecommendationRetryableError(
      '완료된 추천 보고서 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  const situation = mapBackendSituationSummary(response.situation);
  if (situation?.id && !isMakeupRecommendationUuid(situation.id)) {
    throw new MakeupRecommendationRetryableError(
      '추천에 연결된 상황 정보를 확인하지 못했어요. 다시 선택해 주세요.',
    );
  }
  const keyword = mapBackendKeyword(response.keyword);
  if (keyword?.id && !isMakeupRecommendationUuid(keyword.id)) {
    throw new MakeupRecommendationRetryableError(
      '추천에 연결된 키워드 정보를 확인하지 못했어요. 다시 선택해 주세요.',
    );
  }
  if (
    response.currentQuestionIndex !== undefined
    && (!Number.isInteger(response.currentQuestionIndex) || response.currentQuestionIndex < 0)
  ) {
    throw new MakeupRecommendationRetryableError(
      '추천 질문 진행 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
}

function mapBackendV2Session({
  input,
  previous,
  response,
}: {
  input?: StartMakeupRecommendationV2Input;
  previous?: MakeupRecommendationSession;
  response: BackendRecommendationSessionV2;
}): MakeupRecommendationSession {
  validateBackendV2Session(response);
  const questions = mapBackendQuestions(response.questions ?? previous?.questions ?? []);
  const answers = mapBackendAnswers(response.answers ?? previous?.answers ?? []);
  const situation = mapBackendSituationSummary(response.situation) ?? (input?.situation ? {
    id: input.situation.id,
    key: input.situation.key,
    label: input.situation.label,
    description: input.situation.description,
  } : previous?.situation);
  const keyword = mapBackendKeyword(response.keyword) ?? input?.keyword ?? previous?.keyword;
  const editorialPresetId = response.editorialPresetId
    ?? input?.editorialPresetId
    ?? previous?.editorialPresetId;
  const customSituationText = response.customSituationText?.trim()
    || input?.customSituationText?.trim()
    || input?.editorialPresetPrompt?.trim()
    || previous?.customSituationText;
  const profileGender = normalizeBackendProfileGender(response.profileGender)
    ?? previous?.profileGender;
  if (response.status === 'questioning' && questions.length === 0) {
    throw new Error('추천 질문을 준비하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  const phase = response.status === 'questioning'
    ? 'question'
    : response.status === 'ready' || response.status === 'generating' || response.status === 'failed'
      ? 'ready'
      : 'results';
  return {
    id: response.id,
    phase,
    prompt: previous?.prompt ?? keyword?.seedPrompt?.trim() ?? customSituationText ?? '',
    scenarioLabel: previous?.scenarioLabel
      ?? keyword?.label
      ?? response.customSituationLabel?.trim()
      ?? input?.editorialPresetLabel?.trim()
      ?? input?.customSituationLabel?.trim()
      ?? situation?.label
      ?? '직접 입력',
    questions,
    currentQuestionIndex: response.currentQuestionIndex ?? previous?.currentQuestionIndex ?? 0,
    answers,
    additionalConstraints: previous?.additionalConstraints
      ?? [...answers].reverse().find(answer => answer.additionalConstraints?.trim())?.additionalConstraints?.trim(),
    results: previous?.results ?? [],
    profileGender,
    useProfile: true,
    personalColor: input?.personalColor ?? previous?.personalColor,
    sourceAnalysisReportId: response.sourceAnalysisReportId ?? input?.analysisReportId ?? previous?.sourceAnalysisReportId,
    situation,
    keyword,
    editorialPresetId,
    customSituationText,
    status: response.status,
    expiresAt: response.expiresAt ?? previous?.expiresAt,
    reportId: response.reportId ?? previous?.reportId,
    generationMode: 'v2',
  };
}

function v2InputFromSession(session: MakeupRecommendationSession): StartMakeupRecommendationV2Input {
  const hasBackendKeywordIds = Boolean(
    session.situation
    && session.keyword
    && isMakeupRecommendationUuid(session.situation.id)
    && isMakeupRecommendationUuid(session.keyword.id),
  );
  const situation = hasBackendKeywordIds && session.situation ? {
    ...session.situation,
    imageAssetKey: session.situation.key,
    keywords: [],
    sortOrder: 0,
  } : undefined;
  return {
    analysisReportId: session.sourceAnalysisReportId ?? '',
    situation,
    discoverySource: hasBackendKeywordIds ? 'api' : undefined,
    keyword: hasBackendKeywordIds ? session.keyword : undefined,
    editorialPresetId: session.editorialPresetId,
    editorialPresetLabel: session.editorialPresetId ? session.scenarioLabel : undefined,
    editorialPresetPrompt: session.editorialPresetId ? session.prompt : undefined,
    customSituationText: session.editorialPresetId || hasBackendKeywordIds
      ? undefined
      : session.customSituationText ?? session.prompt,
    customSituationLabel: session.editorialPresetId || hasBackendKeywordIds
      ? undefined
      : session.scenarioLabel,
    personalColor: session.personalColor,
  };
}

export async function fetchMakeupRecommendationDiscovery(
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationDiscovery> {
  try {
    const response = await backendRequest<unknown>('/makeup-recommendations/discovery', {signal});
    const normalized = normalizeMakeupRecommendationDiscovery(response);
    return normalized ?? getMakeupRecommendationFixtureDiscovery();
  } catch (error) {
    if (!shouldUseDiscoveryFixture(error)) throw error;
    return getMakeupRecommendationFixtureDiscovery();
  }
}

async function startLegacyCompatibleMakeupRecommendation(
  input: StartMakeupRecommendationV2Input,
  backendRequest: typeof requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const prompt = v2Prompt(input);
  const scenarioLabel = input.keyword?.label
    || input.editorialPresetLabel?.trim()
    || input.customSituationLabel?.trim()
    || input.situation?.label
    || '직접 입력';
  const legacySession = await startGeneratedMakeupRecommendation(
    {
      prompt,
      scenarioId: input.keyword?.id ?? input.editorialPresetId,
      scenarioLabel,
      useProfile: true,
      personalColor: input.personalColor,
    },
    input.keyword?.tags ?? [],
    backendRequest,
    signal,
  );
  return {
    ...legacySession,
    useProfile: true,
    personalColor: input.personalColor,
    sourceAnalysisReportId: input.analysisReportId,
    situation: input.situation ? {
      id: input.situation.id,
      key: input.situation.key,
      label: input.situation.label,
      description: input.situation.description,
    } : undefined,
    keyword: input.keyword,
    editorialPresetId: input.editorialPresetId,
    customSituationText: input.customSituationText?.trim()
      || input.editorialPresetPrompt?.trim()
      || undefined,
    status: 'questioning',
  };
}

export async function fetchGeneratedMakeupRecommendationSessionV2(
  sessionId: string,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const normalizedSessionId = sessionId.trim();
  if (!isMakeupRecommendationUuid(normalizedSessionId)) {
    throw new MakeupRecommendationRetryableError(
      '복원할 메이크업 추천 세션을 확인하지 못했어요. 새 추천을 시작해 주세요.',
    );
  }
  const response = await backendRequest<BackendRecommendationSessionV2>(
    `/makeup-recommendations/sessions/${encodeURIComponent(normalizedSessionId)}`,
    {signal},
  );
  return mapBackendV2Session({response});
}

export async function startGeneratedMakeupRecommendationV2(
  input: StartMakeupRecommendationV2Input,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (!input.analysisReportId.trim()) {
    throw new MakeupRecommendationRetryableError(
      '추천에 사용할 얼굴 분석 보고서를 골라주세요.',
    );
  }
  const selectionKind = getMakeupRecommendationSelectionKind(input);
  const hasInjectedBackend = backendRequest !== requestBackendJson;
  const hasConfiguredBackend = Boolean(getBackendApiBaseUrl()) || hasInjectedBackend;
  const hasFixtureReportId = input.discoverySource === 'fixture'
    && !isMakeupRecommendationUuid(input.analysisReportId);
  if (input.forceFixture || !hasConfiguredBackend || hasFixtureReportId) {
    return createFixtureV2Session(input);
  }
  const body = buildV2SessionCreateBody(input, selectionKind);
  try {
    const response = await backendRequest<BackendRecommendationSessionV2>(
      '/makeup-recommendations/sessions',
      {
        method: 'POST',
        body,
        headers: {
          'Idempotency-Key': input.idempotencyKey ?? createMakeupRecommendationIdempotencyKey(),
        },
        signal,
      },
    );
    return mapBackendV2Session({input, response});
  } catch (error) {
    if (isUnavailableV2Endpoint(error)) {
      try {
        return await startLegacyCompatibleMakeupRecommendation(input, backendRequest, signal);
      } catch (legacyError) {
        throw normalizeV2BackendError(legacyError);
      }
    }
    throw normalizeV2BackendError(error);
  }
}

export async function answerGeneratedMakeupRecommendationQuestionV2(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (session.generationMode === 'fixture') {
    const answered = answerMakeupRecommendationQuestion(session, answer);
    return {
      ...answered,
      results: answered.results.map(cloneLook),
      status: answered.phase === 'results' ? 'completed' : 'questioning',
      generationMode: 'fixture',
    };
  }
  if (session.generationMode === 'backend') {
    return answerGeneratedMakeupRecommendationQuestion(
      session,
      answer,
      session.keyword?.tags ?? [],
      backendRequest,
      signal,
    );
  }
  assertBackendUuid(
    session.id,
    '추천 세션 정보를 확인하지 못했어요. 새 추천을 시작해 주세요.',
  );
  let response: BackendRecommendationSessionV2;
  try {
    response = await backendRequest<BackendRecommendationSessionV2>(
      `/makeup-recommendations/sessions/${session.id}/answers`,
      {method: 'POST', body: answer, signal},
    );
  } catch (error) {
    throw normalizeV2BackendError(error);
  }
  return mapBackendV2Session({input: v2InputFromSession(session), previous: session, response});
}

export async function generateMakeupRecommendationV2(
  session: MakeupRecommendationSession,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (session.generationMode === 'fixture') {
    if (session.phase !== 'results') throw new Error('질문에 모두 답한 뒤 추천을 만들 수 있어요.');
    return {...session, results: session.results.map(cloneLook), status: 'completed'};
  }
  assertBackendUuid(
    session.id,
    '추천 세션 정보를 확인하지 못했어요. 새 추천을 시작해 주세요.',
  );
  let response: {
    reportId: string;
    recommendation: BackendRecommendation;
    imageStatus: BackendRecommendationReport['imageStatus'];
  };
  try {
    response = await backendRequest<{
      reportId: string;
      recommendation: BackendRecommendation;
      imageStatus: BackendRecommendationReport['imageStatus'];
    }>(`/makeup-recommendations/sessions/${session.id}/generate`, {
      method: 'POST',
      timeoutMs: MAKEUP_RECOMMENDATION_GENERATION_TIMEOUT_MS,
      signal,
    });
  } catch (error) {
    throw normalizeV2BackendError(error);
  }
  if (!isMakeupRecommendationUuid(response.reportId)) {
    throw new MakeupRecommendationRetryableError(
      '완료된 추천 보고서 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  const results = mapBackendRecommendationLooks({
    reportId: response.reportId,
    recommendation: response.recommendation,
    prompt: session.prompt,
    questions: session.questions,
    answers: session.answers,
    imageStatus: response.imageStatus,
  });
  if (results.length === 0) throw new Error('추천 결과 형식을 확인하지 못했어요. 다시 시도해 주세요.');
  return {
    ...session,
    phase: 'results',
    status: 'completed',
    currentQuestionIndex: session.questions.length,
    results,
    reportId: response.reportId,
    imageStatus: response.imageStatus,
    generationMode: 'v2',
  };
}

export async function fetchGeneratedMakeupRecommendationReport(
  reportId: string,
  signal?: AbortSignal,
): Promise<MakeupRecommendationReportHistoryItem> {
  const report = await requestBackendJson<BackendRecommendationReport>(
    `/makeup-recommendations/${encodeURIComponent(reportId)}`,
    {signal},
  );
  const mappedReport = mapBackendRecommendationReports([report])[0];

  if (!mappedReport) {
    throw new Error('추천 메이크업 보고서 결과가 비어 있어요.');
  }

  return mappedReport;
}

export async function deleteGeneratedMakeupRecommendationReport(
  reportId: string,
): Promise<void> {
  await requestBackendJson(
    `/makeup-recommendations/${encodeURIComponent(reportId)}`,
    {method: 'DELETE'},
  );
}

export async function startGeneratedMakeupRecommendation(
  input: StartMakeupRecommendationInput,
  scenarioTags: readonly string[] = [],
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const response = await backendRequest<{questions?: unknown}>(
    '/makeup-recommendations/questions',
    {
      method: 'POST',
      body: {
        scenarioText: input.prompt.trim(),
        scenarioLabel: input.scenarioLabel?.trim() || undefined,
        scenarioTags,
      },
      signal,
    },
  );
  const questions = mapBackendQuestions(response.questions ?? []);
  if (questions.length === 0) throw new Error('추천 질문을 준비하지 못했어요. 잠시 후 다시 시도해주세요.');
  return {
    ...buildQuestionSession({...input, useProfile: false, personalColor: undefined}, questions),
    generationMode: 'backend',
  };
}

export async function answerGeneratedMakeupRecommendationQuestion(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
  scenarioTags: readonly string[] = [],
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const expected = session.questions[session.currentQuestionIndex];
  if (!expected || expected.id !== answer.questionId) throw new Error('현재 질문과 맞지 않는 답변이에요.');
  const selectedOption = expected.options.find(option => option.id === answer.optionId);
  if (answer.optionId && !selectedOption) throw new Error('현재 질문에 없는 선택지예요.');
  if (!selectedOption && !answer.freeText?.trim()) throw new Error('선택지를 고르거나 답변을 입력해 주세요.');

  const answers = [...session.answers, answer];
  const nextIndex = session.currentQuestionIndex + 1;
  if (nextIndex < session.questions.length) {
    return {...session, answers, currentQuestionIndex: nextIndex};
  }

  const response = await backendRequest<{
    reportId: string;
    recommendation: BackendRecommendation;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>('/makeup-recommendations', {
    method: 'POST',
    body: {
      scenarioText: session.prompt,
      scenarioLabel: session.scenarioLabel,
      scenarioTags,
      questions: session.questions,
      answers,
    },
    timeoutMs: 180000,
    signal,
  });
  return {
    ...session,
    phase: 'results',
    currentQuestionIndex: session.questions.length,
    answers,
    results: mapBackendRecommendationLooks({
      reportId: response.reportId,
      recommendation: response.recommendation,
      prompt: session.prompt,
      questions: session.questions,
      answers,
      imageStatus: response.imageStatus,
    }),
    reportId: response.reportId,
    imageStatus: response.imageStatus,
    useProfile: false,
    personalColor: undefined,
    generationMode: 'backend',
  };
}

export async function refreshGeneratedMakeupRecommendation(
  session: MakeupRecommendationSession,
  signal?: AbortSignal,
  backendRequest: typeof requestBackendJson = requestBackendJson,
): Promise<MakeupRecommendationSession> {
  if (!session.reportId) return session;
  const report = await backendRequest<BackendRecommendationReport>(
    `/makeup-recommendations/${session.reportId}`,
    {signal},
  );
  const refreshedResults = mapBackendRecommendationLooks({
    reportId: session.reportId,
    recommendation: report.recommendation,
    prompt: session.prompt,
    questions: session.questions,
    answers: session.answers,
    imageStatus: report.imageStatus,
    imageError: report.imageError,
  });
  return {
    ...session,
    createdAt: report.createdAt ?? session.createdAt,
    profileGender: getBackendReportProfileGender(report) ?? session.profileGender,
    sourceAnalysisReportId: report.sourceAnalysisReportId ?? session.sourceAnalysisReportId,
    imageStatus: report.imageStatus,
    imageError: report.imageError,
    results: refreshedResults.length > 0 ? refreshedResults : session.results,
  };
}

export async function retryGeneratedMakeupRecommendationImages(
  session: MakeupRecommendationSession,
  signal?: AbortSignal,
  lookId?: string,
  backendRequest: typeof requestBackendJson = requestBackendJson,
): Promise<MakeupRecommendationSession> {
  if (!session.reportId) throw new Error('다시 만들 추천 보고서를 찾지 못했어요.');
  const response = await backendRequest<{
    reportId: string;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>(`/makeup-recommendations/${session.reportId}/image/retry`, {
    method: 'POST',
    body: lookId ? {lookId} : undefined,
    signal,
  });
  return {...session, imageStatus: response.imageStatus, imageError: undefined};
}

export async function refineGeneratedMakeupRecommendation(
  session: MakeupRecommendationSession,
  refinement: MakeupRecommendationRefinement,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (session.phase !== 'results') {
    throw new Error('추천 결과가 나온 뒤에 조정할 수 있어요.');
  }
  if (!session.reportId) throw new Error('조정할 추천 보고서를 찾지 못했어요.');
  const response = await requestBackendJson<{
    reportId: string;
    recommendation: BackendRecommendation;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>(`/makeup-recommendations/${session.reportId}/refine`, {
    method: 'POST',
    body: {refinement},
    timeoutMs: MAKEUP_RECOMMENDATION_GENERATION_TIMEOUT_MS,
    signal,
  });
  return {
    ...session,
    id: response.reportId,
    reportId: response.reportId,
    imageStatus: response.imageStatus,
    imageError: undefined,
    results: mapBackendRecommendationLooks({
      reportId: response.reportId,
      recommendation: response.recommendation,
      prompt: session.prompt,
      questions: session.questions,
      answers: session.answers,
      imageStatus: response.imageStatus,
    }),
  };
}
