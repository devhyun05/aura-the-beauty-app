import type {ImageSourcePropType} from 'react-native';

import {productsMock} from '../mocks/products.mock';
import type {Product} from '../types/profile';
import {getBackendApiBaseUrl, requestBackendJson} from './backendApi';

type BackendProduct = {
  brandName?: string | null;
  id?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  priceKrw?: number | null;
  productName?: string | null;
};

type BackendLikedProductsResponse = {
  products?: BackendProduct[] | null;
};

export type ProductLikePayload = {
  brandName: string;
  category?: string;
  id: string;
  imageUrl?: string;
  matchRate?: number;
  palette?: string[];
  price: number;
  productInfo?: Record<string, unknown>;
  productName: string;
  purchaseUrl?: string;
  reason?: string;
  shadeName?: string;
  tags?: string[];
};

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}

function mapBackendProduct(product: BackendProduct): Product | null {
  const id = firstText(product.id);
  const brandName = firstText(product.brandName);
  const productName = firstText(product.productName);
  const imageUrl = firstText(product.imageUrl);

  if (!id || !brandName || !productName || !imageUrl) {
    return null;
  }

  return {
    id,
    brandName,
    productName,
    price:
      typeof product.price === 'number'
        ? product.price
        : typeof product.priceKrw === 'number'
          ? product.priceKrw
          : 0,
    imageSource: {uri: imageUrl} as ImageSourcePropType,
    isLiked: true,
  };
}

export const getProducts = async (): Promise<Product[]> => {
  return Promise.resolve(productsMock);
};

export const getLikedProducts = async (): Promise<Product[]> => {
  if (!getBackendApiBaseUrl()) {
    return productsMock.filter((product) => product.isLiked);
  }

  try {
    const response = await requestBackendJson<BackendLikedProductsResponse>('/products/liked');

    return Array.isArray(response.products)
      ? response.products
          .map(mapBackendProduct)
          .filter((product): product is Product => Boolean(product))
      : [];
  } catch (error) {
    console.info('[aura:products] liked:fallback-empty', {
      message: error instanceof Error ? error.message : String(error),
    });

    return [];
  }
};

export const getLikedProductPreviews = async (
  limit = 3,
): Promise<Product[]> => {
  const products = await getLikedProducts();

  return products.slice(0, limit);
};

export const likeProduct = async (product: ProductLikePayload): Promise<boolean> => {
  if (!getBackendApiBaseUrl()) {
    return true;
  }

  await requestBackendJson<{liked: boolean; productId: string}>(
    `/products/${encodeURIComponent(product.id)}/like`,
    {
      method: 'POST',
      body: {product},
    },
  );

  return true;
};

export const unlikeProduct = async (productId: string): Promise<boolean> => {
  if (!getBackendApiBaseUrl()) {
    return true;
  }

  await requestBackendJson<{liked: boolean; productId: string}>(
    `/products/${encodeURIComponent(productId)}/like`,
    {method: 'DELETE'},
  );

  return true;
};
