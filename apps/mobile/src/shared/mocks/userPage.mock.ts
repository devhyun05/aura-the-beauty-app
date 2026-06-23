import { analysisMock } from './analysis.mock';
import { makeupLooksMock } from './makeupLooks.mock';
import { productsMock } from './products.mock';
import { userProfileMock } from './user.mock';
import type { UserPageData } from '../types/userPage';

export const userPageMock: UserPageData = {
  profile: userProfileMock,
  reports: analysisMock.slice(0, 3),
  makeupStyles: makeupLooksMock,
  favoriteProducts: productsMock,
};
