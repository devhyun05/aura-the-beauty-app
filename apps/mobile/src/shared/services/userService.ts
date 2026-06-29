import * as SecureStore from 'expo-secure-store';
import type {ImageSourcePropType} from 'react-native';

import {beautyProfileMock, profileEditFieldsMock, userProfileMock} from '../mocks/user.mock';
import type {BeautyProfile, ProfileEditField, UserProfile} from '../types/profile';

const USER_PROFILE_STORAGE_KEY = 'aura.user.profile.v1';
const HIDDEN_PROFILE_EDIT_FIELD_IDS = new Set(['phone', 'interest']);

type StoredUserProfile = Omit<UserProfile, 'avatarSource'> & {
  avatarUri?: string | null;
};

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
  return profileEditFieldsMock
    .filter((field) => !HIDDEN_PROFILE_EDIT_FIELD_IDS.has(field.id))
    .map((field) => ({
      ...field,
      value: getProfileFieldValue(profile, field.id) || field.value,
    }));
}

function getAvatarUri(source: ImageSourcePropType | undefined) {
  if (!source || typeof source === 'number') {
    return null;
  }

  const sources = Array.isArray(source) ? source : [source];
  const uriSource = sources.find(
    (entry) => typeof entry.uri === 'string' && entry.uri.length > 0,
  );

  return uriSource?.uri ?? null;
}

function toStoredUserProfile(profile: UserProfile): StoredUserProfile {
  const {avatarSource, ...storedProfile} = profile;

  return {
    ...storedProfile,
    avatarUri: getAvatarUri(avatarSource),
  };
}

function mergeStoredUserProfile(storedProfile: StoredUserProfile): UserProfile {
  const {avatarUri, ...profileFields} = storedProfile;

  return {
    ...currentUserProfile,
    ...profileFields,
    avatarSource: avatarUri ? {uri: avatarUri} : currentUserProfile.avatarSource,
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
