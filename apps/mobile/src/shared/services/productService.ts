import { productsMock } from '../mocks/products.mock';
import type { Product } from '../types/profile';

export const getProducts = async (): Promise<Product[]> => {
  return Promise.resolve(productsMock);
};

export const getLikedProducts = async (): Promise<Product[]> => {
  return Promise.resolve(productsMock.filter((product) => product.isLiked));
};

export const getLikedProductPreviews = async (
  limit = 3,
): Promise<Product[]> => {
  return Promise.resolve(
    productsMock.filter((product) => product.isLiked).slice(0, limit),
  );
};
