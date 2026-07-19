import {MAKEUP_LOOK_FIXTURES} from '../data/makeupRecommendationCatalog';
import type {
  MakeupArea,
  MakeupGuideArea,
  MakeupLookRecommendation,
  MakeupRecommendationApplicationPlan,
  MakeupRecommendationDiscovery,
  MakeupRecommendationProduct,
  MakeupRecommendationStep,
  MakeupSituation,
  MakeupSituationKey,
  MakeupTrendBadge,
  MakeupTrendKeyword,
  RecommendedMakeupAreaGuide,
} from '../types';

type ApiApplicationPlan = Partial<Omit<MakeupRecommendationApplicationPlan, 'completionCriteria' | 'steps'>> & {
  completionCriteria?: string[];
  steps?: Array<Partial<Omit<MakeupRecommendationApplicationPlan['steps'][number], 'colors'>> & {
    colors?: Array<Partial<MakeupRecommendationApplicationPlan['steps'][number]['colors'][number]>>;
  }>;
};

export type ApiAreaGuide = Partial<Omit<RecommendedMakeupAreaGuide, 'area' | 'applicationPlan' | 'color' | 'avoid' | 'products' | 'steps'>> & {
  area?: string;
  applicationOrder?: number;
  applicationPlan?: ApiApplicationPlan;
  color?: {name?: string; hex?: string};
  colors?: Array<{name?: string; hex?: string}>;
  avoid?: string[] | string;
  products?: Array<Partial<MakeupRecommendationProduct>>;
  steps?: Array<{order?: number; instruction?: string} | string>;
};

const REQUIRED_AREAS: readonly MakeupArea[] = ['base', 'brow', 'eye', 'cheek', 'lip'];
const AREA_LABELS: Record<MakeupGuideArea, string> = {
  base: '베이스',
  brow: '브로우',
  eye: '아이',
  cheek: '치크',
  lip: '립',
  contour: '컨투어',
};
const AREA_DEFAULTS: Record<MakeupGuideArea, {color: string; hex: string; texture: string; placement: string}> = {
  base: {color: '뉴트럴 베이지', hex: '#D9B49A', texture: '얇고 밀착되는 새틴', placement: '얼굴 중앙에서 바깥쪽',},
  brow: {color: '내추럴 브라운', hex: '#795548', texture: '보송한 파우더', placement: '눈썹 빈 곳과 꼬리',},
  eye: {color: '소프트 토프', hex: '#9B7F74', texture: '고운 음영', placement: '눈두덩과 눈꼬리',},
  cheek: {color: '로지 피치', hex: '#D98E8E', texture: '맑은 소프트 블러', placement: '광대 앞쪽에서 바깥쪽',},
  lip: {color: '뮤티드 로즈', hex: '#A85D68', texture: '촉촉한 세미 글로우', placement: '입술 안쪽에서 경계까지',},
  contour: {color: '뉴트럴 토프', hex: '#8B756A', texture: '투명한 매트', placement: '얼굴 외곽과 콧대',},
};

function isGuideArea(value: string | undefined): value is MakeupGuideArea {
  return value === 'base' || value === 'brow' || value === 'eye' || value === 'cheek' || value === 'lip' || value === 'contour';
}

function productArea(area: MakeupGuideArea): MakeupArea {
  return area === 'contour' ? 'base' : area;
}

function fallbackSteps(
  area: MakeupGuideArea,
  steps: readonly MakeupRecommendationStep[],
  fixture: MakeupLookRecommendation,
): Array<{order: number; instruction: string}> {
  const matching = steps.filter(step => step.area === area);
  const source = matching.length > 0 ? matching : fixture.steps.filter(step => step.area === area);
  return source.map((step, index) => ({order: index + 1, instruction: step.instruction}));
}

function fallbackProducts(
  area: MakeupGuideArea,
  products: readonly MakeupRecommendationProduct[],
): MakeupRecommendationProduct[] {
  const normalizedArea = productArea(area);
  return products
    .filter(product => product.area === normalizedArea)
    .map(product => ({...product}));
}

const APPLICATION_COLOR_HEX = /^#[0-9a-f]{6}$/i;
const APPLICATION_MIN_STEPS: Record<MakeupGuideArea, number> = {
  base: 4,
  brow: 3,
  eye: 5,
  cheek: 3,
  lip: 3,
  contour: 2,
};

function normalizeApplicationPlan(
  value: ApiApplicationPlan | undefined,
  area: MakeupGuideArea,
): MakeupRecommendationApplicationPlan | undefined {
  const estimatedMinutes = value?.estimatedMinutes;
  const completionCriteria = value?.completionCriteria?.map(item => item.trim()) ?? [];
  const rawSteps = value?.steps;
  if (
    value?.recipeVersion !== 'makeup-application-v1'
    || typeof estimatedMinutes !== 'number'
    || !Number.isInteger(estimatedMinutes)
    || estimatedMinutes < 1
    || estimatedMinutes > 60
    || completionCriteria.length === 0
    || completionCriteria.length > 4
    || completionCriteria.some(item => !item)
    || new Set(completionCriteria).size !== completionCriteria.length
    || !rawSteps
    || rawSteps.length < APPLICATION_MIN_STEPS[area]
    || rawSteps.length > 8
  ) return undefined;

  const seenOrders = new Set<number>();
  const steps: MakeupRecommendationApplicationPlan['steps'] = [];
  for (const step of rawSteps) {
    const order = step.order;
    const title = step.title?.trim();
    const productType = step.productType?.trim();
    const tool = step.tool?.trim();
    const amount = step.amount?.trim();
    const placement = step.placement?.trim();
    const technique = step.technique?.trim();
    const blending = step.blending?.trim();
    const finishCheck = step.finishCheck?.trim();
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
      || !step.colors
      || step.colors.length === 0
      || step.colors.length > 4
    ) return undefined;

    const colors = step.colors.map(color => ({
      role: color.role?.trim() ?? '',
      name: color.name?.trim() ?? '',
      hex: color.hex?.trim().toUpperCase() ?? '',
    }));
    if (colors.some(color => !color.role || !color.name || !APPLICATION_COLOR_HEX.test(color.hex))) {
      return undefined;
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

  const searchable = sortedSteps.flatMap(step => [
    step.title,
    step.productType,
    step.tool,
    step.amount,
    step.placement,
    step.technique,
    step.blending,
    step.finishCheck,
    ...step.colors.flatMap(color => [color.role, color.name]),
  ]).join(' ');
  const distinctColors = new Set(
    sortedSteps.flatMap(step => step.colors.map(color => (
      color.name.toLocaleLowerCase() + '\u0000' + color.hex.toUpperCase()
    ))),
  );
  if (
    area === 'base'
    && !(
      searchable.includes('파우더')
      && (searchable.includes('광') || searchable.includes('글로우'))
      && (
        searchable.includes('올리지')
        || searchable.includes('비움')
        || searchable.includes('제외')
      )
    )
  ) return undefined;
  if (
    area === 'eye'
    && !(
      distinctColors.size >= 3
      && searchable.includes('섀도')
      && (searchable.includes('아이라이너') || searchable.includes('라이너'))
    )
  ) return undefined;
  if (
    area === 'lip'
    && !(
      distinctColors.size >= 2
      && (searchable.includes('안쪽') || searchable.includes('그라데이션'))
      && (searchable.includes('글로') || searchable.includes('광'))
    )
  ) return undefined;

  return {
    recipeVersion: 'makeup-application-v1',
    estimatedMinutes,
    completionCriteria,
    steps: sortedSteps,
  };
}
export function buildRecommendedAreaGuides({
  directGuides = [],
  look,
}: {
  directGuides?: readonly ApiAreaGuide[];
  look: MakeupLookRecommendation;
}): RecommendedMakeupAreaGuide[] {
  const fixture = MAKEUP_LOOK_FIXTURES.find(item => item.role === look.role) ?? MAKEUP_LOOK_FIXTURES[0];
  const requestedAreas: MakeupGuideArea[] = [
    ...REQUIRED_AREAS,
    ...(directGuides.some(guide => guide.area === 'contour') ? ['contour' as const] : []),
  ];
  return requestedAreas.map(area => {
    const direct = directGuides.find(guide => guide.area === area);
    const defaults = AREA_DEFAULTS[area];
    const requestedApplicationOrder = direct?.applicationOrder;
    const hasValidApplicationOrder = typeof requestedApplicationOrder === 'number'
      && Number.isInteger(requestedApplicationOrder)
      && requestedApplicationOrder >= 1
      && requestedApplicationOrder <= 5;
    const applicationPlan = hasValidApplicationOrder
      ? normalizeApplicationPlan(direct?.applicationPlan, area)
      : undefined;
    const applicationOrder = applicationPlan && hasValidApplicationOrder
      ? requestedApplicationOrder
      : requestedAreas.indexOf(area) + 1;
    const directSteps = (direct?.steps ?? []).flatMap((step, index) => {
      const instruction = typeof step === 'string' ? step.trim() : step.instruction?.trim();
      if (!instruction) return [];
      return [{order: typeof step === 'string' ? index + 1 : step.order ?? index + 1, instruction}];
    });
    const steps = directSteps.length > 0 ? directSteps : fallbackSteps(area, look.steps, fixture);
    const products = direct?.products?.filter(product => product.productName?.trim()).map((product, index) => ({
      id: product.id?.trim() || `${look.id}-${area}-product-${index + 1}`,
      area: productArea(area),
      brandName: product.brandName?.trim() || '',
      productName: product.productName?.trim() ?? '',
      shadeName: product.shadeName?.trim() || undefined,
      reason: product.reason?.trim() || '이 룩의 색과 질감에 자연스럽게 어울려요.',
      price: product.price,
      imageUrl: product.imageUrl?.trim() || undefined,
      purchaseUrl: product.purchaseUrl?.trim() || undefined,
      matchRate: product.matchRate,
    })) ?? fallbackProducts(area, look.products);
    const technique = direct?.technique?.trim() || steps[0]?.instruction || `${AREA_LABELS[area]}를 얇게 쌓아 자연스럽게 연결해요.`;
    const directColor = direct?.color ?? direct?.colors?.[0];
    const avoid = (Array.isArray(direct?.avoid) ? direct.avoid : direct?.avoid ? [direct.avoid] : [])
      .map(value => value.trim())
      .filter(Boolean);
    return {
      area,
      ...(applicationPlan ? {applicationOrder, applicationPlan} : {}),
      label: direct?.label?.trim() || AREA_LABELS[area],
      goal: direct?.goal?.trim() || `${look.title}의 분위기를 ${AREA_LABELS[area]}에 자연스럽게 연결해요.`,
      color: {
        name: directColor?.name?.trim() || products[0]?.shadeName || defaults.color,
        hex: /^#[0-9a-f]{6}$/i.test(directColor?.hex ?? '') ? directColor?.hex ?? defaults.hex : defaults.hex,
      },
      texture: direct?.texture?.trim() || defaults.texture,
      placement: direct?.placement?.trim() || defaults.placement,
      technique,
      reason: direct?.reason?.trim() || look.reasons[0] || '선택한 보고서와 상황의 균형을 맞추기 위한 방법이에요.',
      avoid,
      steps,
      products,
      arSupported: direct?.arSupported ?? area !== 'contour',
    };
  });
}

export function adaptLegacyLookToV2(look: MakeupLookRecommendation): MakeupLookRecommendation {
  return {
    ...look,
    areaGuides: look.areaGuides?.length
      ? buildRecommendedAreaGuides({directGuides: look.areaGuides, look})
      : buildRecommendedAreaGuides({look}),
  };
}

type ApiKeyword = Partial<MakeupTrendKeyword> & {badge?: string; kind?: string};
type ApiSituation = Partial<Omit<MakeupSituation, 'keywords' | 'key'>> & {
  key?: string;
  keywords?: ApiKeyword[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMakeupRecommendationUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

const SITUATION_KEYS = new Set<MakeupSituationKey>([
  'daily', 'work', 'date', 'social', 'formal_event', 'travel_outdoor', 'camera_content', 'festival_performance',
]);
const REQUIRED_DISCOVERY_KEYS = new Set<MakeupSituationKey>([
  'daily', 'formal_event', 'camera_content', 'festival_performance',
]);
const BADGES = new Set<MakeupTrendBadge>([
  'TREND_K_BEAUTY_2026', 'TREND_GLOBAL_SS26', 'STEADY', 'CURATED',
]);

function normalizeKeyword(value: ApiKeyword): MakeupTrendKeyword | null {
  if (!isMakeupRecommendationUuid(value.id) || !value.label?.trim()) return null;
  const requestedBadge = BADGES.has(value.badge as MakeupTrendBadge) ? value.badge as MakeupTrendBadge : 'CURATED';
  const hasTrendEvidence = Boolean(value.sourceName?.trim() && value.sourcePublishedAt && value.asOf && value.expiresAt);
  const badge = requestedBadge.startsWith('TREND_') && !hasTrendEvidence ? 'CURATED' : requestedBadge;
  const kind = badge === 'STEADY' ? 'steady' : badge === 'CURATED' ? 'curated' : 'trend';
  return {
    id: value.id.trim(),
    label: value.label.trim(),
    kind,
    badge,
    marketScope: value.marketScope?.trim() || undefined,
    seedPrompt: value.seedPrompt?.trim() || value.label.trim(),
    tags: Array.isArray(value.tags) ? value.tags.filter(Boolean) : [],
    sourceName: value.sourceName?.trim() || undefined,
    sourceUrl: value.sourceUrl?.trim() || undefined,
    sourcePublishedAt: value.sourcePublishedAt,
    asOf: value.asOf,
    expiresAt: value.expiresAt,
    confidence: value.confidence === 'A' || value.confidence === 'B' ? value.confidence : undefined,
  };
}

export function normalizeMakeupRecommendationDiscovery(value: unknown): MakeupRecommendationDiscovery | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as {generatedAt?: string; situations?: ApiSituation[]; sourceReports?: Array<{id?: string}>};
  if (!Array.isArray(payload.situations) || payload.situations.length !== REQUIRED_DISCOVERY_KEYS.size) return null;
  const situations = payload.situations.flatMap(item => {
    if (!SITUATION_KEYS.has(item.key as MakeupSituationKey) || !isMakeupRecommendationUuid(item.id) || !item.label?.trim()) return [];
    if (!Array.isArray(item.keywords) || item.keywords.length === 0) return [];
    const keywords = item.keywords.map(normalizeKeyword).filter((keyword): keyword is MakeupTrendKeyword => Boolean(keyword));
    if (
      keywords.length !== item.keywords.length
      || new Set(keywords.map(keyword => keyword.id)).size !== keywords.length
    ) return [];
    const key = item.key as MakeupSituationKey;
    return [{
      id: item.id.trim(),
      key,
      label: item.label.trim(),
      description: item.description?.trim() || '',
      imageAssetKey: SITUATION_KEYS.has(item.imageAssetKey as MakeupSituationKey) ? item.imageAssetKey as MakeupSituationKey : key,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 999,
      keywords,
    }];
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  const situationIds = situations.map(situation => situation.id);
  const situationKeys = situations.map(situation => situation.key);
  const sourceReports = payload.sourceReports ?? [];
  if (
    situations.length !== REQUIRED_DISCOVERY_KEYS.size
    || new Set(situationIds).size !== situations.length
    || new Set(situationKeys).size !== situations.length
    || situationKeys.some(key => !REQUIRED_DISCOVERY_KEYS.has(key))
    || sourceReports.some(report => !isMakeupRecommendationUuid(report.id))
  ) return null;
  return {
    generatedAt: payload.generatedAt ?? new Date().toISOString(),
    situations,
    source: 'api',
    sourceReportIds: sourceReports.map(report => report.id?.trim() ?? ''),
  };
}

export function isValidGuideArea(value: string | undefined): value is MakeupGuideArea {
  return isGuideArea(value);
}
