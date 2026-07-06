import * as FileSystem from 'expo-file-system/legacy';

import type {FaceCaptureGreenlightReport} from './faceCaptureGreenlight';

const LOG_DIRECTORY_NAME = 'face-capture-lab-greenlight';
const LOG_FILE_NAME = 'events.jsonl';

export type FaceCaptureGreenlightLogInput = {
  imageUri: string;
  report: FaceCaptureGreenlightReport;
};

let appendChain: Promise<unknown> = Promise.resolve();

function getLogFileUri() {
  if (!FileSystem.documentDirectory) {
    throw new Error('Document directory is unavailable for greenlight logs.');
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

async function appendGreenlightEventNow({
  imageUri,
  report,
}: FaceCaptureGreenlightLogInput) {
  const {directoryUri, fileUri} = getLogFileUri();
  const event = {
    cameraStabilityGreenlight: report.cameraStabilityGreenlight,
    failureReasons: report.failureReasons,
    finalCaptureGreenlight: report.finalCaptureGreenlight,
    imageUri,
    mediaPipeAlignmentGreenlight: report.mediaPipeAlignmentGreenlight,
    metrics: report.metrics,
    nativeCameraMetadata: report.nativeCameraMetadata,
    timestamp: new Date().toISOString(),
  };
  const previousLog = await readExistingLog(fileUri);
  const nextLog = `${previousLog}${JSON.stringify(event)}\n`;

  await FileSystem.makeDirectoryAsync(directoryUri, {intermediates: true});
  await FileSystem.writeAsStringAsync(fileUri, nextLog);

  console.info('[aura:face-capture-greenlight]', event);

  return fileUri;
}

export function appendGreenlightEvent(input: FaceCaptureGreenlightLogInput) {
  const nextAppend = appendChain.then(() => appendGreenlightEventNow(input));
  appendChain = nextAppend.catch(() => undefined);

  return nextAppend;
}
