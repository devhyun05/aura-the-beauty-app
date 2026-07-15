import {auradinDraftMock} from '../mocks/auradin.mock';
import type {AuradinDraftData} from '../types';

export async function getAuradinDraftData(): Promise<AuradinDraftData> {
  if (__DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1') {
    return auradinDraftMock;
  }
  throw new Error('아우라딘 초안 fixture가 비활성화되어 있어요.');
}
