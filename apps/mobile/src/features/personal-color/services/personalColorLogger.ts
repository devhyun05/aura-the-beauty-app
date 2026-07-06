// 분석 이벤트 JSONL 로거. face-vertical-thirds 로거 패턴: __DEV__에서만 파일 persist,
// 항상 console.info. 프로덕션은 온디바이스 소음/저장 최소화.

import * as FileSystem from 'expo-file-system/legacy';

import { getPersonalColorSessionDirUri } from './personalColorArtifacts';

const LOG_FILE_NAME = 'analysis-log.jsonl';

export type PersonalColorLogEntry = {
  tag: string;
  event: string;
  sessionId: string;
  ts: string;
  [key: string]: unknown;
};

export type PersonalColorLogger = {
  log: (event: string, payload?: Record<string, unknown>) => void;
  logFileUri: string | null;
};

export function createPersonalColorLogger(sessionId: string, nowIso: string): PersonalColorLogger {
  const directoryUri = getPersonalColorSessionDirUri(sessionId);
  const fileUri = directoryUri ? `${directoryUri}${LOG_FILE_NAME}` : null;
  let chain: Promise<void> = Promise.resolve();

  const log = (event: string, payload: Record<string, unknown> = {}) => {
    const entry: PersonalColorLogEntry = {
      tag: 'aura:personal-color',
      event,
      sessionId,
      ...payload,
      ts: nowIso,
    };
    // eslint-disable-next-line no-console
    console.info('[aura:personal-color]', entry);

    if (!__DEV__ || !directoryUri || !fileUri) {
      return;
    }
    chain = chain
      .then(async () => {
        let previous = '';
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists) {
          previous = await FileSystem.readAsStringAsync(fileUri);
        } else {
          await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
        }
        await FileSystem.writeAsStringAsync(fileUri, `${previous}${JSON.stringify(entry)}\n`);
      })
      .catch(() => {
        // 로깅 실패는 분석을 막지 않는다
      });
  };

  return { log, logFileUri: fileUri };
}
