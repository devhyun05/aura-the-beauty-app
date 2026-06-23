import { userProfileMock } from '../mocks/user.mock';
import type { UserProfile } from '../types/userPage';

export const getUserProfile = async (): Promise<UserProfile> => {
  return Promise.resolve(userProfileMock);
};
