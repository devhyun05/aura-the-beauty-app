import {
  getPersonalizedRecommendations,
  getSeasonalRecommendations,
} from '../../recommendation/services/productHubService';
import type {CatalogProduct} from '../../recommendation/types';

export type HomeProductShelf = 'personalized' | 'seasonal';

export type HomeFeedContent = {
  productShelf: HomeProductShelf;
  products: readonly CatalogProduct[];
};

export const emptyHomeFeedContent: HomeFeedContent = {
  productShelf: 'seasonal',
  products: [],
};

const HOME_PRODUCT_LIMIT = 8;

export async function getHomeFeedContent({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}): Promise<HomeFeedContent> {
  const productResult = await loadHomeProducts(isAuthenticated);

  return {
    productShelf: productResult.shelf,
    products: productResult.products,
  };
}

export function getHomeProductImageUri(
  product: CatalogProduct,
): string | undefined {
  return getRemoteImageUri(product.imageUrl);
}

function getRemoteImageUri(value: string | null | undefined): string | undefined {
  const uri = value?.trim();

  return uri && /^https?:\/\//i.test(uri) ? uri : undefined;
}

function getEligibleProducts(
  products: readonly CatalogProduct[],
): CatalogProduct[] {
  const seenProductKeys = new Set<string>();

  return products.filter(product => {
    const productId = typeof product.productId === 'string'
      ? product.productId.trim()
      : '';
    const brandName = typeof product.brandName === 'string'
      ? product.brandName.trim()
      : '';
    const productName = typeof product.productName === 'string'
      ? product.productName.trim()
      : '';
    const productKey = `${productId}:${product.shadeId ?? 'family'}`;
    const isEligible = Boolean(
      productId
      && brandName
      && productName
      && product.status !== 'unavailable'
      && product.status !== 'soldOut'
      && getHomeProductImageUri(product),
    );

    if (!isEligible || seenProductKeys.has(productKey)) {
      return false;
    }

    seenProductKeys.add(productKey);
    return true;
  }).slice(0, HOME_PRODUCT_LIMIT);
}

async function loadHomeProducts(isAuthenticated: boolean): Promise<{
  products: CatalogProduct[];
  shelf: HomeProductShelf;
}> {
  if (isAuthenticated) {
    try {
      const personalized = await getPersonalizedRecommendations(HOME_PRODUCT_LIMIT);
      const products = getEligibleProducts(personalized.items);

      if (products.length > 0) {
        return {products, shelf: 'personalized'};
      }
    } catch {
      // Keep the approved product rail available through the public shelf.
    }
  }

  try {
    const seasonal = await getSeasonalRecommendations(undefined, HOME_PRODUCT_LIMIT);
    return {
      products: getEligibleProducts(seasonal.items),
      shelf: 'seasonal',
    };
  } catch {
    return {products: [], shelf: 'seasonal'};
  }
}
