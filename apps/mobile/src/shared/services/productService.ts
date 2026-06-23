import { productsMock } from '../mocks/products.mock';
import type { Product } from '../types/userPage';

export const getProducts = async (): Promise<Product[]> => {
  return Promise.resolve(productsMock);
};

export const getLikedProducts = async (): Promise<Product[]> => {
  return Promise.resolve(productsMock.filter((product) => product.isLiked));
};

export const getLikedProductPreview = async (
  limit = 3,
): Promise<Product[]> => {
  return Promise.resolve(
    productsMock.filter((product) => product.isLiked).slice(0, limit),
  );
};
