import type {CatalogProduct} from '../../recommendation/types';
import type {HomeFeedContent} from '../services/homeFeedService';
import {
  defaultHomeModuleOrder,
  getPrioritizedHomeModuleIds,
  getVisibleHomeModules,
  homeFeatureRegistry,
  homeModuleRegistry,
} from './homeModuleRegistry';
import {HOME_FEATURE_IDS, HOME_MODULE_IDS} from '../types/homeModules';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectIds(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  expect(actual.join(',') === expected.join(','), `${message}: ${actual.join(',')}`);
}

const expectedFeatureIds = [
  'faceAnalysis',
  'makeupRecommendation',
  'productRecommendation',
  'auradin',
  'makeupExtraction',
  'makeupFeedback',
  'consulting',
  'savedMakeup',
  'likedProducts',
  'arFilter',
  'filterStore',
] as const;

const expectedDefaultOrder = [
  'faceAnalysis',
  'products',
  'makeupRecommendation',
  'makeupExtraction',
  'auradin',
  'makeupFeedback',
  'consulting',
] as const;

expectIds(HOME_FEATURE_IDS, expectedFeatureIds, 'feature dispatcher ids stay stable');
expectIds(Object.keys(homeFeatureRegistry), expectedFeatureIds, 'feature registry is complete');
expectIds(HOME_MODULE_IDS, expectedDefaultOrder, 'module ids match the image-led home');
expectIds(defaultHomeModuleOrder, expectedDefaultOrder, 'default module order');

expect(
  homeFeatureRegistry.makeupExtraction.presentation === 'actionSheet'
    && homeFeatureRegistry.makeupFeedback.presentation === 'actionSheet',
  'camera and gallery features keep their existing action sheets',
);
expect(
  homeFeatureRegistry.consulting.presentation === 'mainTab',
  'consulting keeps its existing main-tab entry',
);

const audience = {
  hasCompletedFaceAnalysis: false,
  isAuthenticated: false,
  recentActivityCount: 0,
};
expectIds(
  getPrioritizedHomeModuleIds(audience),
  expectedDefaultOrder,
  'audience does not reshuffle stable content sections',
);
expectIds(
  getVisibleHomeModules(audience).map(module => module.id),
  expectedDefaultOrder,
  'every Home module is a direct feature entry, not a gated result card',
);

expect(
  homeModuleRegistry.products.imageSources.length === 0,
  'product module image sources are supplied only by the real catalog',
);
expect(
  homeFeatureRegistry.faceAnalysis.label === 'AI 얼굴 진단'
    && homeModuleRegistry.faceAnalysis.title === 'AI 얼굴 진단'
    && homeModuleRegistry.faceAnalysis.ctaLabel === 'AI 진단 시작하기'
    && homeModuleRegistry.faceAnalysis.imageSources.length === 1,
  'face analysis stays a fixed AI diagnosis entry instead of a recent-result card',
);
expect(
  homeModuleRegistry.makeupRecommendation.imageSources.length === 3
    && homeModuleRegistry.makeupRecommendation.items?.map(item => item.title).join(',')
      === '데이트,야구장 전광판,로판 여주',
  'makeup recommendation uses dedicated and visually distinct scenario previews',
);
expect(
  homeModuleRegistry.makeupRecommendation.description?.includes('얼굴 분석') === true
    && homeModuleRegistry.makeupRecommendation.ctaLabel === '상황 골라보기',
  'makeup recommendation explains face-analysis personalization without generic filter copy',
);
expect(
  homeModuleRegistry.makeupExtraction.featureId === 'makeupExtraction'
    && homeModuleRegistry.makeupExtraction.imageSources.length === 1,
  'makeup extraction is an independent image module with its existing action',
);
expect(
  homeModuleRegistry.makeupFeedback.featureId === 'makeupFeedback'
    && homeModuleRegistry.makeupFeedback.imageSources.length === 1,
  'makeup feedback is an independent image module with its existing action',
);
expect(
  homeModuleRegistry.auradin.imageSources.length === 1
    && homeModuleRegistry.auradin.featureId === 'auradin',
  'AURA딘 uses its dedicated thumbnail and keeps the direct search action',
);

const internalProduct: CatalogProduct = {
  brandName: '웨이크메이크',
  category: 'lip',
  imageUrl: 'https://cdn.example.com/product.webp',
  price: {amount: 25900, currency: 'KRW'},
  productId: '123e4567-e89b-42d3-a456-426614174000',
  productName: '리얼 컬러 립',
  shadeId: 'shade-rose',
  viewerState: {liked: false},
};
const externalProduct: CatalogProduct = {
  ...internalProduct,
  externalSource: 'licensed-catalog',
  imageUrl: 'https://cdn.example.com/external.webp',
  productId: '223e4567-e89b-42d3-a456-426614174000',
  productName: '외부 카탈로그 립',
  shadeId: null,
};
const actualContent: HomeFeedContent = {
  productShelf: 'seasonal',
  products: [internalProduct, externalProduct],
};
const resolvedModules = getVisibleHomeModules(audience, actualContent);
const productsModule = resolvedModules.find(module => module.id === 'products');
const auradinModule = resolvedModules.find(module => module.id === 'auradin');

expect(productsModule?.imageSources.length === 2, 'real product images drive prefetch sources');
expect(
  productsModule?.items?.[0]?.targetId === internalProduct.productId
    && productsModule?.items?.[0]?.metadata?.shadeId === internalProduct.shadeId,
  'internal catalog product opens its exact product and shade',
);
expect(
  productsModule?.items?.[1]?.targetId === undefined
    && productsModule?.items?.[1]?.metadata?.source === 'seasonal',
  'external catalog product returns to its real shelf instead of a broken detail route',
);
expect(
  auradinModule?.imageSources.length === 1
    && auradinModule.items?.length === 0,
  'AURA딘 thumbnail remains stable when product feed content changes',
);
