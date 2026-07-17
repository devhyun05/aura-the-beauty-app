import {MAKEUP_LOOK_FIXTURES} from '../data/makeupRecommendationCatalog';
import type {
  MakeupArea,
  MakeupGuideArea,
  MakeupLookRecommendation,
  MakeupRecommendationDiscovery,
  MakeupRecommendationProduct,
  MakeupRecommendationStep,
  MakeupSituation,
  MakeupSituationKey,
  MakeupTrendBadge,
  MakeupTrendKeyword,
  RecommendedMakeupAreaGuide,
} from '../types';

export type ApiAreaGuide = Partial<Omit<RecommendedMakeupAreaGuide, 'area' | 'color' | 'avoid' | 'products' | 'steps'>> & {
  area?: string;
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

const SITUATION_KEYS = new Set<MakeupSituationKey>([
  'daily', 'work', 'date', 'social', 'formal_event', 'travel_outdoor', 'camera_content', 'festival_performance',
]);
const BADGES = new Set<MakeupTrendBadge>([
  'TREND_K_BEAUTY_2026', 'TREND_GLOBAL_SS26', 'STEADY', 'CURATED',
]);

function normalizeKeyword(value: ApiKeyword): MakeupTrendKeyword | null {
  if (!value.id?.trim() || !value.label?.trim()) return null;
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
  if (!Array.isArray(payload.situations)) return null;
  const situations = payload.situations.flatMap(item => {
    if (!SITUATION_KEYS.has(item.key as MakeupSituationKey) || !item.id?.trim() || !item.label?.trim()) return [];
    const keywords = (item.keywords ?? []).map(normalizeKeyword).filter((keyword): keyword is MakeupTrendKeyword => Boolean(keyword));
    if (keywords.length === 0) return [];
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
  return situations.length > 0 ? {
    generatedAt: payload.generatedAt ?? new Date().toISOString(),
    situations,
    source: 'api',
    sourceReportIds: (payload.sourceReports ?? []).flatMap(report => report.id?.trim() ? [report.id.trim()] : []),
  } : null;
}

export function isValidGuideArea(value: string | undefined): value is MakeupGuideArea {
  return isGuideArea(value);
}