import { makeupStylesMock } from '../mocks/makeupStyles.mock';
import type { MakeupStyle } from '../types/profile';

export const getMakeupStyles = async (): Promise<MakeupStyle[]> => {
  return Promise.resolve(makeupStylesMock);
};

export const getMakeupStylePreviews = async (
  limit = 3,
): Promise<MakeupStyle[]> => {
  return Promise.resolve(makeupStylesMock.slice(0, limit));
};
