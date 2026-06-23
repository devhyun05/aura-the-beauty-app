import {profileEditFieldsMock, userProfileMock} from '../mocks/user.mock';
import type {ProfileEditField, UserProfile} from '../types/userPage';

export const getUserProfile = async (): Promise<UserProfile> => {
  return Promise.resolve(userProfileMock);
};

export const getProfileEditFields = async (): Promise<ProfileEditField[]> => {
  return Promise.resolve(profileEditFieldsMock);
};
