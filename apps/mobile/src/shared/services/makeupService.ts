import { makeupLooksMock } from '../mocks/makeupLooks.mock';
import type { MakeupLook } from '../types/profile';

export const getMakeupLooks = async (): Promise<MakeupLook[]> => {
  return Promise.resolve(makeupLooksMock);
};

export const getMakeupLookPreviews = async (
  limit = 3,
): Promise<MakeupLook[]> => {
  return Promise.resolve(makeupLooksMock.slice(0, limit));
};
