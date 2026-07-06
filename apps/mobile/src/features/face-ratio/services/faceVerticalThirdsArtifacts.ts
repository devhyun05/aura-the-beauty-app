import * as FileSystem from 'expo-file-system/legacy';

import type {FaceVerticalThirdsResult} from '../types';
import {getFaceRatioSessionDirUri} from './faceVerticalThirdsLogger';

const SOURCE_IMAGE_FILE_NAME = 'source.jpg';
const OVERLAY_IMAGE_FILE_NAME = 'overlay.png';
const RESULT_FILE_NAME = 'result.json';

async function ensureSessionDirectory(sessionId: string) {
  const directoryUri = getFaceRatioSessionDirUri(sessionId);

  if (!directoryUri) {
    return null;
  }

  await FileSystem.makeDirectoryAsync(directoryUri, {intermediates: true});

  return directoryUri;
}

export function getFaceVerticalThirdsResultJsonUri(sessionId: string) {
  const directoryUri = getFaceRatioSessionDirUri(sessionId);

  return directoryUri ? `${directoryUri}${RESULT_FILE_NAME}` : null;
}

export async function saveSourceImage(sessionId: string, sourceUri: string) {
  const directoryUri = await ensureSessionDirectory(sessionId);

  if (!directoryUri) {
    return sourceUri;
  }

  const fileUri = `${directoryUri}${SOURCE_IMAGE_FILE_NAME}`;
  await FileSystem.copyAsync({from: sourceUri, to: fileUri});

  return fileUri;
}

export async function saveOverlayImage(sessionId: string, tmpUri: string) {
  const directoryUri = await ensureSessionDirectory(sessionId);

  if (!directoryUri) {
    return tmpUri;
  }

  const fileUri = `${directoryUri}${OVERLAY_IMAGE_FILE_NAME}`;
  await FileSystem.copyAsync({from: tmpUri, to: fileUri});

  return fileUri;
}

export async function saveHairlineDebugArtifacts(
  sessionId: string,
  uris?: {
    hairMatteUri?: string;
    hairlineDebugUri?: string;
    skinMatteUri?: string;
  },
) {
  const directoryUri = await ensureSessionDirectory(sessionId);

  if (!directoryUri || !uris) {
    return {};
  }

  const artifacts: FaceVerticalThirdsResult['artifacts'] = {};

  if (uris.hairMatteUri) {
    artifacts.appleHairMatteUri = `${directoryUri}apple-hair-matte.png`;
    await FileSystem.copyAsync({from: uris.hairMatteUri, to: artifacts.appleHairMatteUri});
  }

  if (uris.skinMatteUri) {
    artifacts.appleSkinMatteUri = `${directoryUri}apple-skin-matte.png`;
    await FileSystem.copyAsync({from: uris.skinMatteUri, to: artifacts.appleSkinMatteUri});
  }

  if (uris.hairlineDebugUri) {
    artifacts.hairlineDebugUri = `${directoryUri}hairline-debug.png`;
    await FileSystem.copyAsync({from: uris.hairlineDebugUri, to: artifacts.hairlineDebugUri});
  }

  return artifacts;
}

export async function writeResultJson(result: FaceVerticalThirdsResult) {
  const directoryUri = await ensureSessionDirectory(result.sessionId);

  if (!directoryUri) {
    return null;
  }

  const fileUri = `${directoryUri}${RESULT_FILE_NAME}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(result, null, 2));

  return fileUri;
}
