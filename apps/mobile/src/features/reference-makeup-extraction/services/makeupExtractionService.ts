import {referenceMakeupExtractionMock} from '../mocks/referenceMakeupExtraction.mock';
import type {ReferenceMakeupExtractionData} from '../types';

export const getReferenceMakeupExtractionData = async (): Promise<ReferenceMakeupExtractionData> => {
  return Promise.resolve(referenceMakeupExtractionMock);
};

export const getReferenceMakeupExtractionDataSync = (): ReferenceMakeupExtractionData => referenceMakeupExtractionMock;
