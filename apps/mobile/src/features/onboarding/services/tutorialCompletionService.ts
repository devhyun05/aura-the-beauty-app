import * as SecureStore from 'expo-secure-store';

import type {AuthUser} from '../../auth/types';

const FACE_CAPTURE_TUTORIAL_COMPLETION_STORAGE_KEY =
  'aura.face.capture.tutorial.completed.v1';

type FaceCaptureTutorialCompletionMap = Record<string, true>;

function getFaceCaptureTutorialCompletionKey(user: AuthUser): string {
  return user.email?.trim().toLowerCase() || user.id;
}

async function readFaceCaptureTutorialCompletionMap(): Promise<FaceCaptureTutorialCompletionMap> {
  const storedValue = await SecureStore.getItemAsync(
    FACE_CAPTURE_TUTORIAL_COMPLETION_STORAGE_KEY,
  );

  if (!storedValue) {
    return {};
  }

  try {
    return JSON.parse(storedValue) as FaceCaptureTutorialCompletionMap;
  } catch {
    return {};
  }
}

async function writeFaceCaptureTutorialCompletionMap(
  completionMap: FaceCaptureTutorialCompletionMap,
) {
  await SecureStore.setItemAsync(
    FACE_CAPTURE_TUTORIAL_COMPLETION_STORAGE_KEY,
    JSON.stringify(completionMap),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

export async function hasCompletedFaceCaptureTutorial(
  user: AuthUser,
): Promise<boolean> {
  const completionMap = await readFaceCaptureTutorialCompletionMap();

  return completionMap[getFaceCaptureTutorialCompletionKey(user)] === true;
}

export async function markFaceCaptureTutorialCompleted(
  user: AuthUser,
): Promise<void> {
  const completionMap = await readFaceCaptureTutorialCompletionMap();
  completionMap[getFaceCaptureTutorialCompletionKey(user)] = true;
  await writeFaceCaptureTutorialCompletionMap(completionMap);
}
