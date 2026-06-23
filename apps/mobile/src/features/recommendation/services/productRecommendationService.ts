import {productRecommendationMock} from '../mocks/productRecommendation.mock';
import type {ProductRecommendationData} from '../types';

export const getProductRecommendations = async (): Promise<ProductRecommendationData> => {
  return productRecommendationMock;
};
