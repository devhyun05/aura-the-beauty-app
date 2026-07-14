import * as FileSystem from 'expo-file-system/legacy';

import {buildFaceGeometryEvidenceRecord} from './faceGeometryEvidenceRecord';
import type {FaceGeometryResult} from '../types';

// 2D face-geometry 실기기 증적 로거 (A0) — face3DRuntimeEvidenceLogger 패턴 승계.
// __DEV__ 전용, documentDirectory/face-geometry-runtime-evidence/analysis-log.jsonl 에
// append. 순수 record 는 faceGeometryEvidenceRecord 에서 만든다.
const LOG_DIRECTORY_NAME = 'face-geometry-runtime-evidence';
const LOG_FILE_NAME = 'analysis-log.jsonl';

let appendChain: Promise<unknown> = Promise.resolve();

function getLogFileUri() {
  if (!FileSystem.documentDirectory) {
    throw new Error('Document directory is unavailable for face-geometry runtime evidence.');
  }

  const directoryUri = `${FileSystem.documentDirectory}${LOG_DIRECTORY_NAME}/`;
  return {
    directoryUri,
    fileUri: `${directoryUri}${LOG_FILE_NAME}`,
  };
}

async function readExistingLog(fileUri: string) {
  try {
    return await FileSystem.readAsStringAsync(fileUri);
  } catch {
    return '';
  }
}

async function appendNow(result: FaceGeometryResult) {
  if (!__DEV__) {
    return null;
  }

  const {directoryUri, fileUri} = getLogFileUri();
  const entry = {
    ...buildFaceGeometryEvidenceRecord(result),
    recordedAtUtc: new Date().toISOString(),
  };
  const previousLog = await readExistingLog(fileUri);

  await FileSystem.makeDirectoryAsync(directoryUri, {intermediates: true});
  await FileSystem.writeAsStringAsync(
    fileUri,
    `${previousLog}${JSON.stringify(entry)}\n`,
  );

  return fileUri;
}

export function appendFaceGeometryRuntimeEvidence(result: FaceGeometryResult) {
  const nextAppend = appendChain.then(() => appendNow(result));
  appendChain = nextAppend.catch(error => {
    console.info('[aura:face-geometry] evidence-write-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  return nextAppend;
}
