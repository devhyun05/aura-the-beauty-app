import {getMyPageProfileSummary} from '../../../shared/services/profileService';
import type {ProfileScreenData} from './profileLoadState';

export const loadProfileScreenData = async (): Promise<ProfileScreenData> => {
  return getMyPageProfileSummary();
};
