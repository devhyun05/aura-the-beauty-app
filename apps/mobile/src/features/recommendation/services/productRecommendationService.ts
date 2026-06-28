import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {productRecommendationMock} from '../mocks/productRecommendation.mock';
import type {
  ProductRecommendationCategory,
  ProductRecommendationData,
  ProductRecommendationLook,
  ProductRecommendationSet,
  ProductRecommendationTab,
  RecommendedProduct,
} from '../types';

type BackendProductCategory = Exclude<ProductRecommendationCategory, 'all'>;

type BackendRecommendedProduct = {
  brandName?: string | null;
  category?: string | null;
  id?: string | null;
  imageUrl?: string | null;
  matchRate?: number | null;
  palette?: string[] | null;
  price?: number | null;
  productName?: string | null;
  purchaseUrl?: string | null;
  reason?: string | null;
  shadeName?: string | null;
  tags?: string[] | null;
};

type BackendProductRecommendationLook = {
  description?: string | null;
  imageUrl?: string | null;
  palette?: string[] | null;
  tags?: string[] | null;
  title?: string | null;
};

type BackendProductRecommendationData = {
  makeupLook?: BackendProductRecommendationLook | null;
  products?: BackendRecommendedProduct[] | null;
  sets?: ProductRecommendationSet[] | null;
  tabs?: ProductRecommendationTab[] | null;
  userNickname?: string | null;
};

const productCategories = new Set<BackendProductCategory>([
  'lip',
  'cheek',
  'shadow',
  'liner',
  'base',
]);

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}

function normalizeCategory(value: string | null | undefined): BackendProductCategory {
  return productCategories.has(value as BackendProductCategory)
    ? (value as BackendProductCategory)
    : 'lip';
}

function normalizeTextArray(
  value: string[] | null | undefined,
  fallback: string[],
): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.filter((item) => item.trim());

  return normalized.length > 0 ? normalized : fallback;
}

function getFallbackProduct(index: number, category?: BackendProductCategory): RecommendedProduct {
  const categoryFallback = category
    ? productRecommendationMock.products.find((product) => product.category === category)
    : undefined;

  return (
    categoryFallback ??
    productRecommendationMock.products[index % productRecommendationMock.products.length] ??
    productRecommendationMock.products[0]
  );
}

function mapProduct(product: BackendRecommendedProduct, index: number): RecommendedProduct {
  const category = normalizeCategory(product.category);
  const fallbackProduct = getFallbackProduct(index, category);
  const imageUrl = firstText(product.imageUrl);

  return {
    ...fallbackProduct,
    id: firstText(product.id) ?? fallbackProduct.id,
    brandName: firstText(product.brandName) ?? fallbackProduct.brandName,
    productName: firstText(product.productName) ?? fallbackProduct.productName,
    shadeName: firstText(product.shadeName) ?? fallbackProduct.shadeName,
    category,
    matchRate:
      typeof product.matchRate === 'number' ? product.matchRate : fallbackProduct.matchRate,
    price: typeof product.price === 'number' ? product.price : fallbackProduct.price,
    tags: normalizeTextArray(product.tags, fallbackProduct.tags),
    imageSource: imageUrl ? {uri: imageUrl} : fallbackProduct.imageSource,
    purchaseUrl: firstText(product.purchaseUrl, fallbackProduct.purchaseUrl),
    palette: normalizeTextArray(product.palette, fallbackProduct.palette),
    reason: firstText(product.reason) ?? fallbackProduct.reason,
  };
}

function mapMakeupLook(
  makeupLook: BackendProductRecommendationLook | null | undefined,
): ProductRecommendationLook {
  const fallbackLook = productRecommendationMock.makeupLook;
  const imageUrl = firstText(makeupLook?.imageUrl);

  return {
    ...fallbackLook,
    title: firstText(makeupLook?.title) ?? fallbackLook.title,
    description: firstText(makeupLook?.description) ?? fallbackLook.description,
    imageSource: imageUrl ? {uri: imageUrl} : fallbackLook.imageSource,
    tags: normalizeTextArray(makeupLook?.tags, fallbackLook.tags),
    palette: normalizeTextArray(makeupLook?.palette, fallbackLook.palette),
  };
}

function buildFallbackSets(products: RecommendedProduct[]): ProductRecommendationSet[] {
  const productIds = products.slice(0, 3).map((product) => product.id);

  if (productIds.length === 0) {
    return [];
  }

  return [
    {
      id: 'api-recommendation-set',
      title: '국내 구매 가능 추천 조합',
      description: '쇼핑 API에서 가져온 상품 중 룩과 잘 맞는 제품을 묶었어요.',
      productIds,
    },
  ];
}

function mapProductRecommendationData(
  response: BackendProductRecommendationData,
): ProductRecommendationData {
  const products = Array.isArray(response.products)
    ? response.products.map(mapProduct)
    : productRecommendationMock.products;

  return {
    userNickname: firstText(response.userNickname) ?? productRecommendationMock.userNickname,
    makeupLook: mapMakeupLook(response.makeupLook),
    tabs:
      Array.isArray(response.tabs) && response.tabs.length > 0
        ? response.tabs
        : productRecommendationMock.tabs,
    products,
    sets:
      Array.isArray(response.sets) && response.sets.length > 0
        ? response.sets
        : buildFallbackSets(products),
  };
}

export const getProductRecommendations = async (): Promise<ProductRecommendationData> => {
  if (!getBackendApiBaseUrl()) {
    return productRecommendationMock;
  }

  try {
    const response = await requestBackendJson<BackendProductRecommendationData>(
      '/products/recommendations',
    );

    return mapProductRecommendationData(response);
  } catch (error) {
    console.info('[aura:products] recommendations:fallback', {
      message: error instanceof Error ? error.message : String(error),
    });

    return productRecommendationMock;
  }
};
