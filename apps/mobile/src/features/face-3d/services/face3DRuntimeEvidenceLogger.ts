import * as FileSystem from 'expo-file-system/legacy';

import {
  adaptFace3DRuntimeEvidence,
  type Face3DRuntimeEvidenceInput,
} from './face3DUnifiedEvidenceAdapter';

const LOG_DIRECTORY_NAME = 'face3d-runtime-evidence';
const LOG_FILE_NAME = 'events.jsonl';

let appendChain: Promise<unknown> = Promise.resolve();

function getLogFileUri() {
  if (!FileSystem.documentDirectory) {
    throw new Error('Document directory is unavailable for Face3D runtime evidence.');
  }

  const directoryUri = `${FileSystem.documentDirectory}${LOG_DIRECTORY_NAME}/`;
  return {
    directoryUri,
    fileUri: `${directoryUri}${LOG_FILE_NAME}`,
  };
}

async function readExistingLog(fileUri: string) {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    return '';
  }
  return FileSystem.readAsStringAsync(fileUri);
}

async function appendNow(input: Face3DRuntimeEvidenceInput) {
  if (!__DEV__) {
    return null;
  }

  const {directoryUri, fileUri} = getLogFileUri();
  const adapted = adaptFace3DRuntimeEvidence(input);
  const entry = {
    event: adapted.event,
    rawFaceDataIncluded: false,
    recordedAtUtc: new Date().toISOString(),
    schemaVersion: 'aura.face3d-runtime-evidence.v1',
    ...(adapted.unifiedCapture
      ? {unifiedCapture: adapted.unifiedCapture}
      : {}),
  };
  const previousLog = await readExistingLog(fileUri);

  await FileSystem.makeDirectoryAsync(directoryUri, {intermediates: true});
  await FileSystem.writeAsStringAsync(
    fileUri,
    `${previousLog}${JSON.stringify(entry)}\n`,
  );

  return fileUri;
}

export function appendFace3DRuntimeEvidence(input: Face3DRuntimeEvidenceInput) {
  const nextAppend = appendChain.then(() => appendNow(input));
  appendChain = nextAppend.catch(error => {
    console.info('[aura:face3d] evidence-write-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  return nextAppend;
}

export async function readFace3DRuntimeEvidenceLog() {
  if (!__DEV__) {
    throw new Error(
      'Face3D runtime evidence is available only in local development builds.',
    );
  }
  const {fileUri} = getLogFileUri();
  return readExistingLog(fileUri);
}

export async function drainFace3DRuntimeEvidenceWrites() {
  // A stale mounted instance can enqueue another append while this barrier is
  // already waiting. Drain until the observed tail is still the current tail.
  for (;;) {
    const observedTail = appendChain;
    await observedTail;
    if (observedTail === appendChain) {
      return;
    }
  }
}

export async function readFace3DRuntimeEvidenceLogAfterPendingWrites() {
  await drainFace3DRuntimeEvidenceWrites();
  return readFace3DRuntimeEvidenceLog();
}
