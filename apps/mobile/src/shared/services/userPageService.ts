import { userPageMock } from '../mocks/userPage.mock';
import type { UserPageData } from '../types/userPage';

export const getUserPageData = async (): Promise<UserPageData> => {
  return Promise.resolve(userPageMock);
};
