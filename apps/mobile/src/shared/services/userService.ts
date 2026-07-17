import * as SecureStore from './localSecureStore';
import type {ImageSourcePropType} from 'react-native';

import {profileEditFieldsMock} from '../mocks/user.mock';
import type {BeautyProfile, ProfileEditField, UserProfile} from '../types/profile';
import {getBackendApiBaseUrl, requestBackendJson} from './backendApi';

const USER_PROFILE_STORAGE_KEY = 'aura.user.profile.v2';
const HIDDEN_PROFILE_EDIT_FIELD_IDS = new Set(['phone', 'interest']);
const DEV_BACKEND_PROFILE_PLACEHOLDER_VALUES = new Set(['Local Dev', 'dev@example.com']);

type StoredUserProfile = Omit<UserProfile, 'avatarSource'> & {
  avatarUri?: string | null;
};

type BackendMediaAsset = {
  cdnUrl?: string | null;
  id?: string | null;
};

type BackendUser = {
  avatarMedia?: BackendMediaAsset | null;
  avatarMediaId?: string | null;
  avatarUrl?: string | null;
  avatar_media?: BackendMediaAsset | null;
  avatar_media_id?: string | null;
  avatar_url?: string | null;
  birthDate?: string | null;
  birth_date?: string | null;
  email?: string | null;
  gender?: string | null;
  id?: string | null;
  interest?: string | null;
  name?: string | null;
  nickname?: string | null;
  phone?: string | null;
  personalColor?: string | null;
  personal_color?: string | null;
  skinTone?: string | null;
  skin_tone?: string | null;
  skinType?: string | null;
  skin_type?: string | null;
  tags?: string[] | null;
};

type BackendUserResponse = {
  user?: BackendUser | null;
};

const EMPTY_USER_PROFILE: UserProfile = {
  id: '',
  name: '',
  nickname: '',
  phone: '',
  email: '',
  birthDate: '',
  gender: '',
  interest: '',
};

const EMPTY_BEAUTY_PROFILE: BeautyProfile = {
  personalColor: '',
  skinType: '',
  skinTone: '',
  tags: [],
};

let currentUserProfile: UserProfile = {...EMPTY_USER_PROFILE};
let currentBeautyProfile: BeautyProfile = {...EMPTY_BEAUTY_PROFILE};

function mapBackendGenderToProfile(gender: string | null | undefined): string | undefined {
  switch (gender) {
    case 'female':
      return '여성';
    case 'male':
      return '남성';
    case 'other':
    case 'unknown':
      return '선택 안 함';
    default:
      return gender ?? undefined;
  }
}

function mapProfileGenderToBackend(gender: string | null | undefined): string | null {
  switch (gender) {
    case '여성':
      return 'female';
    case '남성':
      return 'male';
    case '선택 안 함':
      return 'unknown';
    default:
      return gender?.trim() || null;
  }
}

function resolveProfileText(value: string, defaultValue: string) {
  const normalized = value.trim();

  if (!normalized || DEV_BACKEND_PROFILE_PLACEHOLDER_VALUES.has(normalized)) {
    return defaultValue;
  }

  return normalized;
}

function resolveBackendProfileText(
  backendValue: string | null | undefined,
  fallbackValue: string,
  defaultValue: string,
) {
  const normalized = backendValue?.trim();
  const fallbackText = resolveProfileText(fallbackValue, defaultValue);

  if (!normalized || DEV_BACKEND_PROFILE_PLACEHOLDER_VALUES.has(normalized)) {
    return fallbackText;
  }

  return normalized;
}

function mapBackendUserToProfile(
  backendUser: BackendUser,
  fallbackProfile: UserProfile,
): UserProfile {
  const avatarMedia = backendUser.avatarMedia ?? backendUser.avatar_media;
  const avatarUri =
    backendUser.avatarUrl ??
    backendUser.avatar_url ??
    avatarMedia?.cdnUrl ??
    null;
  const avatarMediaId =
    backendUser.avatarMediaId ??
    backendUser.avatar_media_id ??
    avatarMedia?.id ??
    fallbackProfile.avatarMediaId ??
    null;

  return {
    ...fallbackProfile,
    avatarMediaId,
    avatarSource: avatarUri ? {uri: avatarUri} : fallbackProfile.avatarSource,
    birthDate:
      backendUser.birthDate ??
      backendUser.birth_date ??
      fallbackProfile.birthDate,
    email: resolveBackendProfileText(backendUser.email, fallbackProfile.email, ''),
    gender: mapBackendGenderToProfile(backendUser.gender) ?? fallbackProfile.gender,
    id: backendUser.id ?? fallbackProfile.id,
    interest: backendUser.interest ?? fallbackProfile.interest,
    name: resolveBackendProfileText(backendUser.name, fallbackProfile.name, ''),
    nickname: resolveBackendProfileText(backendUser.nickname, fallbackProfile.nickname, ''),
    phone: backendUser.phone ?? fallbackProfile.phone,
  };
}

function mapBackendUserToBeautyProfile(
  backendUser: BackendUser,
  fallbackProfile: BeautyProfile,
): BeautyProfile {
  return {
    personalColor:
      backendUser.personalColor ??
      backendUser.personal_color ??
      fallbackProfile.personalColor,
    skinTone:
      backendUser.skinTone ??
      backendUser.skin_tone ??
      fallbackProfile.skinTone,
    skinType:
      backendUser.skinType ??
      backendUser.skin_type ??
      fallbackProfile.skinType,
    tags: backendUser.tags ?? fallbackProfile.tags,
  };
}

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
      value: getProfileFieldValue(profile, field.id),
    }));
}

export function getUserProfileAvatarUri(profile: Pick<UserProfile, 'avatarSource'>): string | null {
  return getAvatarUri(profile.avatarSource);
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

async function fetchBackendUserProfile(
  fallbackProfile: UserProfile,
  timeoutMs?: number,
): Promise<UserProfile | null> {
  if (!getBackendApiBaseUrl()) {
    return null;
  }

  const {user} = await requestBackendJson<BackendUserResponse>('/users/me', {
    timeoutMs,
  });

  if (!user) {
    return null;
  }

  currentBeautyProfile = mapBackendUserToBeautyProfile(user, currentBeautyProfile);
  return mapBackendUserToProfile(user, fallbackProfile);
}

async function updateBackendUserProfile(
  profile: UserProfile,
): Promise<UserProfile | null> {
  if (!getBackendApiBaseUrl()) {
    return null;
  }

  const body: {
    avatarMediaId?: string | null;
    birthDate: string | null;
    gender: string | null;
    interest: string | null;
    nickname: string | null;
    phone: string | null;
  } = {
    birthDate: profile.birthDate || null,
    gender: mapProfileGenderToBackend(profile.gender),
    interest: profile.interest || null,
    nickname: profile.nickname || null,
    phone: profile.phone || null,
  };

  if (profile.avatarMediaId !== undefined) {
    body.avatarMediaId = profile.avatarMediaId;
  }

  const {user} = await requestBackendJson<BackendUserResponse>('/users/me/profile', {
    body,
    method: 'PATCH',
  });

  return user ? mapBackendUserToProfile(user, profile) : null;
}

export const getUserProfile = async (
  options: {cacheOnly?: boolean; timeoutMs?: number} = {},
): Promise<UserProfile> => {
  const storedProfile = await readStoredUserProfile();

  if (storedProfile) {
    currentUserProfile = storedProfile;
  }

  if (options.cacheOnly) {
    return currentUserProfile;
  }

  try {
    const backendProfile = await fetchBackendUserProfile(
      currentUserProfile,
      options.timeoutMs,
    );

    if (backendProfile) {
      currentUserProfile = backendProfile;
      await writeStoredUserProfile(currentUserProfile);
    }
  } catch {
    // Keep the locally cached profile usable when backend auth/network is unavailable.
  }

  return currentUserProfile;
};

export const updateUserProfile = async (
  profile: UserProfile,
): Promise<UserProfile> => {
  const nextProfile = {
    ...profile,
    avatarSource: profile.avatarSource ?? currentUserProfile.avatarSource,
  };
  const backendProfile = await updateBackendUserProfile(nextProfile);

  currentUserProfile = backendProfile ?? nextProfile;
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

export async function clearCachedUserProfile(): Promise<void> {
  currentUserProfile = {...EMPTY_USER_PROFILE};
  currentBeautyProfile = {
    ...EMPTY_BEAUTY_PROFILE,
    tags: [],
  };
  await SecureStore.deleteItemAsync(USER_PROFILE_STORAGE_KEY);
}

export const getProfileEditFields = async (): Promise<ProfileEditField[]> => {
  const profile = await getUserProfile();

  return getProfileEditFieldsForProfile(profile);
};
