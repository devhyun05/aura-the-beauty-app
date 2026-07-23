import * as SecureStore from '../../../shared/services/localSecureStore';

import type {AuthUser} from '../types';

const PROFILE_SETUP_COMPLETION_STORAGE_KEY = 'aura.profile.setup.completed.v1';

type ProfileSetupCompletionMap = Record<string, true>;

function getProfileSetupCompletionKey(user: AuthUser): string {
  return user.id || user.email?.trim().toLowerCase() || 'unknown-user';
}

async function readProfileSetupCompletionMap(): Promise<ProfileSetupCompletionMap> {
  const storedValue = await SecureStore.getItemAsync(PROFILE_SETUP_COMPLETION_STORAGE_KEY);

  if (!storedValue) {
    return {};
  }

  try {
    return JSON.parse(storedValue) as ProfileSetupCompletionMap;
  } catch {
    return {};
  }
}

async function writeProfileSetupCompletionMap(completionMap: ProfileSetupCompletionMap) {
  await SecureStore.setItemAsync(
    PROFILE_SETUP_COMPLETION_STORAGE_KEY,
    JSON.stringify(completionMap),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

export async function hasCompletedProfileSetup(user: AuthUser): Promise<boolean> {
  if (user.profileCompleted) {
    return true;
  }

  const completionMap = await readProfileSetupCompletionMap();

  return completionMap[getProfileSetupCompletionKey(user)] === true;
}

export async function markProfileSetupCompleted(user: AuthUser): Promise<void> {
  const completionMap = await readProfileSetupCompletionMap();
  completionMap[getProfileSetupCompletionKey(user)] = true;
  await writeProfileSetupCompletionMap(completionMap);
}

export async function clearProfileSetupCompletion(user: AuthUser): Promise<void> {
  const completionMap = await readProfileSetupCompletionMap();
  delete completionMap[getProfileSetupCompletionKey(user)];

  if (Object.keys(completionMap).length === 0) {
    await SecureStore.deleteItemAsync(PROFILE_SETUP_COMPLETION_STORAGE_KEY);
    return;
  }

  await writeProfileSetupCompletionMap(completionMap);
}
