import {beautyProfileMock, profileEditFieldsMock, userProfileMock} from '../mocks/user.mock';
import type {BeautyProfile, ProfileEditField, UserProfile} from '../types/profile';

export const getUserProfile = async (): Promise<UserProfile> => {
  return Promise.resolve(userProfileMock);
};

export const updateUserProfile = async (
  profile: UserProfile,
): Promise<UserProfile> => {
  return Promise.resolve(profile);
};

export const getBeautyProfile = async (): Promise<BeautyProfile> => {
  return Promise.resolve(beautyProfileMock);
};

export const updateBeautyProfile = async (
  beautyProfile: BeautyProfile,
): Promise<BeautyProfile> => {
  return Promise.resolve(beautyProfile);
};

export const getProfileEditFields = async (): Promise<ProfileEditField[]> => {
  return Promise.resolve(profileEditFieldsMock);
};
