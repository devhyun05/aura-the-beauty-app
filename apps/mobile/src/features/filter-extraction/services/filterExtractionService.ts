import {filterExtractionMock} from '../mocks/filterExtraction.mock';
import type {FilterExtractionData} from '../types';

export const getFilterExtractionData = async (): Promise<FilterExtractionData> => {
  return Promise.resolve(filterExtractionMock);
};

export const getFilterExtractionDataSync = (): FilterExtractionData => filterExtractionMock;
