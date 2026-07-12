// 온디바이스 아티팩트 (expo-file-system/legacy). documentDirectory/personal-color/<sessionId>/.
// 프라이버시: source.jpg는 스와치 오버레이 확정 후 삭제(longTermRawFrameStored:false).

import * as FileSystem from 'expo-file-system/legacy';

import type { AuraPersonalColorResult } from './personalColorCore/contracts';

const ROOT_DIRECTORY_NAME = 'personal-color';
const SOURCE_FILE_NAME = 'source.jpg';
const SWATCH_FILE_NAME = 'swatch-strip.png';
const RESULT_FILE_NAME = 'personalColorResult.json';

export function getPersonalColorSessionDirUri(sessionId: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }
  return `${FileSystem.documentDirectory}${ROOT_DIRECTORY_NAME}/${sessionId}/`;
}

export async function ensureSessionDirectory(sessionId: string): Promise<string | null> {
  const directoryUri = getPersonalColorSessionDirUri(sessionId);
  if (!directoryUri) {
    return null;
  }
  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  return directoryUri;
}

export async function saveSourceImage(sessionId: string, sourceUri: string): Promise<string | null> {
  const directoryUri = await ensureSessionDirectory(sessionId);
  if (!directoryUri) {
    return null;
  }
  const fileUri = `${directoryUri}${SOURCE_FILE_NAME}`;
  await FileSystem.copyAsync({ from: sourceUri, to: fileUri });
  return fileUri;
}

export async function saveSwatchStrip(sessionId: string, tmpPngUri: string): Promise<string | null> {
  const directoryUri = await ensureSessionDirectory(sessionId);
  if (!directoryUri) {
    return null;
  }
  const fileUri = `${directoryUri}${SWATCH_FILE_NAME}`;
  await FileSystem.copyAsync({ from: tmpPngUri, to: fileUri });
  return fileUri;
}

export function getPersonalColorResultJsonUri(sessionId: string): string | null {
  const directoryUri = getPersonalColorSessionDirUri(sessionId);
  return directoryUri ? `${directoryUri}${RESULT_FILE_NAME}` : null;
}

// 저장 결과의 조명 보정 provenance. 프로덕션은 로그 파일을 쓰지 않으므로, 복원
// 후에도 이 결과가 보정본인지/어떤 신뢰도였는지 알 수 있게 결과 JSON 에 함께
// 남긴다(코덱스 #246-1). AuraPersonalColorResult 타입은 건드리지 않고 sibling 키로 붙인다.
export type PersonalColorResultProvenance = {
  illuminationCorrected: boolean;
  illuminationSource: string | null;
  illuminationConfidence: number;
};

export async function writeResultJson(
  sessionId: string,
  result: AuraPersonalColorResult,
  provenance?: PersonalColorResultProvenance,
): Promise<string | null> {
  const directoryUri = await ensureSessionDirectory(sessionId);
  if (!directoryUri) {
    return null;
  }
  const fileUri = `${directoryUri}${RESULT_FILE_NAME}`;
  const payload = provenance
    ? { ...result, illuminationCorrection: provenance }
    : result;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2));
  return fileUri;
}

// longTermRawFrameStored:false 이행 — 오버레이 확정 후 원본 프레임 삭제
export async function deleteSourceImage(sessionId: string): Promise<void> {
  const directoryUri = getPersonalColorSessionDirUri(sessionId);
  if (!directoryUri) {
    return;
  }
  const fileUri = `${directoryUri}${SOURCE_FILE_NAME}`;
  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }
}

// "내 색상 데이터 삭제" — 세션 트리 전체 purge. sessionId 없으면 루트 전체.
export async function deletePersonalColorData(sessionId?: string): Promise<void> {
  if (!FileSystem.documentDirectory) {
    return;
  }
  const target = sessionId
    ? getPersonalColorSessionDirUri(sessionId)
    : `${FileSystem.documentDirectory}${ROOT_DIRECTORY_NAME}/`;
  if (!target) {
    return;
  }
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists) {
    await FileSystem.deleteAsync(target, { idempotent: true });
  }
}
