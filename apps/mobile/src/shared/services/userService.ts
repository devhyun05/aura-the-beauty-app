import * as SecureStore from 'expo-secure-store';

import {beautyProfileMock, profileEditFieldsMock, userProfileMock} from '../mocks/user.mock';
import type {BeautyProfile, ProfileEditField, UserProfile} from '../types/profile';

const USER_PROFILE_STORAGE_KEY = 'aura.user.profile.v1';

type StoredUserProfile = Omit<UserProfile, 'avatarSource'>;

let currentUserProfile: UserProfile = userProfileMock;
let currentBeautyProfile: BeautyProfile = beautyProfileMock;

function getProfileFieldValue(profile: UserProfile, fieldId: string) {
  switch (fieldId) {
    case 'name':
      return profile.name;
    case 'nickname':
      return profile.nickname;
    case 'phone':
      return profile.phone;
    case 'email':
      return profile.email;
    case 'birthDate':
      return profile.birthDate;
    case 'gender':
      return profile.gender;
    case 'interest':
      return profile.interest;
    default:
      return '';
  }
}

function getProfileEditFieldsForProfile(profile: UserProfile): ProfileEditField[] {
  return profileEditFieldsMock.map((field) => ({
    ...field,
    value: getProfileFieldValue(profile, field.id) || field.value,
  }));
}

function toStoredUserProfile(profile: UserProfile): StoredUserProfile {
  const {avatarSource: _avatarSource, ...storedProfile} = profile;

  return storedProfile;
}

function mergeStoredUserProfile(storedProfile: StoredUserProfile): UserProfile {
  return {
    ...currentUserProfile,
    ...storedProfile,
    avatarSource: currentUserProfile.avatarSource,
  };
}

async function readStoredUserProfile(): Promise<UserProfile | null> {
  const storedValue = await SecureStore.getItemAsync(USER_PROFILE_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return mergeStoredUserProfile(JSON.parse(storedValue) as StoredUserProfile);
  } catch {
    return null;
  }
}

async function writeStoredUserProfile(profile: UserProfile): Promise<void> {
  await SecureStore.setItemAsync(
    USER_PROFILE_STORAGE_KEY,
    JSON.stringify(toStoredUserProfile(profile)),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

export const getUserProfile = async (): Promise<UserProfile> => {
  const storedProfile = await readStoredUserProfile();

  if (storedProfile) {
    currentUserProfile = storedProfile;
  }

  return currentUserProfile;
};

export const updateUserProfile = async (
  profile: UserProfile,
): Promise<UserProfile> => {
  currentUserProfile = {
    ...profile,
    avatarSource: profile.avatarSource ?? currentUserProfile.avatarSource,
  };
  await writeStoredUserProfile(currentUserProfile);

  return currentUserProfile;
};

export const getBeautyProfile = async (): Promise<BeautyProfile> => {
  return Promise.resolve(currentBeautyProfile);
};

export const updateBeautyProfile = async (
  beautyProfile: BeautyProfile,
): Promise<BeautyProfile> => {
  currentBeautyProfile = beautyProfile;

  return Promise.resolve(currentBeautyProfile);
};

export const getProfileEditFields = async (): Promise<ProfileEditField[]> => {
  const profile = await getUserProfile();

  return getProfileEditFieldsForProfile(profile);
};
