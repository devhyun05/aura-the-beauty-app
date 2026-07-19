import type {ImageSourcePropType} from 'react-native';

import {productsMock} from '../mocks/products.mock';
import type {Product} from '../types/profile';
import {getBackendAuthToken} from './backendApi';
import {
  getProductBackendApiBaseUrl,
  requestProductBackendJson,
} from './productBackendApi';

type BackendProduct = {
  brandName?: string | null;
  id?: string | null;
  imageUrl?: string | null;
  price?: number | {amount?: number | null} | null;
  priceKrw?: number | null;
  productName?: string | null;
  productId?: string | null;
  shadeId?: string | null;
  status?: 'active' | 'soldOut' | 'unavailable';
  canUnlike?: boolean;
  externalSource?: string | null;
  purchaseUrl?: string | null;
};

type BackendLikedProductsResponse = {
  products?: BackendProduct[] | null;
};

type ProductPreferenceMutation = () => Promise<void>;

const productPreferenceMutationQueues = new Map<string, Promise<void>>();
let productPreferenceMutationRevision = 0;

export function getProductPreferenceMutationRevision(): number {
  return productPreferenceMutationRevision;
}

function recordProductPreferenceMutation(): void {
  productPreferenceMutationRevision += 1;
}

async function runProductPreferenceMutation(
  key: string,
  mutation: ProductPreferenceMutation,
): Promise<boolean> {
  const previous = productPreferenceMutationQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(mutation);
  productPreferenceMutationQueues.set(key, current);

  try {
    await current;
    recordProductPreferenceMutation();
    return true;
  } finally {
    if (productPreferenceMutationQueues.get(key) === current) {
      productPreferenceMutationQueues.delete(key);
    }
  }
}

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}

function mapBackendProduct(product: BackendProduct): Product | null {
  const id = firstText(product.productId, product.id);
  const brandName = firstText(product.brandName);
  const productName = firstText(product.productName);
  const imageUrl = firstText(product.imageUrl);

  if (!id) {
    return null;
  }
  if (product.status === 'unavailable' && product.canUnlike) {
    return {
      id,
      brandName: '',
      productName: '',
      price: 0,
      isLiked: true,
      status: 'unavailable',
      canUnlike: true,
      externalSource: product.externalSource ?? null,
    };
  }
  if (!brandName || !productName || !imageUrl) return null;

  return {
    id,
    shadeId: product.shadeId ?? null,
    brandName,
    productName,
    price:
      typeof product.price === 'number'
        ? product.price
        : typeof product.priceKrw === 'number'
          ? product.priceKrw
          : typeof product.price === 'object' && typeof product.price?.amount === 'number'
            ? product.price.amount
          : 0,
    imageSource: {uri: imageUrl} as ImageSourcePropType,
    isLiked: true,
    status: product.status ?? 'active',
    canUnlike: product.canUnlike ?? true,
    externalSource: product.externalSource ?? null,
    purchaseUrl: product.purchaseUrl ?? null,
  };
}

export const getProducts = async (): Promise<Product[]> => {
  return __DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1'
    ? productsMock
    : [];
};

export const getLikedProducts = async (
  {timeoutMs}: {timeoutMs?: number} = {},
): Promise<Product[]> => {
  if (!getProductBackendApiBaseUrl()) {
    return __DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1'
      ? productsMock.filter((product) => product.isLiked)
      : [];
  }

  const response = await requestProductBackendJson<BackendLikedProductsResponse>(
    '/products/liked',
    {timeoutMs},
  );
  return Array.isArray(response.products)
    ? response.products
        .map(mapBackendProduct)
        .filter((product): product is Product => Boolean(product))
    : [];
};

export const getLikedProductPreviews = async (
  limit = 3,
  options: {timeoutMs?: number} = {},
): Promise<Product[]> => {
  const products = await getLikedProducts(options);

  return products.slice(0, limit);
};

export const likeProduct = async (
  productId: string,
  sourceShadeId?: string | null,
): Promise<boolean> => {
  if (!getProductBackendApiBaseUrl()) {
    if (__DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1') {
      recordProductPreferenceMutation();
      return true;
    }
    throw new Error('좋아요를 저장할 서버가 연결되지 않았어요.');
  }
  const authToken = getBackendAuthToken();

  return runProductPreferenceMutation(
    `catalog:${productId}`,
    async () => {
      await requestProductBackendJson<{liked: boolean; productId: string}>(
        `/products/${encodeURIComponent(productId)}/like`,
        {
          authToken,
          method: 'POST',
          body: sourceShadeId ? {sourceShadeId} : {},
        },
      );
    },
  );
};

export const likeExternalProduct = async (
  productId: string,
  externalSource: string,
): Promise<boolean> => {
  if (!getProductBackendApiBaseUrl()) throw new Error('좋아요를 저장할 서버가 연결되지 않았어요.');
  const authToken = getBackendAuthToken();
  return runProductPreferenceMutation(
    `external:${externalSource}:${productId}`,
    async () => {
      await requestProductBackendJson<{liked: boolean; productId: string}>(
        `/products/external/${encodeURIComponent(externalSource)}/${encodeURIComponent(productId)}/like`,
        {authToken, method: 'POST'},
      );
    },
  );
};

export const unlikeProduct = async (productId: string, externalSource?: string | null): Promise<boolean> => {
  if (!getProductBackendApiBaseUrl()) {
    if (__DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1') {
      recordProductPreferenceMutation();
      return true;
    }
    throw new Error('좋아요를 취소할 서버가 연결되지 않았어요.');
  }

  const path = externalSource
    ? `/products/external/${encodeURIComponent(externalSource)}/${encodeURIComponent(productId)}/like`
    : `/products/${encodeURIComponent(productId)}/like`;
  const mutationKey = externalSource
    ? `external:${externalSource}:${productId}`
    : `catalog:${productId}`;
  const authToken = getBackendAuthToken();
  return runProductPreferenceMutation(
    mutationKey,
    async () => {
      await requestProductBackendJson<{liked: boolean; productId: string}>(
        path,
        {authToken, method: 'DELETE'},
      );
    },
  );
};
