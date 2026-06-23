import {homeMock} from '../mocks/home.mock';
import type {HomeData} from '../types';

export const getHomeData = async (): Promise<HomeData> => {
  return Promise.resolve(homeMock);
};
