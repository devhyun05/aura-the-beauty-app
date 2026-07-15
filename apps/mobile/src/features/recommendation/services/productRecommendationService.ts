import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {productRecommendationMock} from '../mocks/productRecommendation.mock';
import type {
  ProductRecommendationCategory,
  ProductRecommendationData,
  ProductRecommendationLook,
  ProductRecommendationLookOption,
  ProductRecommendationSet,
  ProductRecommendationTab,
  RecommendedProduct,
} from '../types';

type BackendProductCategory = Exclude<ProductRecommendationCategory, 'all'>;

type BackendRecommendedProduct = {
  brandName?: string | null;
  category?: string | null;
  externalSource?: string | null;
  id?: string | null;
  imageUrl?: string | null;
  matchRate?: number | null;
  palette?: string[] | null;
  price?: number | null;
  priceKrw?: number | null;
  productName?: string | null;
  productInfo?: RecommendedProduct['productInfo'] | null;
  purchaseUrl?: string | null;
  reason?: string | null;
  shadeName?: string | null;
  tags?: string[] | null;
};

type BackendProductRecommendationLook = {
  description?: string | null;
  imageUrl?: string | null;
  index?: number | null;
  palette?: string[] | null;
  subtitle?: string | null;
  tags?: string[] | null;
  title?: string | null;
};

type BackendProductRecommendationData = {
  makeupLook?: BackendProductRecommendationLook | null;
  makeupLookOptions?: BackendProductRecommendationLook[] | null;
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
  'brow',
]);

const internalCatalogProductIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTrustedCatalogProductId(productId: string): boolean {
  return internalCatalogProductIdPattern.test(productId.trim());
}

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

function mapProduct(product: BackendRecommendedProduct): RecommendedProduct {
  const category = normalizeCategory(product.category);
  const imageUrl = firstText(product.imageUrl)!;

  return {
    id: firstText(product.id) ?? '',
    externalSource: firstText(product.externalSource),
    brandName: firstText(product.brandName) ?? '',
    productName: firstText(product.productName) ?? '',
    shadeName: firstText(product.shadeName) ?? '',
    category,
    matchRate:
      typeof product.matchRate === 'number' ? product.matchRate : 0,
    price:
      typeof product.price === 'number'
        ? product.price
        : typeof product.priceKrw === 'number'
          ? product.priceKrw
          : 0,
    tags: normalizeTextArray(product.tags, []),
    imageUrl,
    imageSource: {uri: imageUrl},
    purchaseUrl: firstText(product.purchaseUrl),
    palette: normalizeTextArray(product.palette, []),
    productInfo: product.productInfo ?? undefined,
    reason: firstText(product.reason) ?? '추천 조건을 확인했어요.',
  };
}

function isPurchasableBackendProduct(product: BackendRecommendedProduct): boolean {
  return Boolean(
    firstText(product.id) &&
    firstText(product.brandName) &&
    firstText(product.productName) &&
    firstText(product.imageUrl) &&
    firstText(product.purchaseUrl),
  );
}

function mapMakeupLook(
  makeupLook: BackendProductRecommendationLook | null | undefined,
): ProductRecommendationLook {
  const imageUrl = firstText(makeupLook?.imageUrl);

  return {
    title: firstText(makeupLook?.title) ?? '분석 기준 없음',
    description: firstText(makeupLook?.description) ?? '연결된 분석이나 추천 기준 룩이 없어요.',
    imageUrl,
    imageSource: imageUrl ? {uri: imageUrl} : {uri: ''},
    tags: normalizeTextArray(makeupLook?.tags, []),
    palette: normalizeTextArray(makeupLook?.palette, []),
  };
}

function mapMakeupLookOption(
  makeupLook: BackendProductRecommendationLook,
  index: number,
): ProductRecommendationLookOption {
  const mappedLook = mapMakeupLook(makeupLook);

  return {
    ...mappedLook,
    index: typeof makeupLook.index === 'number' ? makeupLook.index : index,
    subtitle: firstText(makeupLook.subtitle),
  };
}

function mapMakeupLookOptions(
  response: BackendProductRecommendationData,
  makeupLook: ProductRecommendationLook,
): ProductRecommendationLookOption[] {
  if (Array.isArray(response.makeupLookOptions) && response.makeupLookOptions.length > 0) {
    return response.makeupLookOptions.map(mapMakeupLookOption);
  }

  return [{...makeupLook, index: 0}];
}

function mapProductRecommendationData(
  response: BackendProductRecommendationData,
): ProductRecommendationData {
  const products = Array.isArray(response.products)
    ? response.products.filter(isPurchasableBackendProduct).map(mapProduct)
    : [];
  const makeupLook = mapMakeupLook(response.makeupLook);

  return {
    userNickname: firstText(response.userNickname) ?? '회원',
    makeupLook,
    makeupLookOptions: mapMakeupLookOptions(response, makeupLook),
    tabs:
      Array.isArray(response.tabs) && response.tabs.length > 0
        ? response.tabs
        : [
          {id: 'all', label: '전체'},
          {id: 'lip', label: '립'},
          {id: 'cheek', label: '치크'},
          {id: 'shadow', label: '아이'},
          {id: 'base', label: '베이스'},
          {id: 'brow', label: '브로우'},
          {id: 'liner', label: '아이라이너'},
        ],
    products,
    sets:
      Array.isArray(response.sets) && response.sets.length > 0
        ? response.sets
        : [],
  };
}

function buildEmptyApiRecommendationData(): ProductRecommendationData {
  return {
    userNickname: '회원',
    makeupLook: {
      title: '분석 기준 없음',
      description: '연결된 분석이나 추천 기준 룩이 없어요.',
      imageSource: {uri: ''},
      tags: [],
      palette: [],
    },
    makeupLookOptions: [],
    tabs: [
      {id: 'all', label: '전체'},
      {id: 'lip', label: '립'},
      {id: 'cheek', label: '치크'},
      {id: 'shadow', label: '아이'},
      {id: 'base', label: '베이스'},
      {id: 'brow', label: '브로우'},
      {id: 'liner', label: '아이라이너'},
    ],
    products: [],
    sets: [],
  };
}

type ProductRecommendationRequest = {
  lookIndex?: number | null;
  reportId?: string | null;
};

export const getProductRecommendations = async ({
  lookIndex,
  reportId,
}: ProductRecommendationRequest = {}): Promise<ProductRecommendationData> => {
  if (!getBackendApiBaseUrl()) {
    return __DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1'
      ? productRecommendationMock
      : buildEmptyApiRecommendationData();
  }

  const searchParams = new URLSearchParams();

  if (reportId) {
    searchParams.set('report_id', reportId);
  }

  if (typeof lookIndex === 'number' && lookIndex >= 0) {
    searchParams.set('look_index', String(lookIndex));
  }

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await requestBackendJson<BackendProductRecommendationData>(
    `/products/recommendations${query}`,
  );
  return mapProductRecommendationData(response);
};
