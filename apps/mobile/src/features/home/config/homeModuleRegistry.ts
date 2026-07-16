import type {CatalogProduct} from '../../recommendation/types';
import {
  emptyHomeFeedContent,
  getHomeProductImageUri,
  type HomeFeedContent,
} from '../services/homeFeedService';
import type {
  HomeAudienceState,
  HomeFeatureConfig,
  HomeFeatureId,
  HomeModuleConfig,
  HomeModuleId,
  HomeModuleItem,
} from '../types/homeModules';

const faceAnalysisFeatureImage = require('../../../assets/images/home-modules/face-analysis-diagnosis-v2.webp') as number;
const makeupRecommendationScenarios = [
  {
    imageSource: require('../../../assets/images/home-modules/makeup-scenario-date-night-v3.webp') as number,
    title: '데이트',
  },
  {
    imageSource: require('../../../assets/images/home-modules/makeup-scenario-baseball-night-v3.webp') as number,
    title: '야구장 전광판',
  },
  {
    imageSource: require('../../../assets/images/home-modules/makeup-scenario-romance-fantasy-v3.webp') as number,
    title: '로판 여주',
  },
] as const;
const makeupExtractionImage = require('../../../assets/images/home-modules/makeup-extraction-v2.webp') as number;
const makeupFeedbackImage = require('../../../assets/images/home-modules/makeup-feedback-v2.webp') as number;
const auradinDiscoveryImage = require('../../../assets/images/home-modules/auradin-discovery-v2.webp') as number;
const consultingImage = {
  uri: 'https://d3t1pbvtir1lj.cloudfront.net/uploads/optimized/consulting/consulting-hero-makeup.jpg',
} as const;

export const defaultHomeAudienceState: HomeAudienceState = {
  hasCompletedFaceAnalysis: false,
  isAuthenticated: false,
  recentActivityCount: 0,
};

export const homeFeatureRegistry = {
  faceAnalysis: feature('faceAnalysis', 'AI 얼굴 진단'),
  makeupRecommendation: feature('makeupRecommendation', '메이크업 추천'),
  productRecommendation: feature('productRecommendation', '추천 제품'),
  auradin: feature('auradin', 'AURA딘'),
  makeupExtraction: feature('makeupExtraction', '메이크업 추출', 'actionSheet'),
  makeupFeedback: feature('makeupFeedback', '메이크업 피드백', 'actionSheet'),
  consulting: feature('consulting', '전문가 컨설팅', 'mainTab'),
  savedMakeup: feature('savedMakeup', '저장한 메이크업', 'route', true),
  likedProducts: feature('likedProducts', '찜한 제품', 'route', true),
  arFilter: feature('arFilter', '메이크업 필터'),
  filterStore: feature('filterStore', '필터 스토어'),
} as const satisfies Readonly<Record<HomeFeatureId, HomeFeatureConfig>>;

export const homeModuleRegistry = {
  faceAnalysis: {
    ctaLabel: 'AI 진단 시작하기',
    featureId: 'faceAnalysis',
    id: 'faceAnalysis',
    imageSources: [faceAnalysisFeatureImage],
    kind: 'faceAnalysis',
    title: 'AI 얼굴 진단',
    visibility: 'always',
  },
  products: {
    ctaLabel: '더보기',
    featureId: 'productRecommendation',
    id: 'products',
    imageSources: [],
    items: [],
    kind: 'products',
    title: '추천 제품',
    visibility: 'always',
  },
  makeupRecommendation: {
    ctaLabel: '상황 골라보기',
    description: '얼굴 분석을 바탕으로, 고른 상황의 메이크업을 내 얼굴에 미리 입혀봐요.',
    featureId: 'makeupRecommendation',
    id: 'makeupRecommendation',
    imageSources: makeupRecommendationScenarios.map(scenario => scenario.imageSource),
    items: makeupRecommendationScenarios.map((scenario, index) => ({
      featureId: 'makeupRecommendation' as const,
      id: `makeup-recommendation-${index + 1}`,
      imageSource: scenario.imageSource,
      title: scenario.title,
    })),
    kind: 'makeupRecommendation',
    title: '오늘의 메이크업 추천',
    visibility: 'always',
  },
  makeupExtraction: {
    ctaLabel: '메이크업 추출하기',
    featureId: 'makeupExtraction',
    id: 'makeupExtraction',
    imageSources: [makeupExtractionImage],
    kind: 'makeupExtraction',
    title: '메이크업 추출',
    visibility: 'always',
  },
  auradin: {
    ctaLabel: '검색하기',
    featureId: 'auradin',
    id: 'auradin',
    imageSources: [auradinDiscoveryImage],
    items: [],
    kind: 'auradin',
    title: 'AURA딘',
    visibility: 'always',
  },
  makeupFeedback: {
    ctaLabel: '피드백 받기',
    featureId: 'makeupFeedback',
    id: 'makeupFeedback',
    imageSources: [makeupFeedbackImage],
    kind: 'makeupFeedback',
    title: '메이크업 피드백',
    visibility: 'always',
  },
  consulting: {
    ctaLabel: '상담 보기',
    featureId: 'consulting',
    id: 'consulting',
    imageSources: [consultingImage],
    items: [
      {
        featureId: 'consulting',
        id: 'consulting-feature',
        imageSource: consultingImage,
        title: '전문가와 함께 완성하기',
      },
    ],
    kind: 'consulting',
    title: '전문가 컨설팅',
    visibility: 'always',
  },
} as const satisfies Readonly<Record<HomeModuleId, HomeModuleConfig>>;

export const defaultHomeModuleOrder = [
  'faceAnalysis',
  'products',
  'makeupRecommendation',
  'makeupExtraction',
  'auradin',
  'makeupFeedback',
  'consulting',
] as const satisfies readonly HomeModuleId[];

export function getHomeFeature(featureId: HomeFeatureId): HomeFeatureConfig {
  return homeFeatureRegistry[featureId];
}

export function getHomeModule(moduleId: HomeModuleId): HomeModuleConfig {
  return homeModuleRegistry[moduleId];
}

export function isHomeModuleVisible(
  module: HomeModuleConfig,
  _audience: HomeAudienceState,
): boolean {
  return homeFeatureRegistry[module.featureId].enabled;
}

export function getPrioritizedHomeModuleIds(
  _audience: HomeAudienceState,
): HomeModuleId[] {
  return [...defaultHomeModuleOrder];
}

export function getVisibleHomeModules(
  audience: HomeAudienceState,
  content: HomeFeedContent = emptyHomeFeedContent,
): HomeModuleConfig[] {
  return getPrioritizedHomeModuleIds(audience)
    .map(getHomeModule)
    .filter(module => isHomeModuleVisible(module, audience))
    .map(module => resolveHomeModule(module, content));
}

function resolveHomeModule(
  module: HomeModuleConfig,
  content: HomeFeedContent,
): HomeModuleConfig {
  if (module.id === 'products') {
    const items = content.products.map(product => mapProductItem(
      product,
      content.productShelf,
    ));

    return {
      ...module,
      imageSources: items.flatMap(item => item.imageSource ? [item.imageSource] : []),
      items,
    };
  }

  return module;
}

function mapProductItem(
  product: CatalogProduct,
  source: HomeFeedContent['productShelf'],
): HomeModuleItem {
  const imageUri = getHomeProductImageUri(product);
  const priceAmount = product.price?.amount;
  const priceCurrency = product.price?.currency || 'KRW';

  return {
    description: product.productName,
    eyebrow: product.brandName,
    featureId: 'productRecommendation',
    id: `product-${product.productId}-${product.shadeId ?? 'family'}`,
    imageSource: imageUri ? {uri: imageUri} : undefined,
    metadata: {
      canLike: product.canLike !== false,
      currency: priceCurrency,
      liked: product.viewerState.liked,
      ...(product.externalSource
        ? {externalSource: product.externalSource}
        : {}),
      ...(product.offer?.offerId ? {offerId: product.offer.offerId} : {}),
      ...(product.purchaseUrl ? {purchaseUrl: product.purchaseUrl} : {}),
      ...(typeof priceAmount === 'number' ? {price: priceAmount} : {}),
      ...(product.shadeId ? {shadeId: product.shadeId} : {}),
      ...(product.disclosureLabel
        ? {disclosureLabel: product.disclosureLabel}
        : {}),
      ...(product.sponsored !== undefined
        ? {sponsored: product.sponsored}
        : {}),
      ...(product.sponsorshipType
        ? {sponsorshipType: product.sponsorshipType}
        : {}),
      source,
    },
    targetId: product.productId,
    title: product.productName,
  };
}

function feature(
  id: HomeFeatureId,
  label: string,
  presentation: HomeFeatureConfig['presentation'] = 'route',
  requiresAuth = false,
): HomeFeatureConfig {
  return {enabled: true, id, label, presentation, requiresAuth};
}
