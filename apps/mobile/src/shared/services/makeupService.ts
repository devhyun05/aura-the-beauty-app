import { makeupLooksMock } from '../mocks/makeupLooks.mock';
import type { MakeupLook } from '../types/myPage';

export const getMakeupLooks = async (): Promise<MakeupLook[]> => {
  return Promise.resolve(makeupLooksMock);
};

export const getMakeupLookPreview = async (
  limit = 3,
): Promise<MakeupLook[]> => {
  return Promise.resolve(makeupLooksMock.slice(0, limit));
};
