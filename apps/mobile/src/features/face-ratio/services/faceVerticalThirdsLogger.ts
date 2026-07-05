import * as FileSystem from 'expo-file-system/legacy';

const LOG_TAG = '[aura:face-ratio]';
const ROOT_DIRECTORY_NAME = 'face-vertical-thirds';
const LOG_FILE_NAME = 'analysis-log.jsonl';

export type FaceRatioLogger = {
  log: (event: string, payload?: Record<string, unknown>) => Promise<string | null>;
  logFileUri: string | null;
};

export function getFaceRatioSessionDirUri(sessionId: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}${ROOT_DIRECTORY_NAME}/${sessionId}/`;
}

async function readExistingLog(fileUri: string) {
  try {
    return await FileSystem.readAsStringAsync(fileUri);
  } catch {
    return '';
  }
}

export function createFaceRatioLogger(sessionId: string): FaceRatioLogger {
  const directoryUri = getFaceRatioSessionDirUri(sessionId);
  const fileUri = directoryUri ? `${directoryUri}${LOG_FILE_NAME}` : null;
  let appendChain: Promise<unknown> = Promise.resolve();

  async function appendNow(event: string, payload: Record<string, unknown>) {
    const entry = {
      tag: LOG_TAG,
      event,
      sessionId,
      ...payload,
      ts: new Date().toISOString(),
    };

    console.info(LOG_TAG, event, payload);

    // 프로덕션 빌드에서는 기기에 세션별 JSONL이 쌓이지 않도록 파일 쓰기를 생략한다.
    if (!__DEV__ || !directoryUri || !fileUri) {
      return null;
    }

    const previousLog = await readExistingLog(fileUri);
    const nextLog = `${previousLog}${JSON.stringify(entry)}\n`;

    await FileSystem.makeDirectoryAsync(directoryUri, {intermediates: true});
    await FileSystem.writeAsStringAsync(fileUri, nextLog);

    return fileUri;
  }

  return {
    log(event, payload = {}) {
      const nextAppend = appendChain.then(() =>
        appendNow(event, payload).catch(error => {
          console.info(LOG_TAG, 'log-write:error', {
            event,
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        }),
      );
      appendChain = nextAppend;

      return nextAppend;
    },
    logFileUri: fileUri,
  };
}
